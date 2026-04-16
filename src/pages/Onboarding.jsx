import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { ensureDbUserRecord } from '@/lib/ensureDbUser'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership'

export default function Onboarding() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [formData, setFormData] = useState({
    business_name: '',
    currency: 'DOP',
    timezone: 'America/Santo_Domingo',
    first_product_name: '',
    first_product_price: '',
    first_product_cost: '',
  })

  const calculateMargin = () => {
    if (!formData.first_product_price || !formData.first_product_cost) return null
    const price = parseFloat(formData.first_product_price)
    const cost = parseFloat(formData.first_product_cost)
    return ((price - cost) / price) * 100
  }

  const margin = calculateMargin()

  const handleStep0 = () => {
    if (!formData.business_name.trim()) {
      setError('Por favor ingresa el nombre de tu negocio')
      return
    }
    setError(null)
    setStep(1)
  }

  const handleStep1 = () => {
    if (!formData.first_product_name.trim()) {
      setError('Por favor ingresa el nombre del producto')
      return
    }
    if (!formData.first_product_price || !formData.first_product_cost) {
      setError('Por favor ingresa precio y costo')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleSubmit = async () => {
    if (!user) {
      setError('Usuario no autenticado')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const price = parseFloat(formData.first_product_price)
      const cost = parseFloat(formData.first_product_cost)
      const marginPct = ((price - cost) / price) * 100

      // 1) Asegurar perfil base en users
      await ensureDbUserRecord({
        user,
        userProfile: {
          id: user.id,
          email: user.email,
          currency: formData.currency,
          timezone: formData.timezone,
          onboarding_completed: true,
          has_access: true,
          role: 'user',
          plan: 'free',
        },
      })

      // 2) Marcar onboarding completo en users (solo columnas compatibles)
      const updateUser = async (payload) => {
        const { error } = await supabase
          .from('users')
          .update(payload)
          .eq('id', user.id)
        if (error) throw error
      }

      try {
        await updateUser({
          currency: formData.currency,
          timezone: formData.timezone,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
      } catch (userError) {
        if (
          isMissingColumnError(userError, 'users.currency') ||
          isMissingColumnError(userError, 'currency') ||
          isMissingColumnError(userError, 'users.timezone') ||
          isMissingColumnError(userError, 'timezone') ||
          isMissingColumnError(userError, 'users.onboarding_completed') ||
          isMissingColumnError(userError, 'onboarding_completed')
        ) {
          await updateUser({ updated_at: new Date().toISOString() })
        } else {
          throw new Error(`Error actualizando usuario: ${userError.message}`)
        }
      }

      // 3) Guardar/actualizar configuración de negocio
      const configPayload = {
        user_id: user.id,
        created_by: (user.email || '').toLowerCase(),
        business_name: formData.business_name,
        currency: formData.currency,
        quarterly_goal: 0,
        target_margin_pct: 40,
        updated_at: new Date().toISOString(),
      }

      const upsertConfig = async (payload) => {
        const { error } = await supabase
          .from('business_config')
          .upsert(payload, { onConflict: 'user_id' })
        if (error) throw error
      }

      try {
        await upsertConfig(configPayload)
      } catch (configError) {
        if (
          isMissingColumnError(configError, 'business_config.user_id') ||
          isMissingColumnError(configError, 'user_id') ||
          isMissingColumnError(configError, 'business_config.created_by') ||
          isMissingColumnError(configError, 'created_by')
        ) {
          const legacy = { ...configPayload }
          delete legacy.user_id
          delete legacy.created_by
          const { error: retryError } = await supabase.from('business_config').insert({
            ...legacy,
            created_at: new Date().toISOString(),
          })
          if (retryError) throw retryError
        } else if (hasOwnerConstraintIssue(configError, 'business_config')) {
          const legacy = { ...configPayload }
          delete legacy.user_id
          const { error: retryError } = await supabase.from('business_config').insert({
            ...legacy,
            created_at: new Date().toISOString(),
          })
          if (retryError) throw retryError
        } else {
          throw configError
        }
      }

      // 4) Crear primer producto
      const productPayload = {
        user_id: user.id,
        created_by: (user.email || '').toLowerCase(),
        name: formData.first_product_name,
        sale_price: price,
        costo_unitario: cost,
        margin_pct: marginPct,
        current_stock: 0,
        status: 'active',
      }

      const { error: productError } = await supabase
        .from('products')
        .insert(productPayload)

      if (productError) {
        if (
          isMissingColumnError(productError, 'products.user_id') ||
          isMissingColumnError(productError, 'user_id') ||
          isMissingColumnError(productError, 'products.created_by') ||
          isMissingColumnError(productError, 'created_by')
        ) {
          const legacy = { ...productPayload }
          delete legacy.user_id
          delete legacy.created_by
          const { error: retryError } = await supabase.from('products').insert(legacy)
          if (retryError) throw new Error(`Error creando producto: ${retryError.message}`)
        } else if (hasOwnerConstraintIssue(productError, 'products')) {
          const legacy = { ...productPayload }
          delete legacy.user_id
          const { error: retryError } = await supabase.from('products').insert(legacy)
          if (retryError) throw new Error(`Error creando producto: ${retryError.message}`)
        } else {
          throw new Error(`Error creando producto: ${productError.message}`)
        }
      }

      // 3. Redirigir al dashboard
      setTimeout(() => {
        navigate('/Dashboard')
      }, 1500)
    } catch (err) {
      console.error('Onboarding error:', err)
      setError(err.message || 'Error completando onboarding')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-pink-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-md"
      >
        <AnimatePresence mode="wait">
          {/* STEP 0: Nombre del negocio */}
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 shadow-lg border border-pink-100"
            >
              <div className="text-center mb-6">
                <h1 className="text-3xl font-black text-gray-900">
                  Bienvenida a<br />
                  <span className="text-[#D45387]">CEO Rentable</span>
                </h1>
                <p className="text-gray-600 mt-2 text-sm">Configura tu negocio en 3 pasos</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ¿Cómo se llama tu negocio?
                  </label>
                  <Input
                    placeholder="Ej: Mi Tienda Online"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="h-12 border-2 border-gray-200 focus:border-[#D45387] focus:ring-0"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleStep0}
                  className="w-full h-12 bg-[#D45387] hover:bg-[#C03A76] text-white font-bold"
                >
                  Continuar <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 1: Primer producto */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 shadow-lg border border-pink-100"
            >
              <div className="text-center mb-6">
                <div className="w-10 h-10 rounded-full bg-[#D45387]/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg">2/3</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Tu primer producto</h2>
                <p className="text-gray-600 text-sm mt-1">Vamos a crear el primero juntos</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Nombre del producto
                  </label>
                  <Input
                    placeholder="Ej: Camiseta Premium"
                    value={formData.first_product_name}
                    onChange={(e) => setFormData({ ...formData, first_product_name: e.target.value })}
                    className="h-11 border-2 border-gray-200 focus:border-[#D45387]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Precio de venta
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={formData.first_product_price}
                      onChange={(e) => setFormData({ ...formData, first_product_price: e.target.value })}
                      className="h-11 border-2 border-gray-200 focus:border-[#D45387]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Costo
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={formData.first_product_cost}
                      onChange={(e) => setFormData({ ...formData, first_product_cost: e.target.value })}
                      className="h-11 border-2 border-gray-200 focus:border-[#D45387]"
                    />
                  </div>
                </div>

                {margin !== null && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="text-sm">
                      <span className="text-gray-600">Margen: </span>
                      <span className="font-bold text-emerald-600">{margin.toFixed(1)}%</span>
                    </p>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleStep1}
                  className="w-full h-12 bg-[#D45387] hover:bg-[#C03A76] text-white font-bold"
                >
                  Continuar <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Configuración */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 shadow-lg border border-pink-100"
            >
              <div className="text-center mb-6">
                <div className="w-10 h-10 rounded-full bg-[#D45387]/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg">3/3</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Casi listo</h2>
                <p className="text-gray-600 text-sm mt-1">Confirma tu moneda y zona horaria</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Moneda
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full h-11 px-3 border-2 border-gray-200 rounded-lg focus:border-[#D45387] focus:ring-0"
                  >
                    <option value="DOP">RD$ (Peso Dominicano)</option>
                    <option value="USD">$ (Dólar USD)</option>
                    <option value="EUR">€ (Euro)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Zona horaria
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full h-11 px-3 border-2 border-gray-200 rounded-lg focus:border-[#D45387] focus:ring-0"
                  >
                    <option value="America/Santo_Domingo">Santo Domingo (AST)</option>
                    <option value="America/New_York">Nueva York (EST)</option>
                    <option value="America/Los_Angeles">Los Angeles (PST)</option>
                    <option value="America/Mexico_City">Mexico City (CST)</option>
                  </select>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {saving && (
                  <div className="flex items-center justify-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-blue-700">Configurando tu negocio...</p>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full h-12 bg-[#D45387] hover:bg-[#C03A76] text-white font-bold disabled:opacity-50"
                >
                  {saving ? 'Un momento...' : '¡Comenzar!'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

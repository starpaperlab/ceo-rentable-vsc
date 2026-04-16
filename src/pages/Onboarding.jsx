import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { ensureDbUserRecord } from '@/lib/ensureDbUser'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, AlertCircle, Store, Package2, Settings2 } from 'lucide-react'
import { hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership'

function isOnConflictTargetError(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return (
    error?.code === '42P10' ||
    message.includes('no unique or exclusion constraint matching the on conflict specification')
  )
}

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
  const progress = ((step + 1) / 3) * 100
  const inputClassName =
    'h-12 rounded-xl border border-[#E7DDE6] bg-[#FCFAFD] px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D45387]/25 focus:border-[#D45387]'

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

      const saveConfigWithoutOnConflict = async (payload) => {
        const nowIso = new Date().toISOString()

        const findExistingByUserId = async () => {
          if (!payload.user_id) return null

          const { data, error } = await supabase
            .from('business_config')
            .select('id')
            .eq('user_id', payload.user_id)
            .order('updated_at', { ascending: false })
            .limit(1)

          if (error) throw error
          return data?.[0]?.id || null
        }

        const findExistingByCreatedBy = async () => {
          if (!payload.created_by) return null

          const { data, error } = await supabase
            .from('business_config')
            .select('id')
            .eq('created_by', payload.created_by)
            .order('updated_at', { ascending: false })
            .limit(1)

          if (error) throw error
          return data?.[0]?.id || null
        }

        let existingId = null

        try {
          existingId = await findExistingByUserId()
        } catch (lookupByUserError) {
          if (
            !isMissingColumnError(lookupByUserError, 'business_config.user_id') &&
            !isMissingColumnError(lookupByUserError, 'user_id')
          ) {
            throw lookupByUserError
          }
        }

        if (!existingId) {
          try {
            existingId = await findExistingByCreatedBy()
          } catch (lookupByCreatedByError) {
            if (
              !isMissingColumnError(lookupByCreatedByError, 'business_config.created_by') &&
              !isMissingColumnError(lookupByCreatedByError, 'created_by')
            ) {
              throw lookupByCreatedByError
            }
          }
        }

        if (existingId) {
          const updatePayload = {
            business_name: payload.business_name,
            currency: payload.currency,
            quarterly_goal: payload.quarterly_goal,
            target_margin_pct: payload.target_margin_pct,
            updated_at: nowIso,
          }

          const { error } = await supabase
            .from('business_config')
            .update(updatePayload)
            .eq('id', existingId)

          if (error) throw error
          return
        }

        const insertPayload = {
          ...payload,
          created_at: nowIso,
          updated_at: nowIso,
        }

        const { error } = await supabase
          .from('business_config')
          .insert(insertPayload)

        if (error) throw error
      }

      try {
        await upsertConfig(configPayload)
      } catch (configError) {
        if (isOnConflictTargetError(configError)) {
          await saveConfigWithoutOnConflict(configPayload)
        } else if (
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#F7F3EE] via-[#fffdfd] to-[#F7E6EF] flex items-center justify-center p-4">
      <div className="pointer-events-none absolute -top-32 -left-28 h-72 w-72 rounded-full bg-[#D45387]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 h-64 w-64 rounded-full bg-[#D45387]/12 blur-3xl" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-xl"
      >
        <div className="mb-4 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-[#EED8E3] bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
            <img
              src="/brand/isotipo.png"
              alt="CEO Rentable OS"
              className="h-9 w-9 object-contain"
            />
            <div className="leading-tight">
              <p className="text-sm font-bold text-[#D45387]">CEO Rentable OS™</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Plataforma financiera</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#EDD6E2] bg-white/95 p-6 shadow-[0_30px_80px_rgba(212,83,135,0.16)] sm:p-8">
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span>Paso {step + 1} de 3</span>
              <span>{step === 0 ? 'Negocio' : step === 1 ? 'Producto' : 'Configuración'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#F2E7ED]">
              <motion.div
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-[#D45387] to-[#C63C77]"
              />
            </div>
          </div>

        <AnimatePresence mode="wait">
          {/* STEP 0: Nombre del negocio */}
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D45387]/12 text-[#D45387]">
                  <Store className="h-6 w-6" />
                </div>
                <h1 className="text-3xl font-black text-slate-900">
                  Bienvenida a <span className="text-[#D45387]">CEO Rentable</span>
                </h1>
                <p className="mt-2 text-sm text-slate-600">Configura tu negocio en menos de 2 minutos.</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    ¿Cómo se llama tu negocio?
                  </label>
                  <Input
                    placeholder="Ej: Mi Tienda Online"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className={inputClassName}
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleStep0}
                  className="h-12 w-full rounded-xl bg-[#D45387] font-bold text-white hover:bg-[#C03A76]"
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
              className="space-y-5"
            >
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D45387]/12 text-[#D45387]">
                  <Package2 className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Tu primer producto</h2>
                <p className="text-sm text-slate-600 mt-1">Este dato alimenta tus análisis desde el primer día.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    Nombre del producto
                  </label>
                  <Input
                    placeholder="Ej: Camiseta Premium"
                    value={formData.first_product_name}
                    onChange={(e) => setFormData({ ...formData, first_product_name: e.target.value })}
                    className={inputClassName}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">
                      Precio de venta
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={formData.first_product_price}
                      onChange={(e) => setFormData({ ...formData, first_product_price: e.target.value })}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">
                      Costo
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={formData.first_product_cost}
                      onChange={(e) => setFormData({ ...formData, first_product_cost: e.target.value })}
                      className={inputClassName}
                    />
                  </div>
                </div>

                {margin !== null && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm">
                      <span className="text-slate-600">Margen estimado: </span>
                      <span className="font-bold text-emerald-600">{margin.toFixed(1)}%</span>
                    </p>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleStep1}
                  className="h-12 w-full rounded-xl bg-[#D45387] font-bold text-white hover:bg-[#C03A76]"
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
              className="space-y-5"
            >
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D45387]/12 text-[#D45387]">
                  <Settings2 className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Casi listo</h2>
                <p className="text-sm text-slate-600 mt-1">Confirma tu moneda y zona horaria para personalizar reportes.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    Moneda
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="h-12 w-full rounded-xl border border-[#E7DDE6] bg-[#FCFAFD] px-3 text-sm text-slate-800 focus:border-[#D45387] focus:outline-none focus:ring-2 focus:ring-[#D45387]/25"
                  >
                    <option value="DOP">RD$ (Peso Dominicano)</option>
                    <option value="USD">$ (Dólar USD)</option>
                    <option value="EUR">€ (Euro)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    Zona horaria
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="h-12 w-full rounded-xl border border-[#E7DDE6] bg-[#FCFAFD] px-3 text-sm text-slate-800 focus:border-[#D45387] focus:outline-none focus:ring-2 focus:ring-[#D45387]/25"
                  >
                    <option value="America/Santo_Domingo">Santo Domingo (AST)</option>
                    <option value="America/New_York">Nueva York (EST)</option>
                    <option value="America/Los_Angeles">Los Angeles (PST)</option>
                    <option value="America/Mexico_City">Mexico City (CST)</option>
                  </select>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {saving && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-blue-700">Configurando tu negocio...</p>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="h-12 w-full rounded-xl bg-[#D45387] font-bold text-white hover:bg-[#C03A76] disabled:opacity-50"
                >
                  {saving ? 'Un momento...' : '¡Comenzar!'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

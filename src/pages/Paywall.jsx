import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/AuthContext'
import { createPayPalOrder } from '@/lib/paypalService'
import { ENV_CONFIG } from '@/config/env'
import { formatCurrencyAmount, formatRecurringPrice } from '@/lib/currencyFormat'
import {
  clearPendingCheckoutPlan,
  getCheckoutPath,
  getPendingCheckoutPlan,
  normalizeCheckoutPlan,
  savePendingCheckoutPlan,
} from '@/lib/pendingCheckout'
import { ArrowRight, CheckCircle2, Zap, AlertCircle, Loader } from 'lucide-react'

const SESSION_ERROR_MESSAGE =
  'No pudimos validar tu sesión. Inicia sesión nuevamente para continuar con el pago.'

const SHORT_FLOW_CONFIRMATION_ERROR =
  'Este proyecto todavía exige confirmar el correo antes de pagar. Desactiva "Confirm Email" en Supabase para habilitar el flujo corto.'

const INITIAL_AUTH_FORM = {
  fullName: '',
  email: '',
  businessName: '',
  password: '',
}

const PLANS = [
  {
    id: 'monthly',
    name: 'Mensual',
    period: '/mes',
    description:
      'Ideal para emprendedoras que quieren controlar sus ganancias y tomar mejores decisiones financieras.',
    features: [
      'Control financiero mensual',
      'Dashboard financiero completo',
      'Facturas y cotizaciones automáticas',
      'Gestión de clientes e inventario',
      'Cancela cuando quieras',
    ],
    cta: 'Comenzar hoy',
    paymentNote: 'Pago mensual · Procesado de forma segura por PayPal',
    recommended: false,
  },
  {
    id: 'founder_lifetime',
    name: 'Founder Lifetime',
    period: '',
    description: 'Oferta Founder por tiempo limitado',
    features: [
      'Pago único',
      'Acceso permanente a CEO Rentable OS',
      'Precio futuro: RD$9,997',
      'Dashboard financiero y módulos comerciales',
      'Soporte por email',
    ],
    cta: 'Obtener acceso Founder',
    paymentNote: 'Pago único · Procesado de forma segura por PayPal',
    recommended: true,
  },
]

function getPlanPrice(planId) {
  const planConfig = ENV_CONFIG.paypal.plans[planId] || {}

  return {
    amount: planConfig.amount,
    currency: planConfig.currency || ENV_CONFIG.paypal.currency,
  }
}

export default function Paywall() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, userProfile, isLoadingAuth, isLoadingProfile, login, register } = useAuth()
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)
  const [autoCheckoutStatus, setAutoCheckoutStatus] = useState('idle')
  const [authMode, setAuthMode] = useState('register')
  const [authLoading, setAuthLoading] = useState(false)
  const [authInfo, setAuthInfo] = useState('')
  const [authForm, setAuthForm] = useState(INITIAL_AUTH_FORM)
  const autoCheckoutStartedRef = useRef(false)
  const requestedPlan = normalizeCheckoutPlan(searchParams.get('plan'))
  const selectedPlan = requestedPlan || getPendingCheckoutPlan()
  const selectedPlanData = PLANS.find((plan) => plan.id === selectedPlan) || null
  const isAuthLoadingResolved = isLoadingAuth || isLoadingProfile

  useEffect(() => {
    if (!selectedPlan && userProfile?.has_access) {
      navigate('/Dashboard')
    }
  }, [navigate, selectedPlan, userProfile])

  useEffect(() => {
    if (!selectedPlan || requestedPlan) return
    navigate(getCheckoutPath(selectedPlan), { replace: true })
  }, [navigate, requestedPlan, selectedPlan])

  useEffect(() => {
    autoCheckoutStartedRef.current = false
    setAutoCheckoutStatus('idle')
    setError(null)
    setAuthInfo('')
  }, [selectedPlan])

  useEffect(() => {
    if (!selectedPlan || isAuthLoadingResolved) return

    savePendingCheckoutPlan(selectedPlan)

    if (!user) {
      autoCheckoutStartedRef.current = false
      setAutoCheckoutStatus('idle')
      return
    }

    if (autoCheckoutStartedRef.current) return
    autoCheckoutStartedRef.current = true
    void handleCheckout(selectedPlan, { direct: true })
  }, [isAuthLoadingResolved, selectedPlan, user])

  const updateAuthField = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }))
  }

  const switchAuthMode = (nextMode) => {
    setAuthMode(nextMode)
    setError(null)
    setAuthInfo('')
  }

  const getEmailConfirmationRedirectUrl = (planId) => {
    if (typeof window === 'undefined') return undefined
    return `${window.location.origin}${getCheckoutPath(planId)}`
  }

  async function handleCheckout(planId, { direct = false } = {}) {
    if (!user) {
      savePendingCheckoutPlan(planId)
      setAuthMode('register')
      setAutoCheckoutStatus('idle')
      return
    }

    setLoading((prev) => ({ ...prev, [planId]: true }))
    setError(null)
    if (direct) {
      setAutoCheckoutStatus('loading')
    }

    try {
      const result = await createPayPalOrder(planId)
      const approvalUrl = result.approvalUrl || result.approval_url

      if (result.success && approvalUrl) {
        clearPendingCheckoutPlan()
        window.location.href = approvalUrl
        return
      }

      if (result.code === 'AUTH_REQUIRED') {
        savePendingCheckoutPlan(planId)
        setError(result.error || SESSION_ERROR_MESSAGE)
        setAutoCheckoutStatus('error')
        return
      }

      setError(result.error || 'No se pudo crear la orden de PayPal.')
      if (direct) {
        setAutoCheckoutStatus('error')
      }
    } catch (err) {
      console.error('PayPal order error:', err)
      setError(
        err?.code === 'AUTH_REQUIRED'
          ? SESSION_ERROR_MESSAGE
          : 'Error creando la orden de PayPal. Por favor intenta nuevamente.'
      )
      if (direct) {
        setAutoCheckoutStatus('error')
      }
    } finally {
      setLoading((prev) => ({ ...prev, [planId]: false }))
    }
  }

  const handleQuickAuthSubmit = async (event) => {
    event.preventDefault()

    if (!selectedPlan) return

    setError(null)
    setAuthInfo('')
    setAuthLoading(true)

    try {
      if (!authForm.email.trim()) {
        throw new Error('Escribe tu correo electrónico.')
      }

      if (!authForm.password.trim()) {
        throw new Error('Escribe tu contraseña.')
      }

      if (authMode === 'register') {
        if (!authForm.fullName.trim()) {
          throw new Error('Escribe tu nombre.')
        }

        if (!authForm.businessName.trim()) {
          throw new Error('Escribe el nombre de tu negocio.')
        }

        if (authForm.password.trim().length < 6) {
          throw new Error('La contraseña debe tener al menos 6 caracteres.')
        }

        const result = await register({
          email: authForm.email,
          password: authForm.password,
          fullName: authForm.fullName,
          businessName: authForm.businessName,
          emailRedirectTo: getEmailConfirmationRedirectUrl(selectedPlan),
        })

        if (result.needsEmailConfirmation) {
          setError(SHORT_FLOW_CONFIRMATION_ERROR)
          return
        }

        setAuthInfo('Cuenta creada. Preparando tu checkout...')
        setAutoCheckoutStatus('loading')
        return
      }

      await login(authForm.email, authForm.password)
      setAuthInfo('Sesión iniciada. Preparando tu checkout...')
      setAutoCheckoutStatus('loading')
    } catch (authError) {
      const nextMessage = authError?.message || 'No pudimos validar tus datos.'

      if (nextMessage.toLowerCase().includes('ya esta registrado')) {
        setAuthMode('login')
        setError('Ya existe una cuenta con ese correo. Inicia sesión para continuar con tu plan.')
      } else {
        setError(nextMessage)
      }
    } finally {
      setAuthLoading(false)
    }
  }

  if (selectedPlan) {
    const price = getPlanPrice(selectedPlan)
    const planName = selectedPlanData?.name || (selectedPlan === 'monthly' ? 'Mensual' : 'Founder Lifetime')

    if (isAuthLoadingResolved) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-pink-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
            <Loader className="w-10 h-10 animate-spin text-[#D45387] mx-auto mb-4" />
            <h1 className="text-2xl font-black text-gray-900 mb-2">Validando tu sesión</h1>
            <p className="text-sm text-gray-600">Estamos preparando el acceso al checkout seguro.</p>
          </div>
        </div>
      )
    }

    if (!user) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-pink-50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[#EBC7D7] bg-white p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-5">
                <img src="/brand/isotipo.png" alt="CEO Rentable OS" className="w-12 h-12 rounded-2xl" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D45387]">Compra rápida</p>
                  <h1 className="text-3xl font-black text-gray-900">Activa tu plan en minutos</h1>
                </div>
              </div>

              <div className="rounded-2xl border border-[#F2D6E2] bg-[#FFF7FA] p-5 mb-6">
                <p className="text-sm font-semibold text-gray-900">
                  {planName} ·{' '}
                  {selectedPlan === 'monthly'
                    ? formatRecurringPrice(price.amount, price.currency, '/mes')
                    : formatCurrencyAmount(price.amount, price.currency)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Crea tu cuenta rápida y te enviamos directo a PayPal sin volver a elegir plan.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#F7F3EE] p-1 mb-6">
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    authMode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                  onClick={() => switchAuthMode('register')}
                >
                  Crear cuenta
                </button>
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                  onClick={() => switchAuthMode('login')}
                >
                  Ya tengo cuenta
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleQuickAuthSubmit}>
                {authMode === 'register' && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-600">Nombre</Label>
                    <Input
                      value={authForm.fullName}
                      onChange={(event) => updateAuthField('fullName', event.target.value)}
                      placeholder="Tu nombre"
                      className="mt-1 h-11 rounded-xl border-slate-200"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-xs font-semibold text-slate-600">Email</Label>
                  <Input
                    type="email"
                    value={authForm.email}
                    onChange={(event) => updateAuthField('email', event.target.value)}
                    placeholder="tu@correo.com"
                    className="mt-1 h-11 rounded-xl border-slate-200"
                    autoComplete="email"
                  />
                </div>

                {authMode === 'register' && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-600">Nombre del negocio</Label>
                    <Input
                      value={authForm.businessName}
                      onChange={(event) => updateAuthField('businessName', event.target.value)}
                      placeholder="Ej. Mi Boutique"
                      className="mt-1 h-11 rounded-xl border-slate-200"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-xs font-semibold text-slate-600">Contraseña</Label>
                  <Input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => updateAuthField('password', event.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="mt-1 h-11 rounded-xl border-slate-200"
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {authInfo && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {authInfo}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={authLoading}
                  className="w-full h-12 rounded-xl font-semibold text-white border-0 bg-[#D45387] hover:bg-[#C3467A]"
                >
                  {authLoading
                    ? authMode === 'register'
                      ? 'Creando cuenta...'
                      : 'Entrando...'
                    : authMode === 'register'
                      ? 'Continuar a PayPal'
                      : 'Entrar y continuar'}
                </Button>
              </form>

              <p className="text-xs text-slate-400 mt-5 text-center">
                No te pediremos confirmar el correo antes del pago. Tu acceso se activa solo después de que PayPal confirme la compra.
              </p>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D45387] mb-3">Tu plan</p>
              <h2 className="text-3xl font-black text-gray-900">{planName}</h2>
              <p className="text-gray-600 text-sm mt-2">{selectedPlanData?.description}</p>
              <div className="mt-5 mb-7">
                <p className="text-4xl font-black text-gray-900">
                  {selectedPlan === 'monthly'
                    ? formatRecurringPrice(price.amount, price.currency, '/mes')
                    : formatCurrencyAmount(price.amount, price.currency)}
                </p>
                <p className="text-xs text-gray-500 mt-1">{selectedPlanData?.paymentNote}</p>
              </div>
              <div className="space-y-3">
                {(selectedPlanData?.features || []).map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#D45387] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-pink-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
          <img src="/brand/isotipo.png" alt="CEO Rentable OS" className="w-12 h-12 mx-auto mb-4" />
          {autoCheckoutStatus === 'error' ? (
            <>
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-black text-gray-900 mb-2">No pudimos abrir PayPal</h1>
              <p className="text-sm text-gray-600 mb-6">
                {error || 'Intenta nuevamente o vuelve a elegir tu plan.'}
              </p>
              <div className="space-y-3">
                <Button
                  onClick={() => {
                    autoCheckoutStartedRef.current = false
                    void handleCheckout(selectedPlan, { direct: true })
                  }}
                  className="w-full bg-[#D45387] hover:bg-[#C3467A] text-white"
                >
                  Intentar nuevamente
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate('/paywall', { replace: true })}>
                  Ver planes
                </Button>
              </div>
            </>
          ) : (
            <>
              <Loader className="w-10 h-10 animate-spin text-[#D45387] mx-auto mb-4" />
              <h1 className="text-2xl font-black text-gray-900 mb-2">Preparando tu checkout</h1>
              <p className="text-sm text-gray-600 mb-2">
                Plan {planName} ·{' '}
                {selectedPlan === 'monthly'
                  ? formatRecurringPrice(price.amount, price.currency, '/mes')
                  : formatCurrencyAmount(price.amount, price.currency)}
              </p>
              <p className="text-xs text-gray-500">Te enviaremos a PayPal en unos segundos.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-pink-50 flex flex-col items-center justify-center p-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <img
            src="/brand/isotipo.png"
            alt="CEO Rentable OS"
            className="w-12 h-12 mx-auto mb-4"
          />
          <h1 className="text-4xl sm:text-4xl font-black text-gray-900 mb-3">
            Elige tu plan
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Mensual = RD$1,497 · Founder Lifetime = RD$4,997
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </motion.div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {PLANS.map((plan, idx) => {
            const price = getPlanPrice(plan.id)

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`relative rounded-2xl border-2 overflow-hidden transition-all duration-300 ${
                  plan.recommended
                    ? 'border-[#D45387] bg-gradient-to-br from-[#D45387]/5 to-purple-50 shadow-xl scale-105 md:scale-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 shadow-lg'
                }`}
              >
                {plan.recommended && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-[#D45387] to-purple-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-lg">
                    MÁS POPULAR
                  </div>
                )}

                <div className="p-8">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
                    <p className="text-gray-600 text-sm mt-1">{plan.description}</p>
                  </div>

                  <div className="mb-8">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-5xl font-black text-gray-900">
                        {plan.period
                          ? formatRecurringPrice(price.amount, price.currency, plan.period)
                          : formatCurrencyAmount(price.amount, price.currency)}
                      </span>
                    </div>
                    {plan.id === 'founder_lifetime' && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[#D45387] text-sm font-semibold">
                          Oferta Founder por tiempo limitado
                        </p>
                        <p className="text-gray-500 text-sm">
                          Precio futuro: {formatCurrencyAmount(9997, price.currency)}
                        </p>
                      </div>
                    )}
                    <p className="text-gray-600 text-xs mt-2">
                      {plan.paymentNote}
                    </p>
                  </div>

                  <Button
                    onClick={() => {
                      if (!user) {
                        savePendingCheckoutPlan(plan.id)
                        navigate(getCheckoutPath(plan.id), { replace: true })
                        return
                      }

                      void handleCheckout(plan.id)
                    }}
                    disabled={loading[plan.id]}
                    className={`w-full h-12 font-bold text-base rounded-xl mb-8 flex items-center justify-center gap-2 transition-all ${
                      plan.recommended
                        ? 'bg-gradient-to-r from-[#D45387] to-purple-500 hover:shadow-lg text-white border-0'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-0'
                    } disabled:opacity-50`}
                  >
                    {loading[plan.id] ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Creando orden...
                      </>
                    ) : (
                      <>
                        {plan.recommended ? <Zap className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                        {plan.cta}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>

                  <div className="space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-[#D45387] flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 text-center">
          <p className="text-gray-600 text-sm mb-4">
            Pago seguro con PayPal · Acceso inmediato después del pago
          </p>
          <p className="text-gray-600 text-xs">
            ¿Preguntas? Contactanos:{' '}
            <a href="mailto:hola@ceorentable.com" className="text-[#D45387] font-semibold hover:underline">
              hola@ceorentable.com
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

function ShoppingCart({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  )
}

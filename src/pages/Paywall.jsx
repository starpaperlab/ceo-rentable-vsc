import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/AuthContext'
import { createPayPalOrder } from '@/lib/paypalService'
import { ENV_CONFIG } from '@/config/env'
import { formatCurrencyAmount, formatRecurringPrice } from '@/lib/currencyFormat'
import { ArrowRight, CheckCircle2, Zap, AlertCircle, Loader } from 'lucide-react'

const PLANS = [
  {
    id: 'monthly',
    name: 'Mensual',
    period: '/mes',
    description: 'Ideal para emprendedoras que quieren controlar sus ganancias y tomar mejores decisiones financieras.',
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
  const planConfig = ENV_CONFIG.paypal.plans[planId] || {};

  return {
    amount: planConfig.amount,
    currency: planConfig.currency || ENV_CONFIG.paypal.currency,
  };
}

export default function Paywall() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)

  // Redirigir si ya tiene acceso
  useEffect(() => {
    if (userProfile?.has_access) {
      navigate('/Dashboard')
    }
  }, [userProfile, navigate])

  const handleCheckout = async (planId) => {
    if (!user) {
      setError('Por favor inicia sesión primero')
      return
    }

    setLoading((prev) => ({ ...prev, [planId]: true }))
    setError(null)

    try {
      const result = await createPayPalOrder(planId)
      const approvalUrl = result.approvalUrl || result.approval_url

      if (result.success && approvalUrl) {
        window.location.href = approvalUrl
        return
      }

      setError(result.error || 'No se pudo crear la orden de PayPal.')
    } catch (err) {
      console.error('PayPal order error:', err)
      setError('Error creando la orden de PayPal. Por favor intenta nuevamente.')
    } finally {
      setLoading((prev) => ({ ...prev, [planId]: false }))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-pink-50 flex flex-col items-center justify-center p-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl">
        {/* Header */}
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

        {/* Error alert */}
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

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {PLANS.map((plan, idx) => (
            (() => {
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
              {/* Ribbon */}
              {plan.recommended && (
                <div className="absolute top-0 right-0 bg-gradient-to-r from-[#D45387] to-purple-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-lg">
                  MÁS POPULAR
                </div>
              )}

              <div className="p-8">
                {/* Plan header */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
                  <p className="text-gray-600 text-sm mt-1">{plan.description}</p>
                </div>

                {/* Price */}
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

                {/* CTA Button */}
                <Button
                  onClick={() => handleCheckout(plan.id)}
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

                {/* Features */}
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
            })()
          ))}
        </div>

        {/* FAQ / Footer */}
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
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
}

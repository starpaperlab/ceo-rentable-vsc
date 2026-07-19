import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { generateBusinessDiagnosis, getCeoScoreClassification } from '@/lib/geminiService'
import { trackLead, trackContact, trackCustomEvent, trackInitiateCheckout } from '@/lib/metaPixel'
import { ENV_CONFIG } from '@/config/env'
import { ArrowRight, CheckCircle, XCircle, TrendingUp, Zap, Loader, MessageCircle, Lock } from 'lucide-react'

const SALES_OPTIONS = [
  { label: 'Menos de US$1,000', value: 'under_30k', score: 5 },
  { label: 'US$1,000 a US$3,000', value: '30k_120k', score: 12 },
  { label: 'US$3,000 a US$7,500', value: '120k_300k', score: 20 },
  { label: 'Más de US$7,500', value: 'over_300k', score: 25 },
]

const SALES_SCORES = SALES_OPTIONS.reduce((acc, opt) => {
  acc[opt.value] = opt.score
  return acc
}, {})

const PROBLEM_SEGMENTS = {
  ventas: 'PROBLEMA_VENTAS',
  rentabilidad: 'PROBLEMA_RENTABILIDAD',
  cobros: 'PROBLEMA_COBROS',
  inventario: 'PROBLEMA_INVENTARIO',
  flujo_caja: 'PROBLEMA_FLUJO_CAJA',
}

const QUESTIONS = [
  {
    id: 'business_type',
    text: '¿Tu negocio vende principalmente?',
    type: 'choice',
    options: [
      { label: 'Productos', value: 'productos' },
      { label: 'Servicios', value: 'servicios' },
      { label: 'Ambos', value: 'ambos' },
    ],
  },
  {
    id: 'monthly_sales',
    text: '¿Cuánto vendes al mes?',
    subtext: '(Aproximadamente)',
    type: 'choice',
    options: SALES_OPTIONS,
  },
  {
    id: 'client_volume',
    text: '¿Cuántos clientes atiendes al mes?',
    type: 'choice',
    options: [
      { label: 'Menos de 10', value: 'under_10' },
      { label: '10 a 50', value: '10_50' },
      { label: '51 a 200', value: '51_200' },
      { label: 'Más de 200', value: 'over_200' },
    ],
  },
  {
    id: 'knows_margin',
    text: '¿Conoces tu margen de ganancia real?',
    type: 'yesno',
  },
  {
    id: 'controls_costs',
    text: '¿Controlas todos tus gastos?',
    type: 'yesno',
  },
  {
    id: 'knows_best_product',
    text: '¿Sabes cuál producto o servicio deja más dinero?',
    type: 'yesno',
  },
  {
    id: 'management_method',
    text: '¿Cómo administras actualmente tu negocio?',
    type: 'choice',
    options: [
      { label: 'Cuaderno', value: 'cuaderno' },
      { label: 'Excel', value: 'excel' },
      { label: 'Sistema', value: 'sistema' },
      { label: 'No llevo control', value: 'sin_control' },
    ],
  },
  {
    id: 'main_problem',
    text: '¿Cuál es tu principal problema hoy?',
    type: 'choice',
    options: [
      { label: 'Ventas', value: 'ventas' },
      { label: 'Rentabilidad', value: 'rentabilidad' },
      { label: 'Cobros', value: 'cobros' },
      { label: 'Inventario', value: 'inventario' },
      { label: 'Flujo de caja', value: 'flujo_caja' },
    ],
  },
]

function calcScore(answers) {
  let score = SALES_SCORES[answers.monthly_sales] ?? 5
  if (answers.knows_margin) score += 25
  if (answers.controls_costs) score += 25
  if (answers.knows_best_product) score += 25
  return score
}

function computeSegments(answers, score) {
  const segment_business =
    answers.business_type === 'productos'
      ? 'PRODUCTOS'
      : answers.business_type === 'servicios'
        ? 'SERVICIOS'
        : 'MIXTO'

  const classification = getCeoScoreClassification(score)
  const segment_score =
    classification === 'Crítico' ? 'BAJO_SCORE' : classification === 'Inestable' ? 'MEDIO_SCORE' : 'ALTO_SCORE'

  const segment_problem = PROBLEM_SEGMENTS[answers.main_problem] || null

  return { segment_business, segment_score, segment_problem }
}

function ScoreArc({ score }) {
  const color = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#10b981'
  const label = getCeoScoreClassification(score)
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg className="absolute inset-0" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#f0f0f0" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${(score / 100) * 263.9} 263.9`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="text-center">
          <p className="text-3xl font-black" style={{ color }}>
            {score}
          </p>
          <p className="text-xs text-slate-500 font-medium">de 100</p>
        </div>
      </div>
      <span className="mt-2 text-sm font-semibold px-3 py-1 rounded-full" style={{ color, backgroundColor: `${color}18` }}>
        {label}
      </span>
    </div>
  )
}

function DiagnosisBlock({ diagnosis }) {
  return (
    <div className="p-4 bg-pink-50 border border-pink-100 rounded-2xl mb-4">
      <h3 className="text-sm font-bold text-[#D45387] mb-2">💡 Diagnóstico</h3>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{diagnosis}</p>
    </div>
  )
}

function PremiumBlocks({ analysis }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
        <h3 className="text-sm font-bold text-emerald-700 mb-2">💰 Rentabilidad</h3>
        <p className="text-sm text-slate-700 leading-relaxed">{analysis.profitability}</p>
      </div>
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
        <h3 className="text-sm font-bold text-blue-700 mb-2">💵 Flujo de caja</h3>
        <p className="text-sm text-slate-700 leading-relaxed">{analysis.cashflow}</p>
      </div>
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <h3 className="text-sm font-bold text-amber-700 mb-3">📋 Plan de acción</h3>
          <div className="space-y-2">
            {analysis.recommendations.slice(0, 3).map((rec, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-amber-600 font-bold">{i + 1}.</span>
                <p className="text-slate-700">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Diagnostico() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 0=preguntas, 1=resultado parcial + captura, 2=resultado completo
  const [answers, setAnswers] = useState({})
  const [qIndex, setQIndex] = useState(0)
  const [score, setScore] = useState(null)
  const [segments, setSegments] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [lead, setLead] = useState({ name: '', email: '' })
  const [saving, setSaving] = useState(false)

  const handleAnswer = async (value) => {
    const q = QUESTIONS[qIndex]
    const newAnswers = { ...answers, [q.id]: value }
    setAnswers(newAnswers)

    if (qIndex < QUESTIONS.length - 1) {
      setQIndex((i) => i + 1)
      return
    }

    // Última pregunta respondida: calcular CEO Score y segmentos en cliente
    const finalScore = calcScore(newAnswers)
    const finalSegments = computeSegments(newAnswers, finalScore)
    setScore(finalScore)
    setSegments(finalSegments)

    trackCustomEvent('DiagnosticoCuestionarioCompletado', {
      ceo_score: finalScore,
      classification: getCeoScoreClassification(finalScore),
      business_type: newAnswers.business_type,
      main_problem: newAnswers.main_problem,
      segment_score: finalSegments.segment_score,
    })

    setStep(1)

    setLoadingAnalysis(true)
    const geminiAnalysis = await generateBusinessDiagnosis({ ...newAnswers, ceo_score: finalScore })
    setAnalysis(geminiAnalysis)
    setLoadingAnalysis(false)
  }

  const handleCapture = async () => {
    if (!lead.name.trim() || !lead.email.trim()) return
    setSaving(true)

    const { error } = await supabase.from('leads').insert({
      name: lead.name.trim(),
      email: lead.email.trim(),
      source: 'diagnostico',
      status: 'new',
      business_type: answers.business_type,
      monthly_sales: answers.monthly_sales,
      client_volume: answers.client_volume,
      knows_margin: answers.knows_margin,
      controls_costs: answers.controls_costs,
      knows_best_product: answers.knows_best_product,
      management_method: answers.management_method,
      main_problem: answers.main_problem,
      ceo_score: score,
      segment_business: segments?.segment_business,
      segment_score: segments?.segment_score,
      segment_problem: segments?.segment_problem,
      created_at: new Date(),
    })

    setSaving(false)
    if (error) {
      console.error(error)
    }

    trackLead({
      content_name: 'diagnostico_gratuito',
      status: 'new',
      ceo_score: score,
      segment_business: segments?.segment_business,
      segment_score: segments?.segment_score,
      segment_problem: segments?.segment_problem,
    })

    trackCustomEvent('DiagnosticoCompletado', {
      ceo_score: score,
      classification: getCeoScoreClassification(score),
    })

    setStep(2)
  }

  const handleWhatsApp = () => {
    const classification = getCeoScoreClassification(score)
    const message = `Hola! Hice el diagnóstico CEO Score™ de CEO Rentable OS y obtuve ${score}/100 (${classification}). Quiero mejorar mi negocio 🚀`

    trackContact({
      content_name: 'diagnostico_whatsapp',
      ceo_score: score,
      classification,
    })

    window.open(
      `https://wa.me/${ENV_CONFIG.whatsapp.number}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  const handleFounderCTA = () => {
    trackInitiateCheckout('founder_lifetime')
    navigate('/paywall?plan=founder_lifetime&checkout=true')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF8FB] via-white to-[#F7FBFF] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/brand/isotipo.png"
            alt="CEO Rentable OS"
            className="w-10 h-10 mx-auto object-contain mb-2"
          />
          <p className="text-xs text-[#D45387] font-semibold uppercase tracking-widest">CEO Rentable OS™</p>
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 0 — PREGUNTAS */}
          {step === 0 && (
            <motion.div
              key={`q${qIndex}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="bg-white border border-[#E7E1D9] rounded-3xl p-8 shadow-xl shadow-slate-200/70"
            >
              {qIndex === 0 && (
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 bg-pink-50 border border-pink-100 text-[#D45387] text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
                    <Zap className="h-3 w-3" /> Diagnóstico gratuito · 3 minutos
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-950 leading-tight">
                    Descubre si tu negocio
                    <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D45387] to-[#7C3AED]">
                      realmente está ganando dinero
                    </span>
                  </h1>
                  <p className="text-slate-500 text-sm mt-3">Responde 8 preguntas y obtén tu CEO Score™ gratis.</p>
                </div>
              )}

              {/* Progress */}
              <div className="flex gap-1.5 mb-8">
                {QUESTIONS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                      i <= qIndex ? 'bg-[#D45387]' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-[#D45387] font-semibold uppercase tracking-widest mb-3">
                Pregunta {qIndex + 1} de {QUESTIONS.length}
              </p>
              <h2 className="text-xl sm:text-2xl font-black text-slate-950 mb-2">{QUESTIONS[qIndex].text}</h2>
              {QUESTIONS[qIndex].subtext && (
                <p className="text-slate-500 text-sm mb-6">{QUESTIONS[qIndex].subtext}</p>
              )}
              <div className="space-y-3 mt-4">
                {QUESTIONS[qIndex].type === 'choice' ? (
                  QUESTIONS[qIndex].options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleAnswer(opt.value)}
                      className="w-full text-left px-5 py-4 rounded-2xl border border-slate-200 bg-white hover:bg-pink-50 hover:border-pink-200 text-slate-800 font-medium transition-all duration-200 text-sm shadow-sm"
                    >
                      {opt.label}
                    </button>
                  ))
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleAnswer(true)}
                      className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold transition-all text-base"
                    >
                      <CheckCircle className="h-5 w-5" /> Sí
                    </button>
                    <button
                      onClick={() => handleAnswer(false)}
                      className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold transition-all text-base"
                    >
                      <XCircle className="h-5 w-5" /> No
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 1 — RESULTADO PARCIAL (BORROSO) + CAPTURA */}
          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white border border-[#E7E1D9] rounded-3xl p-8 shadow-xl shadow-slate-200/70 overflow-y-auto max-h-[85vh]"
            >
              <p className="text-xs text-[#D45387] font-semibold uppercase tracking-widest text-center mb-6">
                Tu CEO Score™
              </p>
              <div className="flex justify-center mb-6">
                <ScoreArc score={score} />
              </div>

              {loadingAnalysis && (
                <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 border border-blue-100 rounded-2xl mb-6">
                  <Loader className="h-5 w-5 text-blue-600 animate-spin" />
                  <p className="text-sm text-blue-700">Generando tu diagnóstico con IA...</p>
                </div>
              )}

              {analysis && !loadingAnalysis && (
                <>
                  <DiagnosisBlock diagnosis={analysis.diagnosis} />

                  <div className="relative mt-2">
                    <div className="blur-sm select-none pointer-events-none" aria-hidden="true">
                      <PremiumBlocks analysis={analysis} />
                    </div>

                    <div className="absolute inset-0 -m-2 flex items-center justify-center rounded-2xl bg-gradient-to-b from-white/40 via-white/90 to-white p-4">
                      <div className="w-full max-w-sm text-center">
                        <Lock className="h-6 w-6 text-[#D45387] mx-auto mb-3" />
                        <h3 className="text-base sm:text-lg font-black text-slate-950 mb-2 leading-snug">
                          Tu diagnóstico completo está listo.
                        </h3>
                        <p className="text-slate-500 text-xs sm:text-sm mb-5 leading-relaxed">
                          Descubre cuánto dinero podrías estar perdiendo y qué hacer para corregirlo.
                        </p>
                        <div className="space-y-3">
                          <Input
                            placeholder="Tu nombre"
                            value={lead.name}
                            onChange={(e) => setLead((p) => ({ ...p, name: e.target.value }))}
                            className="bg-white border-slate-200 text-slate-950 placeholder:text-slate-400 h-12 rounded-xl"
                            onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                          />
                          <Input
                            placeholder="Tu email"
                            type="email"
                            value={lead.email}
                            onChange={(e) => setLead((p) => ({ ...p, email: e.target.value }))}
                            className="bg-white border-slate-200 text-slate-950 placeholder:text-slate-400 h-12 rounded-xl"
                            onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                          />
                          <Button
                            className="w-full h-12 text-base font-bold bg-[#D45387] hover:bg-[#C24578] text-white border-0 rounded-xl"
                            onClick={handleCapture}
                            disabled={!lead.name.trim() || !lead.email.trim() || saving}
                          >
                            {saving ? 'Un momento...' : 'Desbloquear mi diagnóstico'} <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                          <p className="text-center text-xs text-slate-400">Sin spam. Solo resultados.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* STEP 2 — RESULTADO COMPLETO */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white border border-[#E7E1D9] rounded-3xl p-8 shadow-xl shadow-slate-200/70 overflow-y-auto max-h-[85vh]"
            >
              <p className="text-xs text-[#D45387] font-semibold uppercase tracking-widest text-center mb-6">
                Tu CEO Score™
              </p>
              <div className="flex justify-center mb-6">
                <ScoreArc score={score} />
              </div>

              {analysis && (
                <div className="space-y-4">
                  <DiagnosisBlock diagnosis={analysis.diagnosis} />
                  <PremiumBlocks analysis={analysis} />
                </div>
              )}

              <Button
                variant="outline"
                className="w-full h-12 text-sm font-semibold border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl mt-6"
                onClick={handleWhatsApp}
              >
                <MessageCircle className="h-4 w-4 mr-2" /> Enviar mi resultado por WhatsApp
              </Button>

              <div className="mt-8 pt-6 border-t border-slate-200 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D45387] to-[#7C3AED] flex items-center justify-center mx-auto mb-5">
                  <TrendingUp className="h-7 w-7 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-950 mb-3">Ahora mira tu negocio completo</h2>
                <p className="text-slate-500 text-sm leading-relaxed mb-8">
                  Este diagnóstico es solo una vista rápida.
                  <br />
                  Dentro del sistema puedes ver exactamente cuánto ganas,
                  <br />
                  qué estás perdiendo y cómo mejorar.
                </p>

                <div className="space-y-3">
                  <Button
                    onClick={handleFounderCTA}
                    className="w-full h-14 text-base font-bold bg-[#D45387] hover:bg-[#C24578] text-white border-0 rounded-xl"
                  >
                    Conviértete en Founder ahora <ArrowRight className="h-5 w-5 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm font-semibold border-slate-200 bg-white text-slate-800 hover:bg-slate-50 rounded-xl"
                    onClick={() => navigate('/paywall')}
                  >
                    Ver planes y precios
                  </Button>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                  {[
                    ['📊', 'Rentabilidad real'],
                    ['🎯', 'CEO Score en vivo'],
                    ['📄', 'Facturas automáticas'],
                  ].map(([icon, label]) => (
                    <div key={label}>
                      <p className="text-xl mb-1">{icon}</p>
                      <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

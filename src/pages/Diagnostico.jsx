import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { generateBusinessDiagnosis } from '@/lib/geminiService'
import { ArrowRight, CheckCircle, XCircle, TrendingUp, Zap, Loader } from 'lucide-react'

const QUESTIONS = [
  {
    id: 'monthly_sales',
    text: '¿Cuánto vendes al mes?',
    subtext: '(Aproximadamente)',
    type: 'choice',
    options: [
      { label: 'Menos de RD$30,000', value: 'less_500', score: 5 },
      { label: 'RD$30,000 – RD$120,000', value: '500_2000', score: 15 },
      { label: 'Más de RD$120,000', value: 'more_2000', score: 25 },
    ],
  },
  {
    id: 'knows_margin',
    text: '¿Conoces tu margen de ganancia?',
    type: 'yesno',
  },
  {
    id: 'controls_costs',
    text: '¿Tienes control de tus costos?',
    type: 'yesno',
  },
  {
    id: 'knows_best_product',
    text: '¿Sabes qué producto te deja más dinero?',
    type: 'yesno',
  },
]

function calcScore(answers) {
  let score = answers.monthly_sales === 'more_2000' ? 25 : answers.monthly_sales === '500_2000' ? 15 : 5
  if (answers.knows_margin) score += 25
  if (answers.controls_costs) score += 25
  if (answers.knows_best_product) score += 25
  return score
}

function ScoreArc({ score }) {
  const color = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#10b981'
  const label = score < 40 ? 'Crítico' : score < 70 ? 'Inestable' : 'Saludable'
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
          <p className="text-xs text-gray-400 font-medium">de 100</p>
        </div>
      </div>
      <span className="mt-2 text-sm font-semibold px-3 py-1 rounded-full" style={{ color, backgroundColor: `${color}18` }}>
        {label}
      </span>
    </div>
  )
}

export default function Diagnostico() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 0=capture, 1=questions, 2=result, 3=cta
  const [lead, setLead] = useState({ name: '', email: '' })
  const [answers, setAnswers] = useState({})
  const [qIndex, setQIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [score, setScore] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)

  const handleCapture = async () => {
    if (!lead.name.trim() || !lead.email.trim()) return
    setSaving(true)
    const { error } = await supabase.from('leads').insert({
      ...lead,
      source: 'diagnostico',
      status: 'new',
      created_at: new Date(),
    })
    setSaving(false)
    if (error) {
      console.error(error)
      return
    }
    setStep(1)
  }

  const handleAnswer = async (value) => {
    const q = QUESTIONS[qIndex]
    const newAnswers = { ...answers, [q.id]: value }
    setAnswers(newAnswers)

    if (qIndex < QUESTIONS.length - 1) {
      setQIndex((i) => i + 1)
    } else {
      // Todas las preguntas respondidas
      const finalScore = calcScore(newAnswers)
      setScore(finalScore)

      // Guardar respuestas en leads
      const { data: existingLeads, error } = await supabase
        .from('leads')
        .select('id')
        .eq('email', lead.email)
        .limit(1)

      if (!error && existingLeads?.length > 0) {
        await supabase
          .from('leads')
          .update({
            monthly_sales: newAnswers.monthly_sales,
            knows_margin: newAnswers.knows_margin,
            controls_costs: newAnswers.controls_costs,
            knows_best_product: newAnswers.knows_best_product,
            ceo_score: finalScore,
            updated_at: new Date(),
          })
          .eq('id', existingLeads[0].id)
      }

      // Generar análisis con Gemini
      setLoadingAnalysis(true)
      const geminiAnalysis = await generateBusinessDiagnosis(newAnswers)
      setAnalysis(geminiAnalysis)
      setLoadingAnalysis(false)
      setStep(2)
    }
  }

  const handleProceedToPlan = () => {
    setStep(3)
  }

  const handleSignUp = () => {
    navigate('/paywall')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0a12] via-[#2d1020] to-[#1a0a12] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/brand/isotipo.png"
            alt="CEO Rentable OS"
            className="w-10 h-10 mx-auto object-contain mb-2"
          />
          <p className="text-xs text-pink-300/60 font-semibold uppercase tracking-widest">CEO Rentable OS™</p>
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 0 — CAPTURE */}
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 bg-pink-500/10 border border-pink-500/20 text-pink-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
                  <Zap className="h-3 w-3" /> Diagnóstico gratuito · 3 minutos
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  Descubre si tu negocio
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                    realmente está ganando dinero
                  </span>
                </h1>
                <p className="text-white/50 text-sm mt-3">Responde 4 preguntas y obtén tu CEO Score™ gratis.</p>
              </div>
              <div className="space-y-3">
                <Input
                  placeholder="Tu nombre"
                  value={lead.name}
                  onChange={(e) => setLead((p) => ({ ...p, name: e.target.value }))}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 rounded-xl"
                  onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                />
                <Input
                  placeholder="Tu email"
                  type="email"
                  value={lead.email}
                  onChange={(e) => setLead((p) => ({ ...p, email: e.target.value }))}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 rounded-xl"
                  onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                />
                <Button
                  className="w-full h-12 text-base font-bold bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 border-0 rounded-xl"
                  onClick={handleCapture}
                  disabled={!lead.name.trim() || !lead.email.trim() || saving}
                >
                  {saving ? 'Un momento...' : 'Comenzar diagnóstico'} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
                <p className="text-center text-xs text-white/25 mt-2">Sin spam. Solo resultados.</p>
              </div>
            </motion.div>
          )}

          {/* STEP 1 — QUESTIONS */}
          {step === 1 && (
            <motion.div
              key={`q${qIndex}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              {/* Progress */}
              <div className="flex gap-1.5 mb-8">
                {QUESTIONS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                      i <= qIndex ? 'bg-pink-500' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-pink-300/60 font-semibold uppercase tracking-widest mb-3">
                Pregunta {qIndex + 1} de {QUESTIONS.length}
              </p>
              <h2 className="text-xl sm:text-2xl font-black text-white mb-2">{QUESTIONS[qIndex].text}</h2>
              {QUESTIONS[qIndex].subtext && (
                <p className="text-white/40 text-sm mb-6">{QUESTIONS[qIndex].subtext}</p>
              )}
              <div className="space-y-3">
                {QUESTIONS[qIndex].type === 'choice' ? (
                  QUESTIONS[qIndex].options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleAnswer(opt.value)}
                      className="w-full text-left px-5 py-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-pink-500/50 text-white font-medium transition-all duration-200 text-sm"
                    >
                      {opt.label}
                    </button>
                  ))
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleAnswer(true)}
                      className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold transition-all text-base"
                    >
                      <CheckCircle className="h-5 w-5" /> Sí
                    </button>
                    <button
                      onClick={() => handleAnswer(false)}
                      className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-bold transition-all text-base"
                    >
                      <XCircle className="h-5 w-5" /> No
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 2 — RESULT (con Gemini Analysis) */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 shadow-2xl overflow-y-auto max-h-[85vh]"
            >
              <p className="text-xs text-pink-300/60 font-semibold uppercase tracking-widest text-center mb-6">
                Tu CEO Score™
              </p>
              <div className="flex justify-center mb-6">
                <ScoreArc score={score} />
              </div>

              {loadingAnalysis && (
                <div className="flex items-center justify-center gap-2 p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl mb-6">
                  <Loader className="h-5 w-5 text-blue-400 animate-spin" />
                  <p className="text-sm text-blue-300">Generando análisis con IA...</p>
                </div>
              )}

              {analysis && !loadingAnalysis && (
                <div className="space-y-4">
                  {/* Análisis principal */}
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <h3 className="text-sm font-bold text-pink-300 mb-2">💡 Diagnóstico IA</h3>
                    <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{analysis.diagnosis}</p>
                  </div>

                  {/* Recomendaciones */}
                  {analysis.recommendations && analysis.recommendations.length > 0 && (
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                      <h3 className="text-sm font-bold text-emerald-300 mb-3">📋 Plan de acción</h3>
                      <div className="space-y-2">
                        {analysis.recommendations.slice(0, 3).map((rec, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-emerald-400 font-bold">{i + 1}.</span>
                            <p className="text-white/80">{rec}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 border-0 rounded-xl mt-6"
                onClick={handleProceedToPlan}
              >
                Ver cómo mejorar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* STEP 3 — CTA */}
          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center mx-auto mb-5">
                <TrendingUp className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-2xl font-black text-white mb-3">
                Ahora mira tu negocio completo
              </h2>
              <p className="text-white/50 text-sm leading-relaxed mb-8">
                Este diagnóstico es solo una vista rápida.
                <br />
                Dentro del sistema puedes ver exactamente cuánto ganas,
                <br />
                qué estás perdiendo y cómo mejorar.
              </p>

              <div className="space-y-3">
                <Button
                  onClick={handleSignUp}
                  className="w-full h-14 text-base font-bold bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 border-0 rounded-xl"
                >
                  Entrar al sistema completo <ArrowRight className="h-5 w-5 ml-1" />
                </Button>
                <a href="https://ceorentable.com" target="_blank" rel="noopener noreferrer" className="block">
                  <Button variant="outline" className="w-full h-12 text-sm font-semibold border-white/20 bg-transparent text-white hover:bg-white/10 rounded-xl">
                    Ver planes y precios
                  </Button>
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                {[
                  ['📊', 'Rentabilidad real'],
                  ['🎯', 'CEO Score en vivo'],
                  ['📄', 'Facturas automáticas'],
                ].map(([icon, label]) => (
                  <div key={label}>
                    <p className="text-xl mb-1">{icon}</p>
                    <p className="text-[11px] text-white/40 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

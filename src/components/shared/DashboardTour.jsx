import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

const TOUR_STEPS = [
  {
    targetId: null,
    title: '¡Bienvenida a tu sistema! 🎉',
    description: 'Este es CEO Rentable OS™. En menos de 2 minutos te explico cada parte para que saques el máximo provecho.',
  },
  {
    targetId: 'kpis-section',
    title: 'Tus números clave 💰',
    description: 'Aquí ves en tiempo real cuánto ingresaste, cuánto te costó, cuánto ganaste y tu margen. El margen % es el número más importante de tu negocio.',
  },
  {
    targetId: 'ceo-score-section',
    title: 'Tu CEO Score™ 📊',
    description: 'Un número del 0 al 100 que mide la salud financiera de tu negocio. 70+ es saludable, 40–69 necesita atención, menos de 40 es urgente.',
  },
  {
    targetId: 'diagnostico-section',
    title: 'Diagnóstico estratégico 🎯',
    description: 'El sistema detecta automáticamente problemas y oportunidades en tu negocio. Te dice exactamente qué ajustar para ganar más.',
  },
  {
    targetId: 'breakeven-section',
    title: 'Punto de equilibrio y mejores productos 🏆',
    description: 'Aquí ves cuándo superas el punto de equilibrio, cuál es tu producto más rentable y tu cliente más valioso.',
  },
  {
    targetId: 'checklist-section',
    title: 'Tus tareas de hoy ✅',
    description: 'Un recordatorio diario para que no pierdas el control: productos, ventas, facturas y alertas. Ve completando cada una.',
  },
  {
    targetId: null,
    title: '¡Ya conoces el sistema! 🚀',
    description: 'Recuerda: entre más uses el sistema, más preciso será tu CEO Score y mejores decisiones tomarás. ¡Empieza hoy!',
  },
];

const TOUR_KEY = 'ceo_dashboard_tour_done_v2';

function getElementRect(id) {
  if (!id) return null;
  const el = document.getElementById(id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
    viewTop: rect.top,
    viewLeft: rect.left,
  };
}

export default function DashboardTour({ userEmail }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!userEmail) return;
    const done = localStorage.getItem(`${TOUR_KEY}_${userEmail}`);
    if (!done) {
      const timer = setTimeout(() => setActive(true), 900);
      return () => clearTimeout(timer);
    }
  }, [userEmail]);

  const updateRect = useCallback(() => {
    const target = TOUR_STEPS[step]?.targetId;
    if (!target) { setRect(null); return; }
    const r = getElementRect(target);
    setRect(r);
    if (r) {
      const el = document.getElementById(target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(updateRect, 350);
    return () => clearTimeout(t);
  }, [active, step, updateRect]);

  const finish = () => {
    localStorage.setItem(`${TOUR_KEY}_${userEmail}`, 'done');
    setActive(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
    else finish();
  };

  const prev = () => { if (step > 0) setStep(s => s - 1); };

  if (!active) return null;

  const current = TOUR_STEPS[step];
  const PAD = 8;

  // Tooltip position: below the highlight, or centered if no target
  let tooltipStyle = {};
  if (rect) {
    const below = rect.viewTop + rect.height + PAD + 160 < window.innerHeight;
    tooltipStyle = {
      position: 'fixed',
      left: Math.max(8, Math.min(rect.viewLeft + rect.width / 2 - 170, window.innerWidth - 356)),
      top: below
        ? rect.viewTop + rect.height + PAD + 8
        : rect.viewTop - 160 - PAD,
    };
  } else {
    tooltipStyle = {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>

        {/* Dark overlay with cutout */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'auto' }}
          onClick={finish}
        >
          <defs>
            <mask id="spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.viewLeft - PAD}
                  y={rect.viewTop - PAD}
                  width={rect.width + PAD * 2}
                  height={rect.height + PAD * 2}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.65)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Highlight border */}
        {rect && (
          <motion.div
            key={`highlight-${step}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'fixed',
              left: rect.viewLeft - PAD,
              top: rect.viewTop - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              borderRadius: 12,
              border: '2.5px solid hsl(336, 60%, 58%)',
              boxShadow: '0 0 0 4px hsla(336,60%,58%,0.2)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Tooltip card */}
        <motion.div
          key={`tooltip-${step}`}
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{ ...tooltipStyle, pointerEvents: 'auto', width: 340, zIndex: 10000 }}
        >
          <div className="bg-card rounded-2xl border border-primary/30 shadow-2xl p-5">
            {/* Close */}
            <button
              onClick={finish}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Progress dots */}
            <div className="flex gap-1.5 mb-3">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-5 bg-primary' : i < step ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted'
                  }`}
                />
              ))}
            </div>

            <h3 className="text-base font-bold text-foreground mb-1">{current.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{current.description}</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {step > 0 && (
                  <Button variant="ghost" size="sm" onClick={prev} className="gap-1 text-xs px-2">
                    <ChevronLeft className="h-3.5 w-3.5" /> Atrás
                  </Button>
                )}
                <button onClick={finish} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                  Omitir
                </button>
              </div>
              <Button size="sm" onClick={next} className="gap-1.5">
                {step < TOUR_STEPS.length - 1 ? 'Siguiente' : '¡Entendido!'} <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * PageTour — mini tour flotante para cualquier módulo.
 * Props:
 *   pageName  {string}  — clave única del módulo (ej: "Products")
 *   userEmail {string}  — para personalizar la key de localStorage
 *   steps     {Array}   — [{ title, description }]
 */
const KEY = (page, email) => `page_tour_v1_${page}_${email}`;

export default function PageTour({ pageName, userEmail, steps = [] }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!userEmail || !pageName || steps.length === 0) return;
    let t;
    try {
      const done = localStorage.getItem(KEY(pageName, userEmail));
      if (!done) t = setTimeout(() => setVisible(true), 700);
    } catch {
      t = setTimeout(() => setVisible(true), 700);
    }
    return () => clearTimeout(t);
  }, [userEmail, pageName, steps.length]);

  const finish = () => {
    setVisible(false);
    setStep(0);
    try {
      localStorage.setItem(KEY(pageName, userEmail), 'done');
    } catch {
      // En navegación privada algunos navegadores pueden bloquear localStorage.
      // Aun así cerramos el tour para no bloquear la interfaz.
    }
  };

  if (!visible || steps.length === 0) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="page-tour"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-[9990] max-h-[70dvh] overflow-y-auto rounded-2xl border border-primary/30 bg-card p-5 shadow-2xl sm:left-auto sm:right-6 sm:w-80"
      >
        {/* Close */}
        <button
          onClick={finish}
          type="button"
          aria-label="Cerrar guía"
          className="absolute top-3 right-3 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-5 bg-primary' : i < step ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted'
              }`}
            />
          ))}
        </div>

        <h3 className="text-sm font-bold text-foreground mb-1 pr-4">{current.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{current.description}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1 text-xs px-2">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <button type="button" onClick={finish} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
              Omitir
            </button>
          </div>
          <Button type="button" size="sm" onClick={() => isLast ? finish() : setStep(s => Math.min(s + 1, steps.length - 1))} className="gap-1.5">
            {isLast ? '¡Entendido!' : 'Siguiente'} {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
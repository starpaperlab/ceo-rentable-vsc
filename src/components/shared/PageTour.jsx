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
    const done = localStorage.getItem(KEY(pageName, userEmail));
    if (!done) {
      const t = setTimeout(() => setVisible(true), 700);
      return () => clearTimeout(t);
    }
  }, [userEmail, pageName]);

  const finish = () => {
    localStorage.setItem(KEY(pageName, userEmail), 'done');
    setVisible(false);
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
        className="fixed bottom-6 right-6 z-[9990] w-80 bg-card border border-primary/30 rounded-2xl shadow-2xl p-5"
      >
        {/* Close */}
        <button
          onClick={finish}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
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
              <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1 text-xs px-2">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <button onClick={finish} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
              Omitir
            </button>
          </div>
          <Button size="sm" onClick={() => isLast ? finish() : setStep(s => s + 1)} className="gap-1.5">
            {isLast ? '¡Entendido!' : 'Siguiente'} {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
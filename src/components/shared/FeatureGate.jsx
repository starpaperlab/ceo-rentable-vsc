import React from 'react';
import { Lock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeatureGate } from '@/hooks/useFeatureGate';

const PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK || 'https://ceorentable.com';

/**
 * FeatureGate — wraps content that requires a specific feature/plan.
 * 
 * Props:
 *   feature {string}  — feature key: 'luna' | 'automatizaciones' | 'nuevas_funciones'
 *   children          — content to show when access is granted
 *   fallback          — optional custom fallback (defaults to upgrade card)
 *   inline {boolean}  — show compact inline badge instead of full card
 */
export default function FeatureGate({ feature, children, fallback, inline = false }) {
  const { hasFeature, loading } = useFeatureGate();

  if (loading) return null;
  if (hasFeature(feature)) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  if (inline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-dashed border-border rounded-full px-3 py-1">
        <Lock className="h-3 w-3" />
        Disponible en plan mensual
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-10 text-center">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-foreground text-sm">Disponible en plan mensual</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Esta función es exclusiva del plan de suscripción mensual. Actívala para acceder.
        </p>
      </div>
      <Button
        size="sm"
        className="gap-2"
        onClick={() => window.open(PAYMENT_LINK, '_blank')}
      >
        <Zap className="h-3.5 w-3.5" />
        Activar suscripción
      </Button>
    </div>
  );
}
import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const NIVELES = [
  { min: 71, label: 'Saludable', color: 'text-green-600', barColor: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', icon: ShieldCheck },
  { min: 41, label: 'Inestable',  color: 'text-amber-600', barColor: 'bg-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30',  border: 'border-amber-200 dark:border-amber-800',  icon: TrendingUp   },
  { min: 0,  label: 'Riesgo Crítico', color: 'text-red-600', barColor: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', icon: AlertTriangle },
];

function getNivel(score) {
  return NIVELES.find(n => score >= n.min) || NIVELES[2];
}

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val));
}

export function calculateCEOScore(products, clients, records, config) {
  const sorted = [...records].sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  const totalIncome   = records.reduce((s, r) => s + (r.income    || 0), 0);
  const totalExpenses = records.reduce((s, r) => s + (r.expenses  || 0), 0);
  const netProfit     = totalIncome - totalExpenses;

  // 1. Margen de ganancia (0-100) → peso 40%
  const avgMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
  const margenScore = clamp(avgMargin * 2); // 50% margen = 100 pts

  // 2. Crecimiento de ingresos → peso 30%
  const lastMonth = sorted[sorted.length - 1]?.income || 0;
  const prevMonth = sorted[sorted.length - 2]?.income || 0;
  const growthPct = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : (lastMonth > 0 ? 50 : 0);
  // -20% → 0 pts, +40% → 100 pts
  const growthScore = clamp(((growthPct + 20) / 60) * 100);

  // 3. Control de gastos → peso 30%
  // Ratio gasto/ingreso: 0% gastos = 100 pts, 100% gastos = 0 pts
  const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 100;
  const gastosScore  = clamp(100 - expenseRatio);

  const score = Math.round(
    margenScore  * 0.40 +
    growthScore  * 0.30 +
    gastosScore  * 0.30
  );

  return {
    score,
    components: { avgMargin, growthPct, expenseRatio, margenScore, growthScore, gastosScore },
  };
}

function PillarBar({ label, score, color }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-[10px] font-bold text-foreground">{Math.round(score)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

export default function CEOScoreCard({ products, clients, records, config }) {
  const { score, components } = useMemo(
    () => calculateCEOScore(products, clients, records, config),
    [products, clients, records, config]
  );

  const nivel = getNivel(score);
  const Icon = nivel.icon;

  return (
    <Card className={`p-6 relative overflow-hidden border-2 ${nivel.bg} ${nivel.border}`}>
      {/* Background icon */}
      <div className="absolute top-0 right-0 w-28 h-28 opacity-5 transform translate-x-6 -translate-y-6 pointer-events-none">
        <Icon className="w-full h-full" />
      </div>

      <div className="relative space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">CEO Score™</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Salud Financiera Global</p>
          </div>
          <Badge className={`${nivel.bg} ${nivel.color} border ${nivel.border} font-semibold`}>
            {nivel.label}
          </Badge>
        </div>

        {/* Score + bar */}
        <div className="flex items-end gap-4">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
          >
            <motion.p
              key={score}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`text-6xl font-black ${nivel.color}`}
            >
              {score}
            </motion.p>
            <p className="text-xs text-muted-foreground">de 100 pts</p>
          </motion.div>

          <div className="flex-1 pb-2 space-y-1.5">
            {/* Main bar */}
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${score}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                className={`h-full rounded-full ${nivel.barColor}`}
              />
            </div>
            {/* Range labels */}
            <div className="flex justify-between text-[9px] text-muted-foreground px-0.5">
              <span className="text-red-500 font-medium">0 · Crítico</span>
              <span className="text-amber-500 font-medium">41 · Inestable</span>
              <span className="text-green-600 font-medium">71 · Saludable</span>
            </div>
          </div>
        </div>

        {/* Pillar breakdown */}
        <div className="space-y-2 pt-3 border-t border-border/40">
          <PillarBar label="Margen de Ganancia" score={components.margenScore} color={nivel.barColor} />
          <PillarBar label="Crecimiento de Ingresos" score={components.growthScore} color={nivel.barColor} />
          <PillarBar label="Control de Gastos" score={components.gastosScore} color={nivel.barColor} />
        </div>
      </div>
    </Card>
  );
}
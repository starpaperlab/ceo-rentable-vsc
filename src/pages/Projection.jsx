import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';
import PageTour from '@/components/shared/PageTour';
import { motion } from 'framer-motion';
import { fetchOwnedRows } from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Proyeccion 90 Dias', description: 'Proyecta lo que puedes ganar en el proximo trimestre usando tu historial real.' },
  { title: 'Meta Trimestral', description: 'Define tu meta y compara rapidamente cuanto llevas versus lo proyectado.' },
  { title: 'Escenarios', description: 'Compara escenario conservador, realista y escalable para decidir mejor.' },
];

const SCENARIOS = [
  { key: 'conservative', label: 'Conservador', growth: 0.05, badge: 'Bajo Riesgo', effort: 'Bajo', badgeClass: 'bg-violet-100 text-violet-700 border-violet-200' },
  { key: 'realistic', label: 'Realista', growth: 0.15, badge: 'Recomendado', effort: 'Moderado', badgeClass: 'bg-violet-100 text-violet-700 border-violet-200' },
  { key: 'scalable', label: 'Escalable', growth: 0.30, badge: 'Alto Impacto', effort: 'Alto', badgeClass: 'bg-violet-100 text-violet-700 border-violet-200' },
];

export default function Projection() {
  const { formatMoney } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;
  const [quarterlyGoal, setQuarterlyGoal] = useState(65000);
  const [activeScenario, setActiveScenario] = useState('realistic');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['monthly-records', user?.id, ownerEmail, adminMode],
    queryFn: async () => {
      const ownerId = user?.id || userProfile?.id;
      return fetchOwnedRows({
        table: 'monthly_records',
        ownerId,
        ownerEmail,
        adminMode,
        orderBy: 'month',
        ascending: false,
      });
    },
    enabled: adminMode || !!(user?.id || ownerEmail),
  });

  const currentIncome = records.reduce((sum, record) => sum + (record.income || 0), 0);
  const currentAvgMonthly = records.length > 0 ? currentIncome / records.length : 0;

  const projections = useMemo(() => SCENARIOS.map((scenario) => {
    const projectedMonthly = currentAvgMonthly * (1 + scenario.growth);
    const projectedQuarterly = projectedMonthly * 3;
    const salesNeeded = quarterlyGoal > 0 ? Math.ceil(quarterlyGoal / Math.max(projectedMonthly, 1)) : 0;
    return {
      ...scenario,
      projected: projectedQuarterly,
      monthly: projectedMonthly,
      salesNeeded,
      pctOfGoal: quarterlyGoal > 0 ? (projectedQuarterly / quarterlyGoal) * 100 : 0,
    };
  }), [currentAvgMonthly, quarterlyGoal]);

  const active = projections.find((projection) => projection.key === activeScenario);

  const chartData = [
    { name: 'Mes 1', monto: active?.monthly || 0 },
    { name: 'Mes 2', monto: (active?.monthly || 0) * 1.06 },
    { name: 'Mes 3', monto: (active?.monthly || 0) * 1.12 },
  ];

  const remaining = quarterlyGoal - currentIncome;
  const progressPct = quarterlyGoal > 0 ? Math.min((currentIncome / quarterlyGoal) * 100, 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1020px] mx-auto space-y-5">
      <PageTour pageName="Projection" userEmail={ownerEmail} steps={TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-[34px] leading-[1.04] font-extrabold tracking-tight text-foreground">Proyección 90 Días</h1>
        <p className="text-sm text-muted-foreground mt-1">Proyecta cuánto puedes ganar. Simula escenarios y toma mejores decisiones.</p>
      </motion.div>

      <Card className="p-5 rounded-2xl border border-[#E7E1D9] shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-[0.12em]">¿Cuánto quieres ganar este trimestre?</p>
            <div className="flex items-baseline gap-2 mt-1.5">
              <Input
                type="number"
                value={quarterlyGoal || ''}
                onChange={(event) => setQuarterlyGoal(parseFloat(event.target.value) || 0)}
                className="w-[170px] h-auto border-none shadow-none bg-transparent p-0 text-[28px] leading-none font-extrabold focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span><strong className="font-semibold text-muted-foreground">Logrado:</strong> {formatMoney(currentIncome)}</span>
              <span className="text-primary font-semibold"><strong>Faltan:</strong> {formatMoney(Math.max(remaining, 0))}</span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-full border-[3px] border-[#D45387] flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[#D45387]">{progressPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="mt-3.5 h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-[#D45387] rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      </Card>

      <div className="inline-flex items-center gap-1.5 p-1 rounded-xl border border-[#E7E1D9] bg-white">
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.key}
            onClick={() => setActiveScenario(scenario.key)}
            className={`px-3.5 h-8 rounded-lg text-xs font-semibold transition-all ${
              activeScenario === scenario.key
                ? 'bg-[#D45387] text-white'
                : 'text-foreground hover:bg-muted'
            }`}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {projections.map((projection) => (
          <motion.div key={projection.key} layout className="h-full">
            <Card className={`h-full min-h-[250px] p-4 rounded-2xl border transition-all duration-200 flex flex-col ${
              projection.key === activeScenario
                ? 'border-[#D45387] shadow-[0_0_0_2px_rgba(212,83,135,0.18)]'
                : 'border-[#E7E1D9] shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
            }`}>
              <Badge className={`mb-2.5 border text-[10px] font-bold ${projection.badgeClass}`}>
                {projection.badge}
              </Badge>
              <h3 className="text-[28px] leading-[1.1] font-extrabold tracking-tight text-foreground">Escenario {projection.label}</h3>
              <p className="text-[11px] text-muted-foreground mt-1">Crecimiento: +{(projection.growth * 100).toFixed(0)}%</p>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Beneficio Neto</span>
                  <span className="font-bold">{formatMoney(projection.projected)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Esfuerzo</span>
                  <span className="font-medium">{projection.effort}</span>
                </div>
              </div>
              <Button
                variant="outline"
                className={`w-full mt-auto h-9 rounded-xl text-xs font-semibold ${
                  projection.key === activeScenario
                    ? 'bg-[#D45387] text-white border-[#D45387] hover:bg-[#C24578] hover:text-white'
                    : 'border-border'
                }`}
                onClick={() => setActiveScenario(projection.key)}
              >
                {projection.key === activeScenario ? 'Meta Actual' : 'Establecer como Meta'}
              </Button>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 rounded-2xl border border-[#E7E1D9] shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h3 className="text-sm font-bold text-foreground mb-3">Proyección Trimestral</h3>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              formatter={(value) => [formatMoney(value), 'Proyección']}
            />
            <Bar dataKey="monto" fill="#D45387" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

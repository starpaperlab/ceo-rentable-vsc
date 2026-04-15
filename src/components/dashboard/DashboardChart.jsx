import React from 'react';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from '@/components/shared/CurrencyContext';

export default function DashboardChart({ records }) {
  const { formatMoney } = useCurrency();

  const chartData = [...records]
    .sort((a, b) => a.month?.localeCompare(b.month))
    .map(r => ({
      month: r.month?.slice(5) || '',
      ingresos: r.income || 0,
      gastos: r.expenses || 0,
      beneficio: (r.income || 0) - (r.expenses || 0),
    }));

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Proyección de Ingresos vs Gastos</h3>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(336, 60%, 58%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(336, 60%, 58%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(275, 52%, 64%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(275, 52%, 64%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              formatter={(val) => [formatMoney(val)]}
            />
            <Area type="monotone" dataKey="ingresos" stroke="hsl(336, 60%, 58%)" fill="url(#colorIngresos)" strokeWidth={2} />
            <Area type="monotone" dataKey="gastos" stroke="hsl(275, 52%, 64%)" fill="url(#colorGastos)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
          Sin datos mensuales aún
        </div>
      )}
    </Card>
  );
}
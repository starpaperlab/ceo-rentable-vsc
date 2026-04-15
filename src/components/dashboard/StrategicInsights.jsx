import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, CheckCircle, TrendingDown, Users, Target } from 'lucide-react';
import { motion } from 'framer-motion';

const SEVERITY = {
  critica: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800' },
  advertencia: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/20', border: 'border-yellow-200 dark:border-yellow-800' },
  estable: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/20', border: 'border-green-200 dark:border-green-800' },
};

function generateInsights(products, clients, records, config) {
  const insights = [];
  
  const totalIncome = records.reduce((s, r) => s + (r.income || 0), 0);
  const totalExpenses = records.reduce((s, r) => s + (r.expenses || 0), 0);
  const netProfit = totalIncome - totalExpenses;
  const avgMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100) : 0;
  const targetMargin = config?.target_margin_pct || 40;
  
  // Insight 1: Margen bajo
  if (avgMargin < targetMargin && avgMargin > 0) {
    insights.push({
      severity: avgMargin < targetMargin * 0.5 ? 'critica' : 'advertencia',
      icon: TrendingDown,
      titulo: 'Margen por Debajo de Meta',
      descripcion: `Tu margen promedio es ${avgMargin.toFixed(1)}%, tu objetivo es ${targetMargin}%.`,
      accion: 'Revisa tus costos ocultos y considera aumentar precios estratégicamente.',
    });
  }
  
  // Insight 2: Producto en zona de fuga
  const lowMarginProducts = products.filter(p => p.status === 'active' && (p.margin_pct || 0) < 20);
  if (lowMarginProducts.length > 0) {
    insights.push({
      severity: 'advertencia',
      icon: AlertCircle,
      titulo: `${lowMarginProducts.length} Producto(s) en Zona de Fuga`,
      descripcion: `Tienes productos con margen menor al 20% que están drenando rentabilidad.`,
      accion: 'Optimiza costos o considera eliminar productos no rentables.',
    });
  }
  
  // Insight 3: Alta dependencia de cliente
  const totalBilled = clients.reduce((s, c) => s + (c.total_billed || 0), 0);
  const topClient = clients.length > 0 ? Math.max(...clients.map(c => c.total_billed || 0)) : 0;
  const dependencia = totalBilled > 0 ? (topClient / totalBilled * 100) : 0;
  if (dependencia > 60 && clients.length > 0) {
    insights.push({
      severity: 'advertencia',
      icon: Users,
      titulo: 'Alta Dependencia de Cliente Único',
      descripcion: `Un solo cliente representa el ${dependencia.toFixed(0)}% de tus ingresos.`,
      accion: 'Diversifica tu base de clientes para reducir riesgo.',
    });
  }
  
  // Insight 4: Contracción
  const sorted = [...records].sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  const lastMonth = sorted[sorted.length - 1]?.income || 0;
  const prevMonth = sorted[sorted.length - 2]?.income || 0;
  const growth = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth * 100) : 0;
  if (growth < 0 && records.length >= 2) {
    insights.push({
      severity: 'critica',
      icon: TrendingDown,
      titulo: 'Contracción de Ingresos Detectada',
      descripcion: `Tus ingresos cayeron ${Math.abs(growth).toFixed(1)}% respecto al mes anterior.`,
      accion: 'Analiza causas y ajusta estrategia de adquisición.',
    });
  }
  
  // Insight 5: Cumplimiento positivo
  const goal = config?.quarterly_goal || 65000;
  const cumplimiento = goal > 0 ? (totalIncome / goal * 100) : 0;
  if (cumplimiento > 80 && insights.length < 3) {
    insights.push({
      severity: 'estable',
      icon: Target,
      titulo: '¡Meta Trimestral en Camino!',
      descripcion: `Has alcanzado el ${cumplimiento.toFixed(0)}% de tu objetivo trimestral.`,
      accion: 'Mantén el momentum y considera aumentar tu meta.',
    });
  }
  
  return insights.slice(0, 3);
}

export default function StrategicInsights({ products, clients, records, config }) {
  const insights = useMemo(
    () => generateInsights(products, clients, records, config),
    [products, clients, records, config]
  );
  
  if (insights.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Diagnóstico Estratégico</h3>
        <div className="flex items-center justify-center py-8 text-center">
          <div>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Todo en Orden</p>
            <p className="text-xs text-muted-foreground mt-1">No hay alertas estratégicas en este momento.</p>
          </div>
        </div>
      </Card>
    );
  }
  
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Diagnóstico Estratégico</h3>
        <span className="text-xs text-muted-foreground">{insights.length} insight{insights.length > 1 ? 's' : ''}</span>
      </div>
      
      <div className="space-y-3">
        {insights.map((insight, i) => {
          const config = SEVERITY[insight.severity];
          const Icon = insight.icon;
          
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`p-4 rounded-lg border ${config.bg} ${config.border}`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 ${config.color} mt-0.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${config.color}`}>{insight.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-1">{insight.descripcion}</p>
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs font-medium text-foreground">💡 Acción sugerida:</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{insight.accion}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
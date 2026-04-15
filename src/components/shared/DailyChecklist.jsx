import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const TODAY = new Date().toISOString().split('T')[0];

export default function DailyChecklist({ userEmail }) {
  const [collapsed, setCollapsed] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['checklist-products', userEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('created_by', userEmail)
      if (error) throw error
      return data || []
    },
    enabled: !!userEmail,
  });

  const { data: todayInvoices = [] } = useQuery({
    queryKey: ['checklist-invoices', userEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('created_by', userEmail)
      if (error) throw error
      return data || []
    },
    enabled: !!userEmail,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['checklist-alerts', userEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('created_by', userEmail)
        .eq('leida', false)
      if (error) throw error
      return data || []
    },
    enabled: !!userEmail,
  });

  const hasProducts = products.length > 0;
  const hasTodaySale = todayInvoices.some(inv => (inv.date || inv.created_date || '').startsWith(TODAY));
  const hasPendingInvoice = todayInvoices.some(inv => inv.status === 'pending');
  const alertsChecked = alerts.length === 0;

  const tasks = [
    { label: 'Tienes productos registrados', done: hasProducts },
    { label: 'Registraste una venta hoy', done: hasTodaySale },
    { label: 'Sin facturas pendientes', done: !hasPendingInvoice },
    { label: 'Sin alertas pendientes', done: alertsChecked },
  ];

  const doneCount = tasks.filter(t => t.done).length;
  const pct = Math.round((doneCount / tasks.length) * 100);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <p className="text-sm font-bold text-foreground">Hoy en tu negocio</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {doneCount} de {tasks.length} tareas
          </span>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">
        {pct === 100 ? '🎉 ¡Todo al día!' : `Llevas ${doneCount} de ${tasks.length} tareas completadas`}
      </p>

      {!collapsed && (
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2.5"
            >
              {task.done
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              }
              <span className={`text-sm ${task.done ? 'text-foreground line-through text-muted-foreground' : 'text-foreground'}`}>
                {task.label}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
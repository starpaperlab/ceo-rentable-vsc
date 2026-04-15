import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Mail, CheckCircle, Clock, TrendingDown } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { toast } from 'sonner';
import { differenceInDays, parseISO } from 'date-fns';

function getDaysOverdue(invoice) {
  const ref = invoice.due_date || invoice.date;
  if (!ref) return 0;
  return differenceInDays(new Date(), parseISO(ref));
}

function getOverdueBadge(days) {
  if (days > 60) return { label: `+${days}d`, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300' };
  if (days > 30) return { label: `+${days}d`, className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300' };
  return { label: `+${days}d`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300' };
}

export default function OverdueDashboard({ invoices }) {
  const { formatMoney } = useCurrency()
  const queryClient = useQueryClient()
  const [sending, setSending] = useState({})

  const overdueInvoices = invoices.filter(inv => {
    if (inv.status === 'paid') return false;
    const days = getDaysOverdue(inv);
    return days > 0;
  }).sort((a, b) => getDaysOverdue(b) - getDaysOverdue(a));

  const critical = overdueInvoices.filter(i => getDaysOverdue(i) > 30);
  const totalOverdue = overdueInvoices.reduce((s, i) => s + (i.total_final || 0), 0);
  const totalCritical = critical.reduce((s, i) => s + (i.total_final || 0), 0);

  const markOverdueMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'overdue' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
    onError: (error) => toast.error(`No se pudo marcar vencida: ${error.message}`),
  })

  const markPaidMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Factura marcada como pagada')
    },
    onError: (error) => {
      toast.error(`No se pudo marcar como pagada: ${error.message}`);
    },
  })

  const sendReminder = async (invoice) => {
    if (!invoice.client_email) {
      toast.error('Este cliente no tiene email registrado')
      return
    }
    setSending((prev) => ({ ...prev, [invoice.id]: true }))

    try {
      // Actualizar estado en Supabase (emailService se integrará luego)
      const { error } = await supabase
        .from('invoices')
        .update({
          reminder_sent_at: new Date().toISOString(),
          status: 'overdue',
        })
        .eq('id', invoice.id)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(`Recordatorio registrado para ${invoice.client_email}`)
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setSending((prev) => ({ ...prev, [invoice.id]: false }))
    }
  }

  if (overdueInvoices.length === 0) {
    return (
      <Card className="p-6 flex items-center gap-4 border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
        <CheckCircle className="h-8 w-8 text-green-500 shrink-0" />
        <div>
          <p className="font-semibold text-green-700 dark:text-green-400">¡Sin cuentas vencidas!</p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">Todas tus facturas están al día.</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 border-amber-300 dark:border-amber-700">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vencidas</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{overdueInvoices.length}</p>
          <p className="text-sm text-amber-600 font-medium mt-0.5">{formatMoney(totalOverdue)}</p>
        </Card>
        <Card className="p-4 border-red-300 dark:border-red-800">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">+30 días</p>
          </div>
          <p className="text-2xl font-bold text-red-600">{critical.length}</p>
          <p className="text-sm text-red-500 font-medium mt-0.5">{formatMoney(totalCritical)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exposición total</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatMoney(totalOverdue)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{overdueInvoices.length} facturas pendientes</p>
        </Card>
      </div>

      {/* List */}
      <div className="space-y-2">
        {overdueInvoices.map((inv) => {
          const days = getDaysOverdue(inv)
          const badge = getOverdueBadge(days)
          const isCritical = days > 30

          return (
            <Card key={inv.id} className={`p-4 ${isCritical ? 'border-red-300 dark:border-red-800' : 'border-amber-200 dark:border-amber-800'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{inv.client_name || 'Sin nombre'}</p>
                    <span className="text-xs font-mono text-muted-foreground">{inv.invoice_number}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}>
                      {badge.label} atrasada
                    </span>
                    {inv.reminder_sent_at && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" /> Recordatorio enviado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-muted-foreground">Vence: {inv.due_date || inv.date}</p>
                    {inv.client_email && <p className="text-xs text-muted-foreground">{inv.client_email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-bold text-foreground">{formatMoney(inv.total_final || 0)}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => sendReminder(inv)}
                    disabled={sending[inv.id]}
                  >
                    <Mail className="h-3 w-3 mr-1" />
                    {sending[inv.id] ? 'Enviando...' : 'Recordatorio'}
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => markPaidMutation.mutate(inv.id)}
                    disabled={markPaidMutation.isPending}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Pagada
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

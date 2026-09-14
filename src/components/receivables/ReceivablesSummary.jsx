import React from 'react';
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';

export default function ReceivablesSummary({ summary }) {
  const { formatMoney } = useCurrency();
  const cards = [
    {
      label: 'Total pendiente por cobrar',
      value: formatMoney(summary.totalPending),
      note: `${summary.clientsWithBalance} cliente${summary.clientsWithBalance === 1 ? '' : 's'} con saldo`,
      icon: Clock,
      className: 'text-red-600',
    },
    {
      label: 'Total cobrado',
      value: formatMoney(summary.totalCollected),
      note: 'Desde abonos reales registrados',
      icon: CheckCircle2,
      className: 'text-green-600',
    },
    {
      label: 'Facturas pendientes',
      value: summary.pendingInvoices,
      note: `${summary.partialInvoices} con pago parcial`,
      icon: Users,
      className: 'text-foreground',
    },
    {
      label: 'Facturas vencidas',
      value: summary.overdueInvoices,
      note: 'Con saldo y fecha vencida',
      icon: AlertTriangle,
      className: summary.overdueInvoices > 0 ? 'text-red-600' : 'text-foreground',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</p>
                <p className={`mt-1 text-2xl font-bold ${card.className}`}>{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <card.icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div>
          <p className="text-sm font-semibold">Antigüedad de cuentas por cobrar</p>
          <p className="mt-1 text-xs text-muted-foreground">El aging se calcula en tiempo real desde la fecha de vencimiento. No se guarda duplicado en la base de datos.</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(summary.agingBuckets || []).map((bucket) => (
            <div key={bucket.value} className="rounded-xl border border-border/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{bucket.label}</p>
              <p className={`mt-1 text-lg font-bold ${bucket.value === 'current' ? 'text-foreground' : 'text-red-600'}`}>
                {formatMoney(bucket.amount || 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {bucket.invoiceCount} factura{bucket.invoiceCount === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

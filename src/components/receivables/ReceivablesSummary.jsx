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
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 ${card.className}`}>{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.note}</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <card.icon className="h-4 w-4" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

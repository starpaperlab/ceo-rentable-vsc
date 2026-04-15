import React from 'react';
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/components/shared/CurrencyContext';

export default function TopClients({ clients }) {
  const { formatMoney } = useCurrency();
  const sorted = [...clients].sort((a, b) => (b.total_billed || 0) - (a.total_billed || 0)).slice(0, 4);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Top Clientes</h3>
      {sorted.length > 0 ? (
        <div className="space-y-3">
          {sorted.map((c, i) => (
            <div key={c.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                  {c.name?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground">{c.name}</span>
              </div>
              <span className="text-xs font-semibold text-foreground">{formatMoney(c.total_billed || 0)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin clientes aún</p>
      )}
    </Card>
  );
}
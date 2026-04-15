import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TopProducts({ products }) {
  const sorted = [...products].sort((a, b) => (b.margin_pct || 0) - (a.margin_pct || 0)).slice(0, 4);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Top Productos</h3>
      {sorted.length > 0 ? (
        <div className="space-y-3">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                <span className="text-sm font-medium text-foreground">{p.name}</span>
              </div>
              <Badge variant="secondary" className="text-xs">{(p.margin_pct || 0).toFixed(0)}%</Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin productos aún</p>
      )}
    </Card>
  );
}
import React from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export default function ImportValidationSummary({ summary, parserErrors = [] }) {
  const cards = [
    { label: 'Filas leidas', value: summary.totalRows, icon: Info, className: 'text-foreground' },
    { label: 'Filas validas', value: summary.validRows, icon: CheckCircle2, className: 'text-green-600' },
    { label: 'Filas con errores', value: summary.errorRows, icon: AlertTriangle, className: summary.errorRows > 0 ? 'text-red-600' : 'text-foreground' },
    { label: 'Filas con avisos', value: summary.warningRows, icon: AlertTriangle, className: summary.warningRows > 0 ? 'text-amber-600' : 'text-foreground' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.className}`}>{card.value}</p>
              </div>
              <card.icon className={`h-4 w-4 ${card.className}`} />
            </div>
          </Card>
        ))}
      </div>

      {parserErrors.length > 0 ? (
        <Card className="p-4 border-red-200 bg-red-50 text-red-800">
          <p className="text-sm font-semibold">Errores al leer el archivo</p>
          <ul className="mt-2 space-y-1 text-xs">
            {parserErrors.slice(0, 5).map((error, index) => (
              <li key={`${error.message}-${index}`}>{error.message || 'Error desconocido'}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';

const DEFAULT_CHARGE = { name: '', amount: 0 };

export default function AdditionalChargesEditor({ charges = [], onChange }) {
  const { symbol } = useCurrency();

  const updateCharge = (index, field, rawValue) => {
    const nextCharges = charges.map((charge, i) => {
      if (i !== index) return charge;
      return {
        ...charge,
        [field]: field === 'amount' ? Number(rawValue || 0) : rawValue,
      };
    });
    onChange(nextCharges);
  };

  const addCharge = () => {
    onChange([...charges, { ...DEFAULT_CHARGE }]);
  };

  const removeCharge = (index) => {
    onChange(charges.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {charges.length > 0 && (
        <div className="hidden sm:grid grid-cols-12 gap-2 px-2 mb-1">
          <span className="col-span-7 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Concepto</span>
          <span className="col-span-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Monto</span>
        </div>
      )}

      {charges.map((charge, index) => (
        <div key={index} className="grid grid-cols-12 gap-2 items-center bg-muted/20 rounded-lg p-2">
          <Input
            value={charge.name || ''}
            onChange={(event) => updateCharge(index, 'name', event.target.value)}
            className="col-span-11 sm:col-span-7 h-8 text-sm"
            placeholder="Ej. Envío, instalación, diseño..."
          />
          <div className="col-span-11 sm:col-span-4 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{symbol}</span>
            <Input
              type="number"
              value={charge.amount || ''}
              onChange={(event) => updateCharge(index, 'amount', event.target.value)}
              className="pl-6 h-8 text-sm"
              placeholder="0"
              min="0"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="col-span-1 h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => removeCharge(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addCharge} className="w-full border-dashed mt-1">
        <Plus className="h-3.5 w-3.5 mr-2" />
        Agregar cargo
      </Button>
    </div>
  );
}

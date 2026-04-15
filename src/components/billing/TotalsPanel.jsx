import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useCurrency } from '@/components/shared/CurrencyContext';

export default function TotalsPanel({ subtotal, taxEnabled, taxPct, onTaxEnabledChange, onTaxPctChange }) {
  const { formatMoney } = useCurrency();
  const taxAmount = taxEnabled ? subtotal * (taxPct / 100) : 0;
  const totalFinal = subtotal + taxAmount;

  return (
    <div className="space-y-2 border-t border-border pt-4 mt-2">
      {/* Subtotal */}
      <div className="flex items-center justify-between py-1">
        <span className="text-sm text-muted-foreground">Subtotal</span>
        <span className="text-sm font-semibold text-foreground">{formatMoney(subtotal)}</span>
      </div>

      {/* Tax toggle */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-3">
          <Switch id="tax-toggle" checked={taxEnabled} onCheckedChange={onTaxEnabledChange} />
          <Label htmlFor="tax-toggle" className="text-sm cursor-pointer select-none">ITBIS / IVA</Label>
          {taxEnabled && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={taxPct}
                onChange={e => onTaxPctChange(parseFloat(e.target.value) || 0)}
                className="w-16 h-7 text-xs text-center"
                min="0"
                max="100"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          )}
        </div>
        {taxEnabled && (
          <span className="text-sm text-muted-foreground">{formatMoney(taxAmount)}</span>
        )}
      </div>

      {/* Total Final */}
      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-primary/8 border border-primary/20 mt-2">
        <span className="text-base font-bold text-foreground">TOTAL</span>
        <span className="text-2xl font-bold text-primary">{formatMoney(totalFinal)}</span>
      </div>
    </div>
  );
}
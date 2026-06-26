import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RECEIVABLE_STATUS_OPTIONS } from '@/lib/receivables';
import { RotateCcw, Search } from 'lucide-react';

export default function ReceivablesFilters({ filters, onChange, onReset }) {
  const update = (field, value) => {
    onChange({ ...filters, [field]: value });
  };

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <div className="xl:col-span-2">
          <Label className="text-xs">Cliente</Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filters.client}
              onChange={(event) => update('client', event.target.value)}
              placeholder="Buscar cliente..."
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Estado</Label>
          <Select value={filters.status} onValueChange={(value) => update('status', value)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECEIVABLE_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Origen</Label>
          <Select value={filters.source} onValueChange={(value) => update('source', value)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="with_order">Con pedido</SelectItem>
              <SelectItem value="manual">Manuales</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} className="mt-1" />
        </div>

        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={filters.overdueOnly}
            onCheckedChange={(checked) => update('overdueOnly', Boolean(checked))}
          />
          Solo facturas vencidas
        </label>
        <Button variant="outline" size="sm" className="gap-2" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Limpiar filtros
        </Button>
      </div>
    </Card>
  );
}

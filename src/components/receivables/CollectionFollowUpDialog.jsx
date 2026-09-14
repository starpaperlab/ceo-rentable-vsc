import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const INITIAL = { due_at: '', priority: 'normal', notes: '' };

export default function CollectionFollowUpDialog({ open, onOpenChange, row, responsibleLabel = '', onSave, isSaving = false }) {
  const [form, setForm] = useState(INITIAL);

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL);
  }, [open, row?.invoice?.id]);

  if (!row) return null;

  const invoiceNumber = row.invoice?.invoice_number || 'Factura';
  const canSave = Boolean(form.due_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seguimiento de cobro</DialogTitle>
          <DialogDescription>
            Programa la próxima acción para {invoiceNumber}. Se guardará en la Agenda/recordatorios existentes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="font-medium">{row.invoice?.client_name || 'Cliente'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Saldo pendiente: {row.summary?.balanceDue ?? 0}</p>
            {responsibleLabel ? <p className="mt-1 text-xs text-muted-foreground">Responsable: {responsibleLabel}</p> : null}
          </div>

          <div>
            <Label className="text-xs">Fecha y hora</Label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={form.due_at}
              onChange={(event) => setForm((current) => ({ ...current, due_at: event.target.value }))}
            />
          </div>

          <div>
            <Label className="text-xs">Prioridad</Label>
            <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea
              className="mt-1"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Ej.: llamar para confirmar transferencia"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!canSave || isSaving}
            onClick={() => onSave?.({
              due_at: new Date(form.due_at).toISOString(),
              priority: form.priority,
              notes: form.notes.trim() || null,
            })}
          >
            {isSaving ? 'Guardando...' : 'Programar seguimiento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

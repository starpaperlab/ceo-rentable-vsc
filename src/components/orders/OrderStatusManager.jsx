import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Save, Settings2 } from 'lucide-react';

const COLOR_OPTIONS = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'brand', label: 'Marca' },
  { value: 'success', label: 'Completado' },
  { value: 'danger', label: 'Alerta' },
];

function normalizeCode(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export default function OrderStatusManager({
  statuses = [],
  onCreate,
  onUpdate,
  onSetDefault,
  isSaving = false,
}) {
  const [newStatus, setNewStatus] = useState({
    name: '',
    color: 'neutral',
    is_terminal: false,
  });
  const [drafts, setDrafts] = useState({});

  const sorted = useMemo(
    () => [...statuses].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [statuses]
  );

  const getDraft = (status) => drafts[status.id] || {
    name: status.name || '',
    sort_order: Number(status.sort_order || 0),
    color: status.color || 'neutral',
    is_active: Boolean(status.is_active),
    is_terminal: Boolean(status.is_terminal),
  };

  const updateDraft = (status, field, value) => {
    setDrafts((current) => ({
      ...current,
      [status.id]: {
        ...getDraft(status),
        [field]: value,
      },
    }));
  };

  const saveStatus = async (status) => {
    const draft = getDraft(status);
    await onUpdate?.(status, {
      name: `${draft.name || ''}`.trim(),
      sort_order: Number(draft.sort_order || 0),
      color: draft.color || 'neutral',
      is_active: Boolean(draft.is_active),
      is_terminal: Boolean(draft.is_terminal),
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[status.id];
      return next;
    });
  };

  const createStatus = async () => {
    const name = `${newStatus.name || ''}`.trim();
    const code = normalizeCode(name);
    if (!name || !code) return;
    const maxSort = sorted.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
    await onCreate?.({
      code,
      name,
      color: newStatus.color || 'neutral',
      sort_order: maxSort + 10,
      is_active: true,
      is_default: false,
      is_terminal: Boolean(newStatus.is_terminal),
    });
    setNewStatus({ name: '', color: 'neutral', is_terminal: false });
  };

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Settings2 className="h-4 w-4" /></div>
        <div>
          <p className="font-semibold">Estados operativos del pedido</p>
          <p className="text-xs text-muted-foreground">Personaliza nombres, orden, color y qué estados cierran el trabajo. El estado financiero sigue separado.</p>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((status) => {
          const draft = getDraft(status);
          return (
            <div key={status.id} className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(160px,1fr)_100px_140px_auto_auto_auto] lg:items-end">
              <div>
                <Label className="text-[11px]">Nombre</Label>
                <Input className="mt-1" value={draft.name} onChange={(event) => updateDraft(status, 'name', event.target.value)} />
                <p className="mt-1 text-[10px] text-muted-foreground">Código: {status.code}</p>
              </div>

              <div>
                <Label className="text-[11px]">Orden</Label>
                <Input className="mt-1" type="number" value={draft.sort_order} onChange={(event) => updateDraft(status, 'sort_order', event.target.value)} />
              </div>

              <div>
                <Label className="text-[11px]">Color</Label>
                <Select value={draft.color} onValueChange={(value) => updateDraft(status, 'color', value)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 pb-2 text-xs">
                <Checkbox checked={draft.is_active} onCheckedChange={(value) => updateDraft(status, 'is_active', Boolean(value))} />
                Activo
              </label>

              <label className="flex items-center gap-2 pb-2 text-xs">
                <Checkbox checked={draft.is_terminal} onCheckedChange={(value) => updateDraft(status, 'is_terminal', Boolean(value))} />
                Final
              </label>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => saveStatus(status)} disabled={isSaving || !`${draft.name || ''}`.trim()}>
                  <Save className="mr-1 h-3.5 w-3.5" />Guardar
                </Button>
                <Button size="sm" variant={status.is_default ? 'default' : 'outline'} onClick={() => onSetDefault?.(status)} disabled={isSaving || status.is_default}>
                  {status.is_default ? 'Predeterminado' : 'Usar por defecto'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-[minmax(180px,1fr)_150px_auto_auto] sm:items-end">
        <div>
          <Label className="text-[11px]">Nuevo estado</Label>
          <Input className="mt-1" value={newStatus.name} onChange={(event) => setNewStatus((current) => ({ ...current, name: event.target.value }))} placeholder="Ej.: En empaque" />
        </div>
        <div>
          <Label className="text-[11px]">Color</Label>
          <Select value={newStatus.color} onValueChange={(value) => setNewStatus((current) => ({ ...current, color: value }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLOR_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs">
          <Checkbox checked={newStatus.is_terminal} onCheckedChange={(value) => setNewStatus((current) => ({ ...current, is_terminal: Boolean(value) }))} />
          Estado final
        </label>
        <Button onClick={createStatus} disabled={isSaving || !newStatus.name.trim()}>
          <Plus className="mr-2 h-4 w-4" />Agregar
        </Button>
      </div>
    </Card>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AutosaveStatus from '@/components/shared/AutosaveStatus';
import DraftRecoveryDialog from '@/components/shared/DraftRecoveryDialog';

export const EMPTY_INVENTORY_ITEM_FORM = {
  product_name: '',
  sku: '',
  descripcion: '',
  sale_price: 0,
  costo_unitario: 0,
  current_stock: 0,
  min_stock_alert: 5,
  unit: 'unidad',
};

function buildInventoryItemFormState(item = null) {
  if (!item) return { ...EMPTY_INVENTORY_ITEM_FORM };

  return {
    product_name: item.product_name || '',
    sku: item.sku || '',
    descripcion: item.descripcion || '',
    sale_price: Number(item.sale_price || 0),
    costo_unitario: Number(item.costo_unitario || 0),
    current_stock: Number(item.current_stock || 0),
    min_stock_alert: Number(item.min_stock_alert || 0),
    unit: item.unit || 'unidad',
  };
}

function serializeInventoryItemForm(raw = {}) {
  return {
    product_name: `${raw.product_name || ''}`.trim(),
    sku: `${raw.sku || ''}`.trim() || null,
    descripcion: `${raw.descripcion || ''}`.trim() || null,
    sale_price: Number(raw.sale_price || 0),
    costo_unitario: Number(raw.costo_unitario || 0),
    current_stock: Number(raw.current_stock || 0),
    min_stock_alert: Number(raw.min_stock_alert || 0),
    unit: `${raw.unit || 'unidad'}`.trim() || 'unidad',
  };
}

function restoreInventoryItemForm(raw, fallbackState) {
  return {
    ...fallbackState,
    ...raw,
    product_name: raw?.product_name || '',
    sku: raw?.sku || '',
    descripcion: raw?.descripcion || '',
    sale_price: Number(raw?.sale_price || 0),
    costo_unitario: Number(raw?.costo_unitario || 0),
    current_stock: Number(raw?.current_stock || 0),
    min_stock_alert: Number(raw?.min_stock_alert || 0),
    unit: raw?.unit || 'unidad',
  };
}

function isMeaningfulInventoryDraft(payload) {
  return (
    Boolean(`${payload?.product_name || ''}`.trim()) ||
    Boolean(`${payload?.sku || ''}`.trim()) ||
    Boolean(`${payload?.descripcion || ''}`.trim()) ||
    Number(payload?.sale_price || 0) > 0 ||
    Number(payload?.costo_unitario || 0) > 0 ||
    Number(payload?.current_stock || 0) > 0 ||
    Number(payload?.min_stock_alert || 0) !== 5 ||
    `${payload?.unit || 'unidad'}`.trim() !== 'unidad'
  );
}

export default function InventoryItemForm({
  item,
  onSubmit,
  onRemoteSave,
  onSaved,
  onCancel,
  isLoading,
  autosaveUserId,
  remoteUpdatedAt,
}) {
  const initialForm = useMemo(() => buildInventoryItemFormState(item), [item]);
  const [form, setForm] = useState(initialForm);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const draftRecovery = useDraftRecovery({
    module: 'inventory_items',
    userId: autosaveUserId,
    recordId: item?.id || 'new',
    remoteUpdatedAt,
    baselineSnapshot: serializeInventoryItemForm(initialForm),
    enabled: Boolean(autosaveUserId),
    isMeaningfulDraft: isMeaningfulInventoryDraft,
  });

  const autosaveSerializer = useCallback((value) => serializeInventoryItemForm(value), []);

  const autosave = useAutosave({
    module: 'inventory_items',
    userId: autosaveUserId,
    recordId: item?.id || 'new',
    data: form,
    serialize: autosaveSerializer,
    remoteSave: async (payload) => {
      const result = await onRemoteSave?.(payload);
      return {
        updated_at: result?.remoteUpdatedAt || result?.updated_at || new Date().toISOString(),
      };
    },
    remoteEnabled: Boolean(item?.id && onRemoteSave),
    remoteUpdatedAt,
    enabled: hasUserEdited && draftRecovery.resolved,
    paused: !draftRecovery.resolved,
    localDelay: 800,
    remoteDelay: 6500,
  });

  const update = (field, value) => {
    setHasUserEdited(true);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRecoverDraft = () => {
    const recovered = draftRecovery.recoverDraft();
    if (!recovered) return;

    setForm(restoreInventoryItemForm(recovered, initialForm));
    setHasUserEdited(true);
    toast.success('Borrador de producto recuperado');
  };

  const handleSave = async () => {
    autosave.cancelPending();
    const localResult = autosave.flushLocalDraft();
    const payload = localResult?.payload || serializeInventoryItemForm(form);

    try {
      const result = await onSubmit(payload);
      autosave.markRemoteSynced(result?.payload || payload, {
        remoteUpdatedAt: result?.remoteUpdatedAt || new Date().toISOString(),
        clearDraftAfterSync: true,
      });
      onSaved?.(result);
    } catch {
      // El contenedor se encarga del mensaje de error.
    }
  };

  const autosaveStatus = isLoading ? 'saving' : autosave.status;

  return (
    <Card className="p-5 space-y-4 border-primary/30">
      <DraftRecoveryDialog
        open={draftRecovery.shouldPrompt}
        savedAt={draftRecovery.draftSavedAt}
        onRecover={handleRecoverDraft}
        onDiscard={draftRecovery.discardDraft}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">{item ? 'Editar producto' : 'Nuevo producto físico'}</h3>
          <AutosaveStatus status={autosaveStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Nombre *</Label>
          <Input value={form.product_name} onChange={(event) => update('product_name', event.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">SKU</Label>
          <Input value={form.sku} onChange={(event) => update('sku', event.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Precio venta</Label>
          <Input type="number" value={form.sale_price || ''} onChange={(event) => update('sale_price', parseFloat(event.target.value) || 0)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Costo unitario</Label>
          <Input type="number" value={form.costo_unitario || ''} onChange={(event) => update('costo_unitario', parseFloat(event.target.value) || 0)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Stock</Label>
          <Input type="number" value={form.current_stock || ''} onChange={(event) => update('current_stock', parseFloat(event.target.value) || 0)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Alerta mínima</Label>
          <Input type="number" value={form.min_stock_alert || ''} onChange={(event) => update('min_stock_alert', parseFloat(event.target.value) || 0)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Unidad</Label>
          <Input value={form.unit} onChange={(event) => update('unit', event.target.value)} className="mt-1" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Descripción</Label>
          <Input value={form.descripcion} onChange={(event) => update('descripcion', event.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} disabled={!form.product_name || isLoading}>Guardar</Button>
      </div>
    </Card>
  );
}

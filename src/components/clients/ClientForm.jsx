import React, { useCallback, useMemo, useState } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import AutosaveStatus from '@/components/shared/AutosaveStatus';
import DraftRecoveryDialog from '@/components/shared/DraftRecoveryDialog';

function buildClientFormState(client = null) {
  return {
    name: client?.name || '',
    email: client?.email || '',
    phone: client?.phone || '',
    total_billed: Number(client?.total_billed || 0),
    status: client?.status || 'new',
    notes: client?.notes || '',
  };
}

function serializeClientForm(raw = {}) {
  return {
    name: `${raw.name || ''}`.trim(),
    email: `${raw.email || ''}`.trim() || null,
    phone: `${raw.phone || ''}`.trim() || null,
    total_billed: Number(raw.total_billed || 0),
    status: raw.status || 'new',
    notes: `${raw.notes || ''}`.trim() || null,
  };
}

function restoreClientForm(raw, fallbackState) {
  return {
    ...fallbackState,
    ...raw,
    name: raw?.name || '',
    email: raw?.email || '',
    phone: raw?.phone || '',
    total_billed: Number(raw?.total_billed || 0),
    status: raw?.status || 'new',
    notes: raw?.notes || '',
  };
}

function isMeaningfulClientDraft(payload) {
  return (
    Boolean(`${payload?.name || ''}`.trim()) ||
    Boolean(`${payload?.email || ''}`.trim()) ||
    Boolean(`${payload?.phone || ''}`.trim()) ||
    Boolean(`${payload?.notes || ''}`.trim()) ||
    Number(payload?.total_billed || 0) > 0 ||
    payload?.status !== 'new'
  );
}

export default function ClientForm({
  client,
  onSubmit,
  onRemoteSave,
  onSaved,
  onCancel,
  isLoading,
  autosaveUserId,
  remoteUpdatedAt,
}) {
  const initialForm = useMemo(() => buildClientFormState(client), [client]);
  const [form, setForm] = useState(initialForm);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const draftRecovery = useDraftRecovery({
    module: 'clients',
    userId: autosaveUserId,
    recordId: client?.id || 'new',
    remoteUpdatedAt,
    baselineSnapshot: serializeClientForm(initialForm),
    enabled: Boolean(autosaveUserId),
    isMeaningfulDraft: isMeaningfulClientDraft,
  });

  const autosaveSerializer = useCallback((value) => serializeClientForm(value), []);

  const autosave = useAutosave({
    module: 'clients',
    userId: autosaveUserId,
    recordId: client?.id || 'new',
    data: form,
    serialize: autosaveSerializer,
    remoteSave: async (payload) => {
      const result = await onRemoteSave?.(payload);
      return {
        updated_at: result?.remoteUpdatedAt || result?.updated_at || new Date().toISOString(),
      };
    },
    remoteEnabled: Boolean(client?.id && onRemoteSave),
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

    setForm(restoreClientForm(recovered, initialForm));
    setHasUserEdited(true);
    toast.success('Borrador de cliente recuperado');
  };

  const handleSave = async () => {
    autosave.cancelPending();
    const localResult = autosave.flushLocalDraft();
    const payload = localResult?.payload || serializeClientForm(form);

    try {
      const result = await onSubmit(payload);
      autosave.markRemoteSynced(result?.payload || payload, {
        remoteUpdatedAt: result?.remoteUpdatedAt || new Date().toISOString(),
        clearDraftAfterSync: true,
      });
      onSaved?.(result);
    } catch {
      // El toast de error lo maneja el contenedor.
    }
  };

  const autosaveStatus = isLoading ? 'saving' : autosave.status;

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <DraftRecoveryDialog
        open={draftRecovery.shouldPrompt}
        savedAt={draftRecovery.draftSavedAt}
        onRecover={handleRecoverDraft}
        onDiscard={draftRecovery.discardDraft}
      />

      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{client ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
            <AutosaveStatus status={autosaveStatus} />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={form.email} onChange={(e) => update('email', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Teléfono</Label>
            <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Total Facturado</Label>
            <Input type="number" value={form.total_billed || ''} onChange={(e) => update('total_billed', parseFloat(e.target.value) || 0)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={form.status || 'new'} onValueChange={(value) => update('status', value)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Nuevo</SelectItem>
                <SelectItem value="recurring">Recurrente</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Notas</Label>
          <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className="mt-1" rows={2} />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button className="bg-primary text-primary-foreground" onClick={handleSave} disabled={!form.name || isLoading}>
            {client ? 'Actualizar' : 'Crear'} Cliente
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

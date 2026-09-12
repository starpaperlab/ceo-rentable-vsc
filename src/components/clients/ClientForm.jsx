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

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function buildClientFormState(client = null) {
  return {
    name: client?.name || '',
    email: client?.email || '',
    phone: client?.phone || '',
    total_billed: Number(client?.total_billed || 0),
    status: client?.status || 'new',
    crm_stage: client?.crm_stage || (Number(client?.total_billed || 0) > 0 ? 'won' : 'new'),
    priority: client?.priority || (client?.status === 'vip' ? 'high' : 'normal'),
    notes: client?.notes || '',
    next_follow_up_at: toLocalDateTimeInput(client?.next_follow_up_at),
    next_follow_up_type: client?.next_follow_up_type || 'call',
    next_follow_up_note: client?.next_follow_up_note || '',
  };
}

function serializeClientForm(raw = {}) {
  return {
    name: `${raw.name || ''}`.trim(),
    email: `${raw.email || ''}`.trim() || null,
    phone: `${raw.phone || ''}`.trim() || null,
    total_billed: Number(raw.total_billed || 0),
    status: raw.status || 'new',
    crm_stage: raw.crm_stage || 'new',
    priority: raw.priority || 'normal',
    notes: `${raw.notes || ''}`.trim() || null,
    next_follow_up_at: raw.next_follow_up_at ? new Date(raw.next_follow_up_at).toISOString() : null,
    next_follow_up_type: raw.next_follow_up_at ? (raw.next_follow_up_type || 'call') : null,
    next_follow_up_note: raw.next_follow_up_at ? (`${raw.next_follow_up_note || ''}`.trim() || null) : null,
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
    crm_stage: raw?.crm_stage || 'new',
    priority: raw?.priority || 'normal',
    notes: raw?.notes || '',
    next_follow_up_at: raw?.next_follow_up_at ? toLocalDateTimeInput(raw.next_follow_up_at) : '',
    next_follow_up_type: raw?.next_follow_up_type || 'call',
    next_follow_up_note: raw?.next_follow_up_note || '',
  };
}

function isMeaningfulClientDraft(payload) {
  return (
    Boolean(`${payload?.name || ''}`.trim()) ||
    Boolean(`${payload?.email || ''}`.trim()) ||
    Boolean(`${payload?.phone || ''}`.trim()) ||
    Boolean(`${payload?.notes || ''}`.trim()) ||
    Boolean(payload?.next_follow_up_at) ||
    Number(payload?.total_billed || 0) > 0 ||
    payload?.status !== 'new' ||
    payload?.crm_stage !== 'new' ||
    payload?.priority !== 'normal'
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
            <Label className="text-xs">Categoría del cliente</Label>
            <Select value={form.status || 'new'} onValueChange={(value) => update('status', value)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Nuevo</SelectItem>
                <SelectItem value="recurring">Recurrente</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Etapa comercial</Label>
            <Select value={form.crm_stage || 'new'} onValueChange={(value) => update('crm_stage', value)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Nuevo</SelectItem>
                <SelectItem value="follow_up">En seguimiento</SelectItem>
                <SelectItem value="interested">Interesado</SelectItem>
                <SelectItem value="quoted">Cotizado</SelectItem>
                <SelectItem value="negotiation">Negociación</SelectItem>
                <SelectItem value="won">Ganado</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prioridad</Label>
            <Select value={form.priority || 'normal'} onValueChange={(value) => update('priority', value)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 p-4">
          <div>
            <p className="text-sm font-semibold">Próximo seguimiento</p>
            <p className="text-xs text-muted-foreground">Déjalo vacío si este cliente no necesita seguimiento programado.</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Fecha y hora</Label>
              <Input type="datetime-local" value={form.next_follow_up_at || ''} onChange={(e) => update('next_follow_up_at', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Canal</Label>
              <Select value={form.next_follow_up_type || 'call'} onValueChange={(value) => update('next_follow_up_type', value)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Llamada</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Reunión</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Qué debo hacer</Label>
              <Input value={form.next_follow_up_note || ''} onChange={(e) => update('next_follow_up_note', e.target.value)} className="mt-1" placeholder="Ej.: Llamar para confirmar la cotización" />
            </div>
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

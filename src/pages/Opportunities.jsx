import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CalendarClock,
  CircleDollarSign,
  Eye,
  GripVertical,
  History,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Settings2,
  ShoppingBag,
  Target,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const STAGE_COLOR_CLASS = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  brand: 'bg-primary/10 text-primary',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STAGE_TYPE_LABEL = {
  open: 'Abierta',
  won: 'Ganada',
  lost: 'Perdida',
};

const ACTIVITY_TYPES = [
  ['call', 'Llamada'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'Correo'],
  ['meeting', 'Reunión'],
  ['note', 'Nota'],
  ['other', 'Otro'],
];

function normalizeStageCode(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function mapById(rows = []) {
  return rows.reduce((map, row) => {
    if (row?.id) map[row.id] = row;
    return map;
  }, {});
}

function groupBy(rows = [], key) {
  return rows.reduce((map, row) => {
    const value = row?.[key];
    if (!value) return map;
    map[value] = map[value] || [];
    map[value].push(row);
    return map;
  }, {});
}

function elapsedLabel(value) {
  if (!value) return 'Sin dato';
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return 'Sin dato';
  const seconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} d`;
}

function durationLabel(seconds = 0) {
  const value = Number(seconds || 0);
  if (value < 3600) return `${Math.max(0, Math.floor(value / 60))} min`;
  if (value < 86400) return `${Math.floor(value / 3600)} h`;
  return `${Math.floor(value / 86400)} d`;
}

function OpportunityFormDialog({
  open,
  onOpenChange,
  opportunity,
  initialValues = {},
  clients,
  stages,
  history = [],
  activities = [],
  onSave,
  onDelete,
  onCreateActivity,
  onCreateOrder,
  linkedOrder,
  isSaving,
  isSavingActivity,
  isCreatingOrder,
  canWrite,
  canCreateOrder = false,
  ownerEmail,
}) {
  const defaultStage = stages.find((stage) => stage.is_default && stage.is_active) || stages.find((stage) => stage.is_active);
  const [form, setForm] = useState({
    title: '',
    client_id: '',
    stage_id: defaultStage?.id || '',
    expected_value: '',
    expected_close_date: '',
    source: '',
    description: '',
    loss_reason: '',
  });
  const [activity, setActivity] = useState({ activity_type: 'note', subject: '', notes: '' });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: opportunity?.title || initialValues.title || '',
      client_id: opportunity?.client_id || initialValues.client_id || '',
      stage_id: opportunity?.stage_id || initialValues.stage_id || defaultStage?.id || '',
      expected_value: opportunity?.expected_value ?? initialValues.expected_value ?? '',
      expected_close_date: opportunity?.expected_close_date || initialValues.expected_close_date || '',
      source: opportunity?.source || initialValues.source || '',
      description: opportunity?.description || initialValues.description || '',
      loss_reason: opportunity?.loss_reason || initialValues.loss_reason || '',
    });
    setActivity({ activity_type: 'note', subject: '', notes: '' });
  }, [defaultStage?.id, initialValues, open, opportunity]);

  const selectedStage = stages.find((stage) => stage.id === form.stage_id);
  const actualStage = opportunity ? stages.find((stage) => stage.id === opportunity.stage_id) : null;
  const requiresLossReason = selectedStage?.stage_type === 'lost';

  const submit = async () => {
    if (!form.title.trim() || !form.client_id || !form.stage_id) return;
    if (requiresLossReason && !form.loss_reason.trim()) {
      toast.error('Debes indicar el motivo de pérdida.');
      return;
    }
    await onSave?.({
      title: form.title.trim(),
      client_id: form.client_id,
      stage_id: form.stage_id,
      expected_value: Number(form.expected_value || 0),
      expected_close_date: form.expected_close_date || null,
      source: form.source.trim() || null,
      description: form.description.trim() || null,
      loss_reason: requiresLossReason ? form.loss_reason.trim() : null,
    });
  };

  const submitActivity = async () => {
    if (!activity.subject.trim()) return;
    await onCreateActivity?.({
      activity_type: activity.activity_type,
      subject: activity.subject.trim(),
      notes: activity.notes.trim() || null,
    });
    setActivity({ activity_type: 'note', subject: '', notes: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{opportunity ? 'Detalle de oportunidad' : 'Nueva oportunidad'}</DialogTitle>
          <DialogDescription>
            El pipeline pertenece a la oportunidad, no al cliente. Un mismo cliente puede tener varias oportunidades.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Nombre de la oportunidad *</Label>
            <Input className="mt-1" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ej.: Pedido corporativo Navidad" />
          </div>

          <div>
            <Label className="text-xs">Cliente *</Label>
            <Select value={form.client_id} onValueChange={(value) => setForm((p) => ({ ...p, client_id: value }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
              <SelectContent>
                {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Etapa *</Label>
            <Select value={form.stage_id} onValueChange={(value) => setForm((p) => ({ ...p, stage_id: value }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona etapa" /></SelectTrigger>
              <SelectContent>
                {stages.filter((stage) => stage.is_active || stage.id === opportunity?.stage_id).map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Valor estimado</Label>
            <Input type="number" min="0" step="0.01" className="mt-1" value={form.expected_value} onChange={(e) => setForm((p) => ({ ...p, expected_value: e.target.value }))} />
          </div>

          <div>
            <Label className="text-xs">Cierre estimado</Label>
            <Input type="date" className="mt-1" value={form.expected_close_date} onChange={(e) => setForm((p) => ({ ...p, expected_close_date: e.target.value }))} />
          </div>

          <div className="sm:col-span-2">
            <Label className="text-xs">Origen</Label>
            <Input className="mt-1" value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} placeholder="Ej.: Instagram, referida, feria, web" />
          </div>

          <div className="sm:col-span-2">
            <Label className="text-xs">Descripción</Label>
            <Textarea className="mt-1" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Detalles comerciales relevantes..." />
          </div>

          {requiresLossReason ? (
            <div className="sm:col-span-2">
              <Label className="text-xs text-red-700">Motivo de pérdida *</Label>
              <Textarea className="mt-1" value={form.loss_reason} onChange={(e) => setForm((p) => ({ ...p, loss_reason: e.target.value }))} placeholder="Indica por qué se perdió la oportunidad" />
            </div>
          ) : null}
        </div>

        {opportunity ? (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Responsable</p>
                <p className="mt-1 truncate text-sm font-medium">{opportunity.responsible_email || ownerEmail || 'Sin asignar'}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Tiempo en etapa</p>
                <p className="mt-1 text-sm font-medium">{elapsedLabel(opportunity.stage_entered_at)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Pedido</p>
                <p className="mt-1 text-sm font-medium">{linkedOrder?.order_number || 'No creado'}</p>
              </Card>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Historial de etapas</p>
              </div>
              <div className="space-y-2">
                {history.length === 0 ? <p className="text-xs text-muted-foreground">Sin cambios de etapa todavía.</p> : history.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-xs">
                    <p className="font-medium">{item.from_stage_name ? `${item.from_stage_name} → ${item.to_stage_name}` : `Entró en ${item.to_stage_name}`}</p>
                    <p className="mt-1 text-muted-foreground">{new Date(item.changed_at).toLocaleString('es-DO')} · {item.changed_by_email || 'Usuario'}</p>
                    {Number(item.duration_seconds || 0) > 0 ? <p className="mt-1 text-muted-foreground">Tiempo en etapa anterior: {durationLabel(item.duration_seconds)}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Actividades de esta oportunidad</p>
              </div>
              {canWrite ? (
                <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[140px_1fr]">
                  <Select value={activity.activity_type} onValueChange={(value) => setActivity((p) => ({ ...p, activity_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={activity.subject} onChange={(e) => setActivity((p) => ({ ...p, subject: e.target.value }))} placeholder="Asunto de la actividad" />
                  <Textarea className="sm:col-span-2" value={activity.notes} onChange={(e) => setActivity((p) => ({ ...p, notes: e.target.value }))} placeholder="Notas opcionales" />
                  <div className="sm:col-span-2 flex justify-end">
                    <Button size="sm" onClick={submitActivity} disabled={isSavingActivity || !activity.subject.trim()}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Registrar actividad
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {activities.length === 0 ? <p className="text-xs text-muted-foreground">No hay actividades registradas.</p> : activities.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-xs">
                    <p className="font-medium">{item.subject}</p>
                    <p className="mt-1 text-muted-foreground">{item.activity_type} · {new Date(item.occurred_at).toLocaleString('es-DO')}</p>
                    {item.notes ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.notes}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            {actualStage?.stage_type === 'won' ? (
              <Card className="border-green-200 bg-green-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-green-800">Oportunidad ganada</p>
                    <p className="text-xs text-green-700">{linkedOrder ? `Ya generó el pedido ${linkedOrder.order_number}.` : 'Convierte esta venta ganada en un pedido operativo.'}</p>
                  </div>
                  <Button size="sm" onClick={() => onCreateOrder?.(opportunity)} disabled={Boolean(linkedOrder) || isCreatingOrder || !canWrite || !canCreateOrder}>
                    <ShoppingBag className="mr-2 h-4 w-4" />{linkedOrder ? linkedOrder.order_number : 'Crear pedido'}
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div>
            {opportunity && canWrite ? (
              <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => onDelete?.(opportunity)}>
                <Trash2 className="mr-2 h-4 w-4" />Eliminar
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            {canWrite ? <Button onClick={submit} disabled={isSaving || !form.title.trim() || !form.client_id || !form.stage_id}>{isSaving ? 'Guardando...' : 'Guardar'}</Button> : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LossReasonDialog({ state, onClose, onConfirm, isSaving }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (state) setReason(''); }, [state]);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo de pérdida</DialogTitle>
          <DialogDescription>Para mover la oportunidad a Perdido debes registrar el motivo.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: precio, sin presupuesto, eligió otro proveedor..." />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={!reason.trim() || isSaving} onClick={() => onConfirm?.(reason.trim())}>Marcar como perdida</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageRow({ stage, onSave, onSetDefault, isSaving }) {
  const [draft, setDraft] = useState({
    name: stage.name,
    sort_order: stage.sort_order,
    color: stage.color,
    is_active: stage.is_active,
  });

  useEffect(() => {
    setDraft({ name: stage.name, sort_order: stage.sort_order, color: stage.color, is_active: stage.is_active });
  }, [stage]);

  return (
    <div className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(160px,1fr)_90px_130px_auto_auto] lg:items-end">
      <div>
        <Label className="text-[11px]">Nombre</Label>
        <Input className="mt-1" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
        <p className="mt-1 text-[10px] text-muted-foreground">{STAGE_TYPE_LABEL[stage.stage_type]} · {stage.code}</p>
      </div>
      <div>
        <Label className="text-[11px]">Orden</Label>
        <Input type="number" className="mt-1" value={draft.sort_order} onChange={(e) => setDraft((p) => ({ ...p, sort_order: e.target.value }))} />
      </div>
      <div>
        <Label className="text-[11px]">Color</Label>
        <Select value={draft.color} onValueChange={(value) => setDraft((p) => ({ ...p, color: value }))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="brand">Marca</SelectItem>
            <SelectItem value="success">Verde</SelectItem>
            <SelectItem value="danger">Rojo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-xs">
        <input
          type="checkbox"
          checked={draft.is_active}
          disabled={stage.is_default}
          onChange={(e) => setDraft((p) => ({ ...p, is_active: e.target.checked }))}
        />
        Activa
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={isSaving || !draft.name.trim()} onClick={() => onSave?.(stage, {
          name: draft.name.trim(),
          sort_order: Number(draft.sort_order || 0),
          color: draft.color,
          is_active: Boolean(draft.is_active),
        })}>Guardar</Button>
        {stage.stage_type === 'open' ? (
          <Button size="sm" variant={stage.is_default ? 'default' : 'outline'} disabled={isSaving || stage.is_default} onClick={() => onSetDefault?.(stage)}>
            {stage.is_default ? 'Predeterminada' : 'Usar por defecto'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StageManager({ open, onOpenChange, stages, onCreate, onUpdate, onSetDefault, isSaving }) {
  const [newStage, setNewStage] = useState({ name: '', stage_type: 'open', color: 'neutral' });
  const sorted = [...stages].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const create = async () => {
    const name = newStage.name.trim();
    if (!name) return;
    const code = normalizeStageCode(name);
    if (!code) return;
    const maxSort = sorted.reduce((max, stage) => Math.max(max, Number(stage.sort_order || 0)), 0);
    await onCreate?.({
      code,
      name,
      sort_order: maxSort + 10,
      color: newStage.color,
      stage_type: newStage.stage_type,
      is_default: false,
      is_active: true,
    });
    setNewStage({ name: '', stage_type: 'open', color: 'neutral' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configurar etapas del Pipeline</DialogTitle>
          <DialogDescription>Renombra, ordena o desactiva etapas. Ganado y Perdido conservan su significado comercial.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {sorted.map((stage) => (
            <StageRow key={stage.id} stage={stage} onSave={onUpdate} onSetDefault={onSetDefault} isSaving={isSaving} />
          ))}
        </div>

        <div className="grid gap-3 rounded-xl border border-dashed p-3 sm:grid-cols-[1fr_130px_130px_auto] sm:items-end">
          <div>
            <Label className="text-[11px]">Nueva etapa</Label>
            <Input className="mt-1" value={newStage.name} onChange={(e) => setNewStage((p) => ({ ...p, name: e.target.value }))} placeholder="Ej.: Demo enviada" />
          </div>
          <div>
            <Label className="text-[11px]">Tipo</Label>
            <Select value={newStage.stage_type} onValueChange={(value) => setNewStage((p) => ({ ...p, stage_type: value }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Abierta</SelectItem>
                <SelectItem value="won">Ganada</SelectItem>
                <SelectItem value="lost">Perdida</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Color</Label>
            <Select value={newStage.color} onValueChange={(value) => setNewStage((p) => ({ ...p, color: value }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="brand">Marca</SelectItem>
                <SelectItem value="success">Verde</SelectItem>
                <SelectItem value="danger">Rojo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button disabled={isSaving || !newStage.name.trim()} onClick={create}><Plus className="mr-2 h-4 w-4" />Agregar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Opportunities() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
  const { canWriteModule } = useWorkspace();
  const canWrite = canWriteModule('opportunities');
  const canWriteOrders = canWriteModule('orders');
  const {
    activeWorkspaceId,
    enabled,
    fetchRows,
    ownerEmail,
    ownerId,
    queryKey: contextQueryKey,
    writeOwnerEmail,
    writeOwnerId,
  } = useWorkContextScope();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [newOpportunityDefaults, setNewOpportunityDefaults] = useState({});
  const [lossState, setLossState] = useState(null);
  const [stageManagerOpen, setStageManagerOpen] = useState(false);

  const { data: stages = [], isLoading: loadingStages } = useQuery({
    queryKey: ['opportunity-stages', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'opportunity_stages', orderBy: 'sort_order', ascending: true }),
    enabled,
  });

  const { data: opportunities = [], isLoading: loadingOpportunities } = useQuery({
    queryKey: ['opportunities', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'opportunities', orderBy: 'updated_at', ascending: false }),
    enabled,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'clients', orderBy: 'name', ascending: true }),
    enabled,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'orders' }),
    enabled,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['opportunity-stage-history', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'opportunity_stage_history', orderBy: 'changed_at', ascending: false }),
    enabled,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['opportunity-activities', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'client_activities', orderBy: 'occurred_at', ascending: false }),
    enabled,
  });

  const clientsById = useMemo(() => mapById(clients), [clients]);
  const stagesById = useMemo(() => mapById(stages), [stages]);
  const historyByOpportunity = useMemo(() => groupBy(history, 'opportunity_id'), [history]);
  const activitiesByOpportunity = useMemo(
    () => groupBy(activities.filter((item) => item.opportunity_id), 'opportunity_id'),
    [activities]
  );
  const ordersByOpportunity = useMemo(() => groupBy(orders.filter((item) => item.opportunity_id), 'opportunity_id'), [orders]);

  const activeStages = useMemo(
    () => [...stages].filter((stage) => stage.is_active).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [stages]
  );

  const opportunitiesByStage = useMemo(() => {
    const grouped = groupBy(opportunities, 'stage_id');
    activeStages.forEach((stage) => {
      grouped[stage.id] = grouped[stage.id] || [];
    });
    return grouped;
  }, [activeStages, opportunities]);

  const summary = useMemo(() => {
    const open = opportunities.filter((item) => stagesById[item.stage_id]?.stage_type === 'open');
    const won = opportunities.filter((item) => stagesById[item.stage_id]?.stage_type === 'won');
    const lost = opportunities.filter((item) => stagesById[item.stage_id]?.stage_type === 'lost');
    return {
      openCount: open.length,
      openValue: open.reduce((sum, item) => sum + Number(item.expected_value || 0), 0),
      wonCount: won.length,
      wonValue: won.reduce((sum, item) => sum + Number(item.expected_value || 0), 0),
      lostCount: lost.length,
    };
  }, [opportunities, stagesById]);

  useEffect(() => {
    if (!canWrite || clients.length === 0 || stages.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') !== '1') return;
    const clientId = params.get('client');
    setEditingOpportunity(null);
    setNewOpportunityDefaults({
      client_id: clients.some((client) => client.id === clientId) ? clientId : '',
      stage_id: stages.find((stage) => stage.is_default && stage.is_active)?.id || activeStages[0]?.id || '',
    });
    setDialogOpen(true);
    navigate('/Opportunities', { replace: true });
  }, [activeStages, canWrite, clients, navigate, stages]);

  const invalidatePipeline = () => {
    queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    queryClient.invalidateQueries({ queryKey: ['opportunity-stage-history'] });
    queryClient.invalidateQueries({ queryKey: ['opportunity-activities'] });
  };

  const saveOpportunityMutation = useMutation({
    mutationFn: async (payload) => {
      if (!canWrite) throw new Error('Tu perfil es de solo lectura.');
      if (!activeWorkspaceId) throw new Error('Selecciona un workspace.');

      if (editingOpportunity?.id) {
        const { data, error } = await supabase
          .from('opportunities')
          .update(payload)
          .eq('id', editingOpportunity.id)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.from('opportunities').insert({
        ...payload,
        workspace_id: activeWorkspaceId,
        user_id: writeOwnerId || ownerId || null,
        created_by: writeOwnerEmail || ownerEmail || null,
        responsible_user_id: writeOwnerId || ownerId || null,
        responsible_email: writeOwnerEmail || ownerEmail || null,
      }).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (saved) => {
      invalidatePipeline();
      setEditingOpportunity(saved);
      setDialogOpen(false);
      toast.success('Oportunidad guardada');
    },
    onError: (error) => toast.error(`No se pudo guardar la oportunidad: ${error.message}`),
  });

  const deleteOpportunityMutation = useMutation({
    mutationFn: async (opportunity) => {
      if (!canWrite) throw new Error('Tu perfil es de solo lectura.');
      if (ordersByOpportunity[opportunity.id]?.length) {
        throw new Error('No puedes eliminar una oportunidad que ya generó un pedido.');
      }
      const { error } = await supabase.from('opportunities').delete().eq('id', opportunity.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePipeline();
      setDialogOpen(false);
      setEditingOpportunity(null);
      toast.success('Oportunidad eliminada');
    },
    onError: (error) => toast.error(`No se pudo eliminar: ${error.message}`),
  });

  const moveOpportunityMutation = useMutation({
    mutationFn: async ({ opportunity, stage, lossReason = null }) => {
      if (!canWrite) throw new Error('Tu perfil es de solo lectura.');
      const { data, error } = await supabase
        .from('opportunities')
        .update({
          stage_id: stage.id,
          loss_reason: stage.stage_type === 'lost' ? lossReason : null,
        })
        .eq('id', opportunity.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (saved) => {
      invalidatePipeline();
      const target = stagesById[saved.stage_id];
      toast.success(target?.stage_type === 'won' ? 'Oportunidad marcada como ganada' : target?.stage_type === 'lost' ? 'Oportunidad marcada como perdida' : 'Etapa actualizada');
    },
    onError: (error) => toast.error(`No se pudo cambiar la etapa: ${error.message}`),
  });

  const createActivityMutation = useMutation({
    mutationFn: async ({ opportunity, payload }) => {
      if (!canWrite) throw new Error('Tu perfil es de solo lectura.');
      const { data, error } = await supabase.from('client_activities').insert({
        workspace_id: activeWorkspaceId,
        client_id: opportunity.client_id,
        opportunity_id: opportunity.id,
        user_id: writeOwnerId || ownerId || null,
        created_by: writeOwnerEmail || ownerEmail || null,
        activity_type: payload.activity_type || 'note',
        subject: payload.subject,
        notes: payload.notes,
        occurred_at: new Date().toISOString(),
      }).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-activities'] });
      toast.success('Actividad registrada');
    },
    onError: (error) => toast.error(`No se pudo registrar la actividad: ${error.message}`),
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async (opportunity) => {
      if (!canWrite) throw new Error('Tu perfil es de solo lectura.');
      const { data, error } = await supabase.rpc('convert_opportunity_to_order', {
        target_opportunity_id: opportunity.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`Pedido ${order?.order_number || ''} creado desde la oportunidad`.trim());
    },
    onError: (error) => toast.error(`No se pudo crear el pedido: ${error.message}`),
  });

  const createStageMutation = useMutation({
    mutationFn: async (payload) => {
      if (!canWrite) throw new Error('Tu perfil es de solo lectura.');
      const { data, error } = await supabase.from('opportunity_stages').insert({
        ...payload,
        workspace_id: activeWorkspaceId,
      }).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-stages'] });
      toast.success('Etapa creada');
    },
    onError: (error) => toast.error(`No se pudo crear la etapa: ${error.message}`),
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ stage, payload }) => {
      if (!canWrite) throw new Error('Tu perfil es de solo lectura.');
      if (stage.is_default && payload.is_active === false) {
        throw new Error('Primero selecciona otra etapa predeterminada.');
      }
      const { data, error } = await supabase.from('opportunity_stages').update({
        ...payload,
        updated_at: new Date().toISOString(),
      }).eq('id', stage.id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-stages'] });
      toast.success('Etapa actualizada');
    },
    onError: (error) => toast.error(`No se pudo actualizar la etapa: ${error.message}`),
  });

  const setDefaultStageMutation = useMutation({
    mutationFn: async (stage) => {
      const { data, error } = await supabase.rpc('set_default_opportunity_stage', {
        target_stage_id: stage.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-stages'] });
      toast.success('Etapa predeterminada actualizada');
    },
    onError: (error) => toast.error(`No se pudo cambiar la etapa predeterminada: ${error.message}`),
  });

  const requestStageChange = (opportunity, stageId) => {
    const stage = stagesById[stageId];
    if (!stage || stage.id === opportunity.stage_id) return;
    if (stage.stage_type === 'lost') {
      setLossState({ opportunity, stage });
      return;
    }
    moveOpportunityMutation.mutate({ opportunity, stage });
  };

  const onDragEnd = ({ destination, draggableId }) => {
    if (!destination || !canWrite) return;
    const opportunity = opportunities.find((item) => item.id === draggableId);
    if (!opportunity) return;
    requestStageChange(opportunity, destination.droppableId);
  };

  const openNew = () => {
    setEditingOpportunity(null);
    setNewOpportunityDefaults({});
    setDialogOpen(true);
  };

  const openEdit = (opportunity) => {
    setEditingOpportunity(opportunity);
    setNewOpportunityDefaults({});
    setDialogOpen(true);
  };

  const isLoading = loadingStages || loadingOpportunities;
  const isSavingStage = createStageMutation.isPending || updateStageMutation.isPending || setDefaultStageMutation.isPending;

  if (isLoading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 lg:p-8">
      {!canWrite ? (
        <Card className="flex items-center gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Eye className="h-5 w-5" />
          <div>
            <p className="font-semibold">Modo solo lectura</p>
            <p className="text-xs">Puedes consultar oportunidades, etapas, historial y actividades, pero no modificarlos.</p>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Target className="h-6 w-6 text-primary" />Pipeline de Oportunidades</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cada oportunidad avanza de forma independiente aunque pertenezca al mismo cliente.</p>
        </div>
        {canWrite ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setStageManagerOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Configurar etapas</Button>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nueva oportunidad</Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Oportunidades abiertas</p><p className="mt-1 text-2xl font-bold">{summary.openCount}</p><p className="mt-1 text-xs text-muted-foreground">{formatMoney(summary.openValue)} potencial</p></Card>
        <Card className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ganadas</p><p className="mt-1 text-2xl font-bold text-green-600">{summary.wonCount}</p><p className="mt-1 text-xs text-muted-foreground">{formatMoney(summary.wonValue)} valor estimado</p></Card>
        <Card className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Perdidas</p><p className="mt-1 text-2xl font-bold text-red-600">{summary.lostCount}</p><p className="mt-1 text-xs text-muted-foreground">Con motivo obligatorio</p></Card>
        <Card className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total oportunidades</p><p className="mt-1 text-2xl font-bold text-primary">{opportunities.length}</p><p className="mt-1 text-xs text-muted-foreground">{clients.length} clientes disponibles</p></Card>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max gap-3">
            {activeStages.map((stage) => {
              const stageItems = opportunitiesByStage[stage.id] || [];
              const stageValue = stageItems.reduce((sum, item) => sum + Number(item.expected_value || 0), 0);
              return (
                <div key={stage.id} className="w-[290px] shrink-0 sm:w-[310px]">
                  <div className="mb-2 flex items-start justify-between rounded-xl border bg-card p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${STAGE_COLOR_CLASS[stage.color] || STAGE_COLOR_CLASS.neutral} border-0`}>{stage.name}</Badge>
                        <span className="text-xs text-muted-foreground">{stageItems.length}</span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{formatMoney(stageValue)}</p>
                    </div>
                    {stage.stage_type === 'won' ? <Trophy className="h-4 w-4 text-green-600" /> : stage.stage_type === 'lost' ? <XCircle className="h-4 w-4 text-red-600" /> : null}
                  </div>

                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[220px] space-y-2 rounded-xl border border-dashed p-2 transition ${snapshot.isDraggingOver ? 'border-primary bg-primary/5' : 'border-border'}`}
                      >
                        {stageItems.map((opportunity, index) => {
                          const client = clientsById[opportunity.client_id];
                          const linkedOrder = ordersByOpportunity[opportunity.id]?.[0] || null;
                          return (
                            <Draggable key={opportunity.id} draggableId={opportunity.id} index={index} isDragDisabled={!canWrite}>
                              {(dragProvided, dragSnapshot) => (
                                <Card
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className={`p-3 ${dragSnapshot.isDragging ? 'shadow-xl ring-2 ring-primary/20' : ''}`}
                                >
                                  <div className="flex items-start gap-2">
                                    <button type="button" className="mt-0.5 cursor-grab text-muted-foreground disabled:cursor-default" disabled={!canWrite} {...dragProvided.dragHandleProps}>
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <button type="button" className="w-full text-left" onClick={() => openEdit(opportunity)}>
                                        <p className="truncate text-sm font-semibold">{opportunity.title}</p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{client?.name || 'Cliente'}</p>
                                      </button>

                                      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                                        {Number(opportunity.expected_value || 0) > 0 ? <Badge variant="outline"><CircleDollarSign className="mr-1 h-3 w-3" />{formatMoney(opportunity.expected_value)}</Badge> : null}
                                        {opportunity.expected_close_date ? <Badge variant="outline"><CalendarClock className="mr-1 h-3 w-3" />{opportunity.expected_close_date}</Badge> : null}
                                      </div>

                                      <p className="mt-2 text-[10px] text-muted-foreground">En etapa: {elapsedLabel(opportunity.stage_entered_at)}</p>
                                      {opportunity.responsible_email ? <p className="mt-1 truncate text-[10px] text-muted-foreground">{opportunity.responsible_email}</p> : null}

                                      {stage.stage_type === 'lost' && opportunity.loss_reason ? <p className="mt-2 rounded-md bg-red-50 p-2 text-[10px] text-red-700">{opportunity.loss_reason}</p> : null}

                                      {stage.stage_type === 'won' ? (
                                        <Button
                                          size="sm"
                                          variant={linkedOrder ? 'outline' : 'default'}
                                          className="mt-3 h-8 w-full text-xs"
                                          disabled={!canWrite || !canWriteOrders || Boolean(linkedOrder) || convertToOrderMutation.isPending}
                                          onClick={() => linkedOrder ? navigate('/Orders') : convertToOrderMutation.mutate(opportunity)}
                                        >
                                          <ShoppingBag className="mr-1 h-3.5 w-3.5" />{linkedOrder ? linkedOrder.order_number : 'Crear pedido'}
                                        </Button>
                                      ) : null}

                                      {canWrite ? (
                                        <div className="mt-3 md:hidden">
                                          <Select value={opportunity.stage_id} onValueChange={(value) => requestStageChange(opportunity, value)}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              {activeStages.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      ) : null}

                                      <div className="mt-3 flex justify-end">
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(opportunity)}><Pencil className="mr-1 h-3 w-3" />Abrir</Button>
                                      </div>
                                    </div>
                                  </div>
                                </Card>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                        {stageItems.length === 0 ? <div className="py-10 text-center text-xs text-muted-foreground">Sin oportunidades</div> : null}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      <OpportunityFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingOpportunity(null);
            setNewOpportunityDefaults({});
          }
        }}
        opportunity={editingOpportunity?.id ? editingOpportunity : null}
        initialValues={newOpportunityDefaults}
        clients={clients}
        stages={stages}
        history={editingOpportunity?.id ? historyByOpportunity[editingOpportunity.id] || [] : []}
        activities={editingOpportunity?.id ? activitiesByOpportunity[editingOpportunity.id] || [] : []}
        linkedOrder={editingOpportunity?.id ? ordersByOpportunity[editingOpportunity.id]?.[0] || null : null}
        onSave={(payload) => saveOpportunityMutation.mutateAsync(payload)}
        onDelete={(opportunity) => {
          if (window.confirm('¿Eliminar esta oportunidad?')) deleteOpportunityMutation.mutate(opportunity);
        }}
        onCreateActivity={(payload) => createActivityMutation.mutateAsync({ opportunity: editingOpportunity, payload })}
        onCreateOrder={(opportunity) => convertToOrderMutation.mutate(opportunity)}
        isSaving={saveOpportunityMutation.isPending}
        isSavingActivity={createActivityMutation.isPending}
        isCreatingOrder={convertToOrderMutation.isPending}
        canWrite={canWrite}
        canCreateOrder={canWriteOrders}
        ownerEmail={writeOwnerEmail || ownerEmail || ''}
      />

      <LossReasonDialog
        state={lossState}
        onClose={() => setLossState(null)}
        isSaving={moveOpportunityMutation.isPending}
        onConfirm={(reason) => {
          if (!lossState) return;
          moveOpportunityMutation.mutate({
            opportunity: lossState.opportunity,
            stage: lossState.stage,
            lossReason: reason,
          }, {
            onSuccess: () => setLossState(null),
          });
        }}
      />

      <StageManager
        open={stageManagerOpen}
        onOpenChange={setStageManagerOpen}
        stages={stages}
        onCreate={(payload) => createStageMutation.mutateAsync(payload)}
        onUpdate={(stage, payload) => updateStageMutation.mutateAsync({ stage, payload })}
        onSetDefault={(stage) => setDefaultStageMutation.mutateAsync(stage)}
        isSaving={isSavingStage}
      />
    </div>
  );
}

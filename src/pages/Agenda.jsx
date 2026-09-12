import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Plus, Pencil, Trash2, Phone, Clock, Loader2, Eye } from 'lucide-react';
import AgendaCalendar from '@/components/agenda/AgendaCalendar';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  deleteOwnedRowById,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership';

const INITIAL_FORM = {
  client_id: '',
  client_name: '',
  client_phone: '',
  service_type: '',
  date: '',
  time: '',
  price: '',
  status: 'programado',
  notes: '',
};

function toNumber(value) {
  return Number(value || 0);
}

function normalizeAppointmentPayload(raw) {
  return {
    client_id: raw.client_id || null,
    client_name: (raw.client_name || '').trim(),
    client_phone: (raw.client_phone || '').trim() || null,
    service_type: (raw.service_type || '').trim(),
    date: raw.date || null,
    time: raw.time || null,
    price: toNumber(raw.price),
    status: raw.status || 'programado',
    notes: (raw.notes || '').trim() || null,
  };
}

function sortAppointments(rows = []) {
  return [...rows].sort((a, b) => {
    const aDate = `${a.date || ''} ${a.time || '00:00'}`;
    const bDate = `${b.date || ''} ${b.time || '00:00'}`;
    return bDate.localeCompare(aDate);
  });
}

export default function Agenda() {
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const {
    activeWorkspaceId,
    adminMode,
    canWriteModule,
    enabled,
    fetchRows,
    ownerEmail,
    ownerId,
    queryKey: contextQueryKey,
    scopedAdminMode,
    scopedOwnerEmail,
    scopedOwnerId,
    user,
    userProfile,
    writeOwnerEmail,
    writeOwnerId,
  } = useWorkContextScope();
  const writable = adminMode || canWriteModule('agenda');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);

  useEffect(() => {
    if (!writable) {
      setShowForm(false);
      setEditingId(null);
      setFormData(INITIAL_FORM);
    }
  }, [writable]);

  const withOwner = (payload) => ({
    ...payload,
    workspace_id: activeWorkspaceId || null,
    user_id: writeOwnerId,
    created_by: writeOwnerEmail || null,
  });

  const safeInsert = async (table, payload) => {
    if (!writable) throw new Error('Tu acceso es de solo lectura.');

    try {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      if (
        isMissingColumnError(error, `${table}.user_id`) ||
        isMissingColumnError(error, 'user_id') ||
        isMissingColumnError(error, `${table}.created_by`) ||
        isMissingColumnError(error, 'created_by')
      ) {
        const legacy = { ...payload };
        delete legacy.user_id;
        delete legacy.created_by;
        const { data, error: retryError } = await supabase.from(table).insert(legacy).select().single();
        if (retryError) throw retryError;
        return data;
      }

      if (hasOwnerConstraintIssue(error, table)) {
        const legacy = { ...payload };
        delete legacy.user_id;
        const { data, error: retryError } = await supabase.from(table).insert(legacy).select().single();
        if (retryError) throw retryError;
        return data;
      }

      throw error;
    }
  };

  const safeUpdate = async (table, id, payload) => {
    if (!writable) throw new Error('Tu acceso es de solo lectura.');

    return updateOwnedRowById({
      table,
      id,
      payload,
      ownerId: scopedOwnerId,
      ownerEmail: scopedOwnerEmail,
      adminMode: scopedAdminMode,
    });
  };

  const getSingleByField = async (table, field, value) => {
    const rows = await fetchRows({
      table,
      filters: [{ column: field, value }],
    });
    return rows[0] || null;
  };

  const syncCompletedAppointment = async (appointment) => {
    if (!appointment?.client_name || toNumber(appointment.price) <= 0) return;

    const amount = toNumber(appointment.price);
    let client = await getSingleByField('clients', 'name', appointment.client_name);

    if (client?.id) {
      client = await safeUpdate('clients', client.id, {
        phone: appointment.client_phone || client.phone || null,
        total_billed: toNumber(client.total_billed) + amount,
      });
    } else {
      client = await safeInsert('clients', withOwner({
        name: appointment.client_name,
        phone: appointment.client_phone || null,
        total_billed: amount,
        status: 'new',
      }));
    }

    await safeInsert('invoices', withOwner({
      invoice_number: `AGD-${Date.now()}`,
      date: appointment.date,
      due_date: appointment.date,
      client_id: client?.id || null,
      client_name: appointment.client_name,
      client_phone: appointment.client_phone || null,
      line_items: [{
        description: appointment.service_type,
        quantity: 1,
        unit_price: amount,
        total: amount,
      }],
      subtotal: amount,
      tax_enabled: false,
      tax_pct: 0,
      tax_amount: 0,
      total_final: amount,
      total_ingresos: amount,
      total_costos: 0,
      total_ganancia: amount,
      status: 'paid',
      notes: appointment.notes || null,
    }));

    const month = `${appointment.date || ''}`.slice(0, 7);
    if (!month) return;

    const existingRecord = await getSingleByField('monthly_records', 'month', month);
    if (existingRecord?.id) {
      const nextIncome = toNumber(existingRecord.income) + amount;
      const nextExpenses = toNumber(existingRecord.expenses);
      const nextProfit = nextIncome - nextExpenses;
      const nextMargin = nextIncome > 0 ? (nextProfit / nextIncome) * 100 : 0;

      await safeUpdate('monthly_records', existingRecord.id, {
        income: nextIncome,
        profit: nextProfit,
        margin_pct: nextMargin,
      });
      return;
    }

    await safeInsert('monthly_records', withOwner({
      month,
      income: amount,
      expenses: 0,
      profit: amount,
      margin_pct: 100,
    }));
  };

  const { data: clients = [] } = useQuery({
    queryKey: ['agenda-clients', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'clients', orderBy: 'name', ascending: true }),
    enabled,
  });

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', ...contextQueryKey],
    queryFn: async () => sortAppointments(await fetchRows({
      table: 'appointments',
      orderBy: 'date',
      ascending: false,
    })),
    enabled,
  });

  const saveMutation = useMutation({
    mutationFn: async (input) => {
      if (!writable) throw new Error('Tu acceso es de solo lectura.');

      const payload = normalizeAppointmentPayload(input);
      if (!payload.client_name || !payload.service_type || !payload.date) {
        throw new Error('Completa los campos requeridos');
      }

      if (!adminMode && !writeOwnerId && !writeOwnerEmail) {
        throw new Error('Tu sesión aún no está lista. Recarga la página e intenta de nuevo.');
      }

      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (error) {
          console.warn('No se pudo asegurar perfil antes de guardar cita:', error?.message || error);
        }
      }

      const saved = editingId
        ? await safeUpdate('appointments', editingId, payload)
        : await safeInsert('appointments', withOwner(payload));

      let syncError = null;
      if (payload.status === 'completado' && payload.price > 0) {
        try {
          await syncCompletedAppointment(saved || payload);
        } catch (error) {
          syncError = error;
        }
      }

      return { saved, syncError };
    },
    onSuccess: ({ syncError }) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-records'] });

      const wasEditing = Boolean(editingId);
      setShowForm(false);
      setEditingId(null);
      setFormData(INITIAL_FORM);
      toast.success(wasEditing ? 'Cita actualizada' : 'Cita creada');

      if (syncError) {
        toast.warning(`La cita se guardó, pero faltó sincronizar factura/cliente: ${syncError.message}`);
      }
    },
    onError: (error) => {
      toast.error(`No se pudo guardar la cita: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      if (!writable) throw new Error('Tu acceso es de solo lectura.');
      await deleteOwnedRowById({
        table: 'appointments',
        id,
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Cita eliminada');
    },
    onError: (error) => {
      toast.error(`No se pudo eliminar la cita: ${error.message}`);
    },
  });

  const handleSave = () => {
    if (!writable) return;
    saveMutation.mutate(formData);
  };

  const handleEdit = (appointment) => {
    if (!writable) return;
    setEditingId(appointment.id);
    setFormData({
      client_id: appointment.client_id || '',
      client_name: appointment.client_name || '',
      client_phone: appointment.client_phone || '',
      service_type: appointment.service_type || '',
      date: appointment.date || '',
      time: appointment.time || '',
      price: toNumber(appointment.price),
      status: appointment.status || 'programado',
      notes: appointment.notes || '',
    });
    setShowForm(true);
  };

  const handleReset = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setShowForm(false);
  };

  const statusLabels = {
    programado: 'Programado',
    confirmado: 'Confirmado',
    en_proceso: 'En Proceso',
    completado: 'Completado',
    cancelado: 'Cancelado',
  };

  const statusColors = {
    programado: 'bg-blue-100 text-blue-700',
    confirmado: 'bg-green-100 text-green-700',
    en_proceso: 'bg-amber-100 text-amber-700',
    completado: 'bg-violet-100 text-violet-700',
    cancelado: 'bg-red-100 text-red-700',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6" /> Agenda Inteligente
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona tus citas y servicios</p>
        </div>
        {writable ? (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nueva Cita
          </Button>
        ) : null}
      </div>

      {!writable ? (
        <Card className="p-4 border-dashed bg-muted/20">
          <div className="flex items-start gap-3">
            <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Modo solo lectura</p>
              <p className="text-xs text-muted-foreground mt-1">
                Puedes consultar las citas y sus detalles, pero no crear, editar ni eliminar registros.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {writable && showForm ? (
        <Card className="p-6 space-y-4 border-primary/30">
          <h3 className="font-bold text-lg">{editingId ? 'Editar Cita' : 'Nueva Cita'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Cliente CRM</Label>
              <Select
                value={formData.client_id || 'manual'}
                onValueChange={(value) => {
                  if (value === 'manual') {
                    setFormData({ ...formData, client_id: '' });
                    return;
                  }
                  const client = clients.find((item) => item.id === value);
                  setFormData({
                    ...formData,
                    client_id: value,
                    client_name: client?.name || formData.client_name,
                    client_phone: client?.phone || formData.client_phone,
                  });
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Escribir manualmente</SelectItem>
                  {clients.map((client)=><SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nombre del Cliente *</Label>
              <Input value={formData.client_name} onChange={(event) => setFormData({ ...formData, client_name: event.target.value })} placeholder="Nombre completo" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Teléfono (WhatsApp)</Label>
              <Input value={formData.client_phone} onChange={(event) => setFormData({ ...formData, client_phone: event.target.value })} placeholder="+1 809 555 0000" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Tipo de Servicio *</Label>
              <Input value={formData.service_type} onChange={(event) => setFormData({ ...formData, service_type: event.target.value })} placeholder="Ej: Consultoría, Mantenimiento..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Precio Estimado</Label>
              <Input type="number" value={formData.price} onChange={(event) => setFormData({ ...formData, price: toNumber(event.target.value) })} placeholder="0.00" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Fecha *</Label>
              <Input type="date" value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={formData.time} onChange={(event) => setFormData({ ...formData, time: event.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="programado">Programado</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="en_proceso">En Proceso</SelectItem>
                  <SelectItem value="completado">Completado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Notas</Label>
              <textarea
                value={formData.notes}
                onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                placeholder="Detalles adicionales..."
                className="w-full mt-1 p-2 border rounded-md text-sm bg-background"
                rows="3"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleReset}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? 'Actualizar' : 'Crear'} Cita
            </Button>
          </div>
        </Card>
      ) : null}

      <AgendaCalendar appointments={appointments} onEdit={writable ? handleEdit : undefined} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Cliente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Precio</TableHead>
                {writable ? <TableHead className="w-24">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={writable ? 6 : 5} className="text-center py-12">
                    <Calendar className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No hay citas programadas</p>
                  </TableCell>
                </TableRow>
              ) : (
                appointments.map((appointment) => (
                  <TableRow key={appointment.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{appointment.client_name}</p>
                        {appointment.client_phone ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Phone className="h-3 w-3" /> {appointment.client_phone}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{appointment.service_type}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {appointment.date ? format(new Date(appointment.date), 'dd/MM/yyyy', { locale: es }) : '—'}
                      </div>
                      {appointment.time ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" /> {appointment.time}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[appointment.status] || statusColors.programado}>
                        {statusLabels[appointment.status] || 'Programado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {toNumber(appointment.price) > 0 ? formatMoney(appointment.price) : '—'}
                    </TableCell>
                    {writable ? (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(appointment)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (window.confirm(`¿Eliminar cita de ${appointment.client_name}?`)) {
                                deleteMutation.mutate(appointment.id);
                              }
                            }}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

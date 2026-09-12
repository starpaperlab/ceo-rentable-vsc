import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { CalendarDays, FileText, Mail, MessageCircle, Phone, Receipt, ShoppingBag, StickyNote, Trash2, Users, WalletCards } from 'lucide-react';

function sameClient(row = {}, client = {}) {
  if (!row || !client) return false;
  if (row.client_id && client.id) return row.client_id === client.id;
  const rowName = `${row.client_name || row.customer_name || ''}`.trim().toLowerCase();
  const clientName = `${client.name || ''}`.trim().toLowerCase();
  return Boolean(rowName && clientName && rowName === clientName);
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${value}`;
  return new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function statusLabel(value = '') {
  const labels = {
    pending: 'Pendiente',
    paid: 'Pagada',
    partial: 'Pago parcial',
    overdue: 'Vencida',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    completed: 'Completado',
    programado: 'Programado',
    confirmado: 'Confirmado',
    en_proceso: 'En proceso',
    cancelado: 'Cancelado',
    call: 'Llamada',
    whatsapp: 'WhatsApp',
    email: 'Email',
    meeting: 'Reunión',
    other: 'Otro',
  };
  return labels[value] || value || 'Sin estado';
}

export default function Client360Dialog({
  client,
  open,
  onOpenChange,
  invoices = [],
  quotes = [],
  orders = [],
  appointments = [],
  invoicePayments = [],
  activities = [],
  canWrite = false,
  onCreateActivity,
  onDeleteActivity,
  savingActivity = false,
  onUpdateFollowUp,
  savingFollowUp = false,
}) {
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityForm, setActivityForm] = useState({ activity_type: 'call', subject: '', notes: '', occurred_at: new Date().toISOString().slice(0,16) });
  const [followUpForm, setFollowUpForm] = useState({
    next_follow_up_at: client?.next_follow_up_at ? new Date(new Date(client.next_follow_up_at).getTime() - new Date(client.next_follow_up_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '',
    next_follow_up_type: client?.next_follow_up_type || 'call',
    next_follow_up_note: client?.next_follow_up_note || '',
  });
  const { formatMoney } = useCurrency();

  useEffect(() => {
    if (!client) return;
    const value = client.next_follow_up_at ? new Date(client.next_follow_up_at) : null;
    const localValue = value && !Number.isNaN(value.getTime())
      ? new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0,16)
      : '';
    setFollowUpForm({
      next_follow_up_at: localValue,
      next_follow_up_type: client.next_follow_up_type || 'call',
      next_follow_up_note: client.next_follow_up_note || '',
    });
  }, [client?.id, client?.next_follow_up_at, client?.next_follow_up_note, client?.next_follow_up_type]);

  const view = useMemo(() => {
    if (!client) return null;
    const clientInvoices = invoices.filter((row) => sameClient(row, client));
    const clientQuotes = quotes.filter((row) => sameClient(row, client));
    const clientOrders = orders.filter((row) => sameClient(row, client));
    const clientAppointments = appointments.filter((row) => sameClient(row, client));
    const clientActivities = activities.filter((row) => row.client_id === client.id);
    const invoiceIds = new Set(clientInvoices.map((row) => row.id).filter(Boolean));
    const payments = invoicePayments.filter((row) => invoiceIds.has(row.invoice_id));
    const totalInvoiced = clientInvoices.reduce((sum, row) => sum + money(row.total_final || row.total || row.amount), 0);
    const totalPaid = payments.reduce((sum, row) => sum + money(row.amount), 0);
    const legacyPaid = clientInvoices
      .filter((row) => !payments.some((payment) => payment.invoice_id === row.id) && row.status === 'paid')
      .reduce((sum, row) => sum + money(row.total_final || row.total || row.amount), 0);
    const collected = totalPaid + legacyPaid;
    const balance = Math.max(totalInvoiced - collected, 0);

    const timeline = [
      ...clientInvoices.map((row) => ({ id: `invoice-${row.id}`, type: 'Factura', date: row.date || row.created_at, title: row.invoice_number || 'Factura', detail: formatMoney(row.total_final || row.total || 0), status: row.status, icon: Receipt })),
      ...clientQuotes.map((row) => ({ id: `quote-${row.id}`, type: 'Cotización', date: row.date || row.created_at, title: row.quote_number || 'Cotización', detail: formatMoney(row.total_final || row.total || 0), status: row.status, icon: FileText })),
      ...clientOrders.map((row) => ({ id: `order-${row.id}`, type: 'Pedido', date: row.date || row.created_at, title: row.order_number || row.title || 'Pedido', detail: row.total ? formatMoney(row.total) : '', status: row.status, icon: ShoppingBag })),
      ...clientAppointments.map((row) => ({ id: `appointment-${row.id}`, type: 'Actividad', date: row.date || row.created_at, title: row.service_type || 'Actividad / cita', detail: row.time || '', status: row.status, icon: CalendarDays })),
      ...payments.map((row) => ({ id: `payment-${row.id}`, type: 'Pago', date: row.payment_date || row.created_at, title: row.payment_method || 'Pago recibido', detail: formatMoney(row.amount), status: 'paid', icon: WalletCards })),
      ...clientActivities.map((row) => ({ id: `crm-${row.id}`, rawId: row.id, type: 'Actividad CRM', date: row.occurred_at || row.created_at, title: row.subject || 'Actividad', detail: row.notes || '', status: row.activity_type, icon: row.activity_type === 'call' ? Phone : row.activity_type === 'whatsapp' ? MessageCircle : row.activity_type === 'email' ? Mail : row.activity_type === 'meeting' ? Users : StickyNote, crm: true })),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    return { clientInvoices, clientQuotes, clientOrders, clientAppointments, clientActivities, payments, totalInvoiced, collected, balance, timeline };
  }, [activities, appointments, client, formatMoney, invoicePayments, invoices, orders, quotes]);

  if (!client || !view) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto p-0">
        <div className="border-b px-5 py-5 sm:px-6">
          <DialogHeader>
            <DialogTitle className="pr-8 text-xl">{client.name}</DialogTitle>
            <DialogDescription>Vista 360° del cliente: relación comercial, documentos, pagos y actividad.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
            {client.email ? <span>{client.email}</span> : null}
            {client.phone ? <span>· {client.phone}</span> : null}
            <Badge variant="outline">{client.status === 'vip' ? 'VIP' : client.status === 'recurring' ? 'Recurrente' : 'Nuevo'}</Badge>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Facturado</p>
              <p className="mt-1 text-xl font-bold">{formatMoney(view.totalInvoiced)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Cobrado</p>
              <p className="mt-1 text-xl font-bold text-green-600">{formatMoney(view.collected)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Saldo pendiente</p>
              <p className="mt-1 text-xl font-bold text-red-600">{formatMoney(view.balance)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Cotizaciones</p>
              <p className="mt-1 text-xl font-bold">{view.clientQuotes.length}</p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.6fr]">
            <Card className="p-4">
              <p className="text-sm font-semibold">Ficha del cliente</p>
              <div className="mt-4 space-y-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Nombre</p><p className="font-medium">{client.name}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p>{client.email || 'No registrado'}</p></div>
                <div><p className="text-xs text-muted-foreground">Teléfono / WhatsApp</p><p>{client.phone || 'No registrado'}</p></div>
                <div><p className="text-xs text-muted-foreground">Notas</p><p className="whitespace-pre-wrap">{client.notes || 'Sin notas'}</p></div>
              </div>

              <div className="mt-5 border-t pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Próximo seguimiento</p>
                    <p className="text-xs text-muted-foreground">La próxima acción comercial para este cliente.</p>
                  </div>
                  {client.next_follow_up_at ? <Badge variant="outline">{formatDate(client.next_follow_up_at)}</Badge> : null}
                </div>

                {canWrite ? (
                  <div className="mt-3 grid gap-3">
                    <Input
                      type="datetime-local"
                      value={followUpForm.next_follow_up_at || ''}
                      onChange={(e)=>setFollowUpForm((prev)=>({...prev,next_follow_up_at:e.target.value}))}
                    />
                    <Select value={followUpForm.next_follow_up_type || 'call'} onValueChange={(value)=>setFollowUpForm((prev)=>({...prev,next_follow_up_type:value}))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Llamada</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="meeting">Reunión</SelectItem>
                        <SelectItem value="other">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={followUpForm.next_follow_up_note || ''}
                      onChange={(e)=>setFollowUpForm((prev)=>({...prev,next_follow_up_note:e.target.value}))}
                      placeholder="Ej.: confirmar decisión sobre cotización"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      {client.next_follow_up_at ? (
                        <Button
                          variant="outline"
                          disabled={savingFollowUp}
                          onClick={async()=>{
                            await onUpdateFollowUp?.({next_follow_up_at:null,next_follow_up_type:null,next_follow_up_note:null});
                            setFollowUpForm((prev)=>({...prev,next_follow_up_at:'',next_follow_up_note:''}));
                          }}
                        >Quitar seguimiento</Button>
                      ) : null}
                      <Button
                        disabled={savingFollowUp || !followUpForm.next_follow_up_at}
                        onClick={async()=>{
                          await onUpdateFollowUp?.({
                            ...followUpForm,
                            next_follow_up_at:new Date(followUpForm.next_follow_up_at).toISOString(),
                          });
                        }}
                      >{savingFollowUp?'Guardando...':'Guardar seguimiento'}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm">
                    {client.next_follow_up_at ? (
                      <>
                        <p className="font-medium">{client.next_follow_up_note || 'Seguimiento programado'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{statusLabel(client.next_follow_up_type)} · {formatDate(client.next_follow_up_at)}</p>
                      </>
                    ) : <p className="text-muted-foreground">Sin seguimiento programado.</p>}
                  </div>
                )}
              </div>
            </Card>

          <Card className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Actividades CRM</p>
                  <p className="text-xs text-muted-foreground">Llamadas, WhatsApp, emails, reuniones y notas comerciales.</p>
                </div>
                {canWrite ? <Button size="sm" onClick={()=>setShowActivityForm((value)=>!value)}>{showActivityForm ? 'Cancelar' : 'Registrar actividad'}</Button> : null}
              </div>

              {showActivityForm && canWrite ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-border/60 bg-muted/15 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={activityForm.activity_type} onValueChange={(value)=>setActivityForm((prev)=>({...prev,activity_type:value}))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Llamada</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="meeting">Reunión</SelectItem>
                          <SelectItem value="note">Nota</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Fecha y hora</Label>
                      <Input type="datetime-local" className="mt-1" value={activityForm.occurred_at} onChange={(e)=>setActivityForm((prev)=>({...prev,occurred_at:e.target.value}))}/>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Asunto</Label>
                    <Input className="mt-1" value={activityForm.subject} onChange={(e)=>setActivityForm((prev)=>({...prev,subject:e.target.value}))} placeholder="Ej.: Seguimiento de cotización"/>
                  </div>
                  <div>
                    <Label className="text-xs">Notas</Label>
                    <Textarea className="mt-1" value={activityForm.notes} onChange={(e)=>setActivityForm((prev)=>({...prev,notes:e.target.value}))} placeholder="Resumen de la conversación o siguiente paso"/>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      disabled={savingActivity || !activityForm.subject.trim()}
                      onClick={async()=>{
                        await onCreateActivity?.({...activityForm,occurred_at:activityForm.occurred_at ? new Date(activityForm.occurred_at).toISOString() : new Date().toISOString()});
                        setActivityForm({ activity_type:'call', subject:'', notes:'', occurred_at:new Date().toISOString().slice(0,16) });
                        setShowActivityForm(false);
                      }}
                    >{savingActivity ? 'Guardando...' : 'Guardar actividad'}</Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                {view.clientActivities.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Sin actividades CRM registradas.</p> : view.clientActivities.map((activity)=>{
                  const Icon = activity.activity_type === 'call' ? Phone : activity.activity_type === 'whatsapp' ? MessageCircle : activity.activity_type === 'email' ? Mail : activity.activity_type === 'meeting' ? Users : StickyNote;
                  return <div key={activity.id} className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4"/></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{activity.subject}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(activity.occurred_at || activity.created_at)}</p>
                      </div>
                      {activity.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{activity.notes}</p> : null}
                    </div>
                    {canWrite ? <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={()=>onDeleteActivity?.(activity.id)} title="Eliminar actividad"><Trash2 className="h-3.5 w-3.5"/></Button> : null}
                  </div>;
                })}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Historial comercial</p>
                  <p className="text-xs text-muted-foreground">{view.timeline.length} movimiento{view.timeline.length === 1 ? '' : 's'} relacionado{view.timeline.length === 1 ? '' : 's'}</p>
                </div>
              </div>

              {view.timeline.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no hay actividad relacionada con este cliente.</div>
              ) : (
                <div className="mt-4 space-y-1">
                  {view.timeline.slice(0, 30).map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.id} className="flex gap-3 rounded-xl px-2 py-3 hover:bg-muted/35">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">{item.type}</span>
                            {item.detail ? <span className="text-xs font-medium">{item.detail}</span> : null}
                            {item.status ? <Badge variant="outline" className="h-5 text-[10px]">{statusLabel(item.status)}</Badge> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, Check, CheckCheck, CheckCircle2, CircleDollarSign, FileText, Megaphone, ShieldAlert, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createPageUrl } from '@/utils';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/lib/supabase';

function formatWhen(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function isPast(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time < Date.now();
}

function withinDays(value, days) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time)) return false;
  const now = Date.now();
  return time >= now && time <= now + (days * 24 * 60 * 60 * 1000);
}

export default function NotificationBell() {
  const queryClient = useQueryClient();
  const { hasModuleAccess } = useWorkspace();
  const { activeWorkspaceId, enabled, fetchRows, ownerId, queryKey: contextQueryKey } = useWorkContextScope();
  const canSeeClients = hasModuleAccess('clients');
  const canSeeAgenda = hasModuleAccess('agenda');
  const canSeeDashboard = hasModuleAccess('dashboard');
  const canSeeReceivables = hasModuleAccess('receivables');
  const canSeeBilling = hasModuleAccess('billing');

  const { data: reminders = [] } = useQuery({
    queryKey: ['notification-bell-reminders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'reminders', orderBy: 'due_at', ascending: true }),
    enabled: enabled && (canSeeDashboard || canSeeClients || canSeeAgenda),
    refetchInterval: 60000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['notification-bell-clients', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'clients', orderBy: 'next_follow_up_at', ascending: true }),
    enabled: enabled && canSeeClients,
    refetchInterval: 60000,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['notification-bell-appointments', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'appointments', orderBy: 'date', ascending: true }),
    enabled: enabled && canSeeAgenda,
    refetchInterval: 60000,
  });

  const { data: storedNotifications = [] } = useQuery({
    queryKey: ['notification-bell-stored', ...contextQueryKey],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase
        .from('app_notifications')
        .select('*')
        .eq('is_active', true)
        .lte('published_at', now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('published_at', { ascending: false });

      query = activeWorkspaceId
        ? query.or(`workspace_id.eq.${activeWorkspaceId},workspace_id.is.null`)
        : query.is('workspace_id', null);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled,
    refetchInterval: 60000,
  });

  const { data: notificationStates = [] } = useQuery({
    queryKey: ['notification-user-state', ownerId, activeWorkspaceId],
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from('notification_user_state')
        .select('*')
        .eq('user_id', ownerId);
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && Boolean(ownerId),
  });

  const feed = useMemo(() => {
    const pendingReminders = reminders
      .filter((item) => item.status === 'pending')
      .map((item) => ({
        id: `reminder-${item.id}-${item.due_at || ''}`,
        kind: 'reminder',
        title: item.title || 'Recordatorio',
        subtitle: item.notes || 'Recordatorio interno',
        when: item.due_at,
        urgent: item.priority === 'urgent' || isPast(item.due_at),
        icon: Bell,
        to: createPageUrl('Clients'),
      }));

    const followUps = clients
      .filter((client) => client.next_follow_up_at && (isPast(client.next_follow_up_at) || withinDays(client.next_follow_up_at, 7)))
      .map((client) => ({
        id: `followup-${client.id}-${client.next_follow_up_at || ''}`,
        kind: 'followup',
        title: client.name || 'Cliente',
        subtitle: client.next_follow_up_note || 'Seguimiento comercial pendiente',
        when: client.next_follow_up_at,
        urgent: isPast(client.next_follow_up_at) || client.priority === 'urgent',
        icon: UserRound,
        to: createPageUrl('Clients'),
      }));

    const today = new Date().toISOString().slice(0, 10);
    const todayAppointments = appointments
      .filter((item) => item.date === today && item.status !== 'cancelado' && item.status !== 'completado')
      .map((item) => ({
        id: `appointment-${item.id}-${item.date || ''}-${item.time || ''}`,
        kind: 'appointment',
        title: item.client_name || item.service_type || 'Actividad de hoy',
        subtitle: item.service_type || 'Actividad programada',
        when: item.time ? `${item.date}T${item.time}` : item.date,
        urgent: false,
        icon: CalendarClock,
        to: createPageUrl('Agenda'),
      }));

    const persisted = storedNotifications
      .filter((item) => {
        if (item.workspace_id == null) return true;
        if (item.notification_type === 'reminder' || item.notification_type === 'follow_up') return canSeeClients;
        if (item.notification_type === 'appointment') return canSeeAgenda;
        if (item.notification_type === 'receivable') return canSeeReceivables;
        if (item.notification_type === 'quote') return canSeeBilling;
        if (item.notification_type === 'product_update' || item.notification_type === 'system') return canSeeDashboard;
        return false;
      })
      .map((item) => {
      const meta = {
        reminder: { icon: Bell, fallback: createPageUrl('Clients') },
        follow_up: { icon: UserRound, fallback: createPageUrl('Clients') },
        appointment: { icon: CalendarClock, fallback: createPageUrl('Agenda') },
        receivable: { icon: CircleDollarSign, fallback: createPageUrl('Receivables') },
        quote: { icon: FileText, fallback: createPageUrl('Billing') },
        product_update: { icon: Megaphone, fallback: createPageUrl('Dashboard') },
        system: { icon: ShieldAlert, fallback: createPageUrl('Dashboard') },
      }[item.notification_type] || { icon: Bell, fallback: createPageUrl('Dashboard') };

      return {
        id: `stored-${item.id}`,
        kind: item.notification_type,
        title: item.title || 'Notificación',
        subtitle: item.message || 'Tienes una nueva notificación.',
        when: item.published_at || item.created_at,
        urgent: item.severity === 'critical',
        severity: item.severity || 'info',
        icon: meta.icon,
        to: item.action_path || meta.fallback,
      };
    });

    return [...pendingReminders, ...followUps, ...todayAppointments, ...persisted]
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return new Date(a.when || 0).getTime() - new Date(b.when || 0).getTime();
      })
      .slice(0, 12);
  }, [appointments, canSeeAgenda, canSeeBilling, canSeeClients, canSeeDashboard, canSeeReceivables, clients, reminders, storedNotifications]);

  const stateByKey = useMemo(
    () => notificationStates.reduce((map, row) => {
      map[row.notification_key] = row;
      return map;
    }, {}),
    [notificationStates]
  );

  const feedWithState = useMemo(
    () => feed
      .filter((item) => !stateByKey[item.id]?.dismissed_at)
      .map((item) => ({ ...item, isRead: Boolean(stateByKey[item.id]?.read_at) })),
    [feed, stateByKey]
  );

  const unreadCount = feedWithState.filter((item) => !item.isRead).length;

  const markRead = async (notificationKey) => {
    if (!ownerId || !notificationKey) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('notification_user_state')
      .upsert({
        user_id: ownerId,
        workspace_id: activeWorkspaceId || null,
        notification_key: notificationKey,
        read_at: now,
        updated_at: now,
      }, { onConflict: 'user_id,notification_key' });
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['notification-user-state', ownerId, activeWorkspaceId] });
    }
  };

  const markAllRead = async () => {
    if (!ownerId) return;
    const unread = feedWithState.filter((item) => !item.isRead);
    if (unread.length === 0) return;
    const now = new Date().toISOString();
    const rows = unread.map((item) => ({
      user_id: ownerId,
      workspace_id: activeWorkspaceId || null,
      notification_key: item.id,
      read_at: now,
      updated_at: now,
    }));
    const { error } = await supabase
      .from('notification_user_state')
      .upsert(rows, { onConflict: 'user_id,notification_key' });
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['notification-user-state', ownerId, activeWorkspaceId] });
    }
  };

  const count = unreadCount;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notificaciones">
          <Bell className="h-4.5 w-4.5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Centro de notificaciones</p>
              <p className="text-xs text-muted-foreground">CRM, cobros, cotizaciones, novedades y alertas del sistema.</p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? <Badge variant="outline">{unreadCount} no leída{unreadCount === 1 ? '' : 's'}</Badge> : null}
              {unreadCount > 0 ? (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={markAllRead}>
                  <CheckCheck className="mr-1 h-3.5 w-3.5" /> Todas
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2">
          {feedWithState.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold">Todo al día</p>
              <p className="mt-1 text-xs text-muted-foreground">No tienes pendientes inmediatos.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {feedWithState.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    onClick={() => markRead(item.id)}
                    className={`relative flex gap-3 rounded-xl px-3 py-3 transition hover:bg-muted/50 ${item.isRead ? 'opacity-70' : 'bg-primary/[0.04]'}`}
                  >
                    {!item.isRead ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-label="No leída" /> : null}
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.urgent ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 pr-3">
                        <p className={`truncate text-sm ${item.isRead ? 'font-medium' : 'font-semibold'}`}>{item.title}</p>
                        {item.urgent ? <Badge className="border-0 bg-red-100 text-red-700 text-[10px]">Atención</Badge> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.subtitle}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-[10px] font-medium text-muted-foreground">{formatWhen(item.when)}</p>
                        {item.isRead ? <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Check className="h-3 w-3"/>Leída</span> : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

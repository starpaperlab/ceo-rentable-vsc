import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarClock, CheckCircle2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createPageUrl } from '@/utils';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';

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
  const { enabled, fetchRows, queryKey: contextQueryKey } = useWorkContextScope();

  const { data: reminders = [] } = useQuery({
    queryKey: ['notification-bell-reminders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'reminders', orderBy: 'due_at', ascending: true }),
    enabled,
    refetchInterval: 60000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['notification-bell-clients', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'clients', orderBy: 'next_follow_up_at', ascending: true }),
    enabled,
    refetchInterval: 60000,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['notification-bell-appointments', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'appointments', orderBy: 'date', ascending: true }),
    enabled,
    refetchInterval: 60000,
  });

  const feed = useMemo(() => {
    const pendingReminders = reminders
      .filter((item) => item.status === 'pending')
      .map((item) => ({
        id: `reminder-${item.id}`,
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
        id: `followup-${client.id}`,
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
        id: `appointment-${item.id}`,
        kind: 'appointment',
        title: item.client_name || item.service_type || 'Actividad de hoy',
        subtitle: item.service_type || 'Actividad programada',
        when: item.time ? `${item.date}T${item.time}` : item.date,
        urgent: false,
        icon: CalendarClock,
        to: createPageUrl('Agenda'),
      }));

    return [...pendingReminders, ...followUps, ...todayAppointments]
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return new Date(a.when || 0).getTime() - new Date(b.when || 0).getTime();
      })
      .slice(0, 12);
  }, [appointments, clients, reminders]);

  const count = feed.length;

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
              <p className="text-xs text-muted-foreground">Recordatorios, seguimientos y actividades de hoy.</p>
            </div>
            {count > 0 ? <Badge variant="outline">{count} pendiente{count === 1 ? '' : 's'}</Badge> : null}
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2">
          {feed.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold">Todo al día</p>
              <p className="mt-1 text-xs text-muted-foreground">No tienes pendientes inmediatos.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {feed.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className="flex gap-3 rounded-xl px-3 py-3 transition hover:bg-muted/50"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.urgent ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{item.title}</p>
                        {item.urgent ? <Badge className="border-0 bg-red-100 text-red-700 text-[10px]">Atención</Badge> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.subtitle}</p>
                      <p className="mt-1 text-[10px] font-medium text-muted-foreground">{formatWhen(item.when)}</p>
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

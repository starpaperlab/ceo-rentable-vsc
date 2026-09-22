import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Copy, ExternalLink, Link2, Loader2, Save, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const DAYS = [
  ['Domingo', 0],
  ['Lunes', 1],
  ['Martes', 2],
  ['Miércoles', 3],
  ['Jueves', 4],
  ['Viernes', 5],
  ['Sábado', 6],
];

const normalizeSlug = (value = '') => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

export default function PublicBookingSettings({ workspaceId, writable = false }) {
  const queryClient = useQueryClient();
  const [pageForm, setPageForm] = useState(null);
  const [serviceForm, setServiceForm] = useState(null);
  const [availabilityForm, setAvailabilityForm] = useState([]);

  const { data: page, isLoading } = useQuery({
    queryKey: ['booking-page', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_pages')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ['booking-services', page?.id],
    enabled: Boolean(page?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_services')
        .select('*')
        .eq('booking_page_id', page.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: availability = [] } = useQuery({
    queryKey: ['booking-availability', page?.id],
    enabled: Boolean(page?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_availability')
        .select('*')
        .eq('booking_page_id', page.id)
        .order('weekday', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!page) {
      setPageForm(null);
      return;
    }
    setPageForm({
      title: page.title || 'Reserva una cita',
      description: page.description || '',
      slug: page.slug || '',
      timezone: page.timezone || 'America/Santo_Domingo',
      min_notice_hours: page.min_notice_hours ?? 2,
      max_days_ahead: page.max_days_ahead ?? 60,
      is_active: page.is_active !== false,
    });
  }, [page]);

  useEffect(() => {
    const service = services[0];
    if (!service) {
      setServiceForm(null);
      return;
    }
    setServiceForm({
      id: service.id,
      name: service.name || 'Cita',
      description: service.description || '',
      duration_minutes: service.duration_minutes || 20,
      is_active: service.is_active !== false,
    });
  }, [services]);

  useEffect(() => {
    if (!page?.id) {
      setAvailabilityForm([]);
      return;
    }
    const byDay = new Map(availability.map((row) => [row.weekday, row]));
    setAvailabilityForm(DAYS.map(([label, weekday]) => {
      const row = byDay.get(weekday);
      const weekdayDefault = weekday >= 1 && weekday <= 5;
      return {
        label,
        weekday,
        is_active: row ? row.is_active !== false : weekdayDefault,
        start_time: (row?.start_time || '09:00').slice(0, 5),
        end_time: (row?.end_time || '17:00').slice(0, 5),
      };
    }));
  }, [availability, page?.id]);

  const bookingUrl = useMemo(() => (
    page?.slug ? `${window.location.origin}/reservar/${page.slug}` : ''
  ), [page?.slug]);

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('Workspace no disponible.');
      const slug = `reserva-${workspaceId.slice(0, 8)}`;
      const { data: createdPage, error: pageError } = await supabase
        .from('booking_pages')
        .insert({
          workspace_id: workspaceId,
          slug,
          title: 'Reserva una cita',
          description: 'Elige el horario que mejor te funcione.',
          timezone: 'America/Santo_Domingo',
          min_notice_hours: 2,
          max_days_ahead: 60,
          is_active: true,
        })
        .select()
        .single();
      if (pageError) throw pageError;

      const { error: serviceError } = await supabase
        .from('booking_services')
        .insert({
          workspace_id: workspaceId,
          booking_page_id: createdPage.id,
          name: 'Cita / demo',
          description: 'Reserva un espacio para conversar.',
          duration_minutes: 20,
          is_active: true,
          sort_order: 10,
        });
      if (serviceError) throw serviceError;

      const rows = [1, 2, 3, 4, 5].map((weekday) => ({
        workspace_id: workspaceId,
        booking_page_id: createdPage.id,
        weekday,
        start_time: '09:00',
        end_time: '17:00',
        is_active: true,
      }));
      const { error: availabilityError } = await supabase.from('booking_availability').insert(rows);
      if (availabilityError) throw availabilityError;
      return createdPage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-page', workspaceId] });
      toast.success('Reservas públicas activadas');
    },
    onError: (error) => toast.error(error.message || 'No se pudo activar la agenda pública'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!page?.id || !pageForm || !serviceForm) return;
      const cleanSlug = normalizeSlug(pageForm.slug);
      if (cleanSlug.length < 3) throw new Error('El enlace debe tener al menos 3 caracteres.');

      const { error: pageError } = await supabase
        .from('booking_pages')
        .update({
          title: pageForm.title.trim() || 'Reserva una cita',
          description: pageForm.description.trim() || null,
          slug: cleanSlug,
          timezone: pageForm.timezone.trim() || 'America/Santo_Domingo',
          min_notice_hours: Number(pageForm.min_notice_hours || 0),
          max_days_ahead: Number(pageForm.max_days_ahead || 60),
          is_active: Boolean(pageForm.is_active),
          updated_at: new Date().toISOString(),
        })
        .eq('id', page.id);
      if (pageError) throw pageError;

      const { error: serviceError } = await supabase
        .from('booking_services')
        .update({
          name: serviceForm.name.trim() || 'Cita',
          description: serviceForm.description.trim() || null,
          duration_minutes: Number(serviceForm.duration_minutes || 20),
          is_active: Boolean(serviceForm.is_active),
          updated_at: new Date().toISOString(),
        })
        .eq('id', serviceForm.id);
      if (serviceError) throw serviceError;

      const rows = availabilityForm.map((row) => ({
        workspace_id: workspaceId,
        booking_page_id: page.id,
        weekday: row.weekday,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: Boolean(row.is_active),
        updated_at: new Date().toISOString(),
      }));
      const { error: availabilityError } = await supabase
        .from('booking_availability')
        .upsert(rows, { onConflict: 'booking_page_id,weekday' });
      if (availabilityError) throw availabilityError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-page', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['booking-services', page?.id] });
      queryClient.invalidateQueries({ queryKey: ['booking-availability', page?.id] });
      toast.success('Disponibilidad guardada');
    },
    onError: (error) => toast.error(error.message || 'No se pudo guardar'),
  });

  const copyLink = async () => {
    if (!bookingUrl) return;
    await navigator.clipboard.writeText(bookingUrl);
    toast.success('Enlace copiado');
  };

  if (!workspaceId || isLoading) return null;

  if (!page) {
    return (
      <Card className="border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <p className="font-semibold">Reservas online</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea un enlace público para que tus clientes vean disponibilidad y reserven sin escribirte primero.
            </p>
          </div>
          {writable && (
            <Button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
              {activateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Activar reservas
            </Button>
          )}
        </div>
      </Card>
    );
  }

  if (!pageForm || !serviceForm) return null;

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <p className="font-semibold">Reservas online</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Tu enlace público funciona como una agenda tipo Calendly.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}><Copy className="mr-2 h-4 w-4" />Copiar enlace</Button>
          <Button variant="outline" size="sm" onClick={() => window.open(bookingUrl, '_blank')}><ExternalLink className="mr-2 h-4 w-4" />Ver página</Button>
        </div>
      </div>

      <div className="mb-5 rounded-xl border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Tu enlace de reservas</p>
        <p className="mt-1 break-all text-sm font-semibold text-primary">{bookingUrl}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Título</Label>
          <Input className="mt-1" value={pageForm.title} disabled={!writable} onChange={(e) => setPageForm((p) => ({ ...p, title: e.target.value }))} />
        </div>
        <div>
          <Label>Enlace personalizado</Label>
          <div className="mt-1 flex items-center rounded-md border bg-background px-3">
            <span className="shrink-0 text-xs text-muted-foreground">/reservar/</span>
            <input className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" value={pageForm.slug} disabled={!writable} onChange={(e) => setPageForm((p) => ({ ...p, slug: normalizeSlug(e.target.value) }))} />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Descripción</Label>
          <Input className="mt-1" value={pageForm.description} disabled={!writable} onChange={(e) => setPageForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div>
          <Label>Tipo de cita</Label>
          <Input className="mt-1" value={serviceForm.name} disabled={!writable} onChange={(e) => setServiceForm((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <Label>Duración</Label>
          <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={serviceForm.duration_minutes} disabled={!writable} onChange={(e) => setServiceForm((p) => ({ ...p, duration_minutes: Number(e.target.value) }))}>
            {[15,20,30,45,60,90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}
          </select>
        </div>
        <div>
          <Label>Anticipación mínima</Label>
          <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={pageForm.min_notice_hours} disabled={!writable} onChange={(e) => setPageForm((p) => ({ ...p, min_notice_hours: Number(e.target.value) }))}>
            {[0,1,2,4,12,24,48].map((hours) => <option key={hours} value={hours}>{hours === 0 ? 'Sin mínimo' : `${hours} horas`}</option>)}
          </select>
        </div>
        <div>
          <Label>Reservas hasta</Label>
          <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={pageForm.max_days_ahead} disabled={!writable} onChange={(e) => setPageForm((p) => ({ ...p, max_days_ahead: Number(e.target.value) }))}>
            {[14,30,60,90].map((days) => <option key={days} value={days}>{days} días adelante</option>)}
          </select>
        </div>
      </div>

      <div className="mt-6">
        <p className="font-semibold">Disponibilidad semanal</p>
        <p className="mt-1 text-xs text-muted-foreground">Activa los días en que quieres recibir reservas.</p>
        <div className="mt-3 divide-y rounded-xl border">
          {availabilityForm.map((row, index) => (
            <div key={row.weekday} className="grid grid-cols-[1fr_auto] gap-3 p-3 sm:grid-cols-[140px_1fr_auto] sm:items-center">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={row.is_active} disabled={!writable} onChange={(e) => setAvailabilityForm((items) => items.map((item, i) => i === index ? { ...item, is_active: e.target.checked } : item))} />
                {row.label}
              </label>
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <Input type="time" value={row.start_time} disabled={!writable || !row.is_active} onChange={(e) => setAvailabilityForm((items) => items.map((item, i) => i === index ? { ...item, start_time: e.target.value } : item))} />
                <span className="text-xs text-muted-foreground">a</span>
                <Input type="time" value={row.end_time} disabled={!writable || !row.is_active} onChange={(e) => setAvailabilityForm((items) => items.map((item, i) => i === index ? { ...item, end_time: e.target.value } : item))} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {writable && (
        <div className="mt-5 flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar reservas
          </Button>
        </div>
      )}
    </Card>
  );
}

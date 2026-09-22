import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export default function PublicBooking() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState(null);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc('get_public_booking_page', { p_slug: slug });
      if (cancelled) return;
      if (rpcError) {
        setError('No pudimos cargar esta agenda.');
        setPageData(null);
      } else {
        setPageData(data || null);
        const firstService = data?.services?.[0];
        if (firstService?.id) setServiceId(firstService.id);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const page = pageData?.page;
  const services = pageData?.services || [];
  const selectedService = services.find((item) => item.id === serviceId) || services[0];

  const minDate = useMemo(() => isoDate(new Date()), []);
  const maxDate = useMemo(() => {
    const target = new Date();
    target.setDate(target.getDate() + Number(page?.max_days_ahead || 60));
    return isoDate(target);
  }, [page?.max_days_ahead]);

  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([]);
      setTime('');
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingSlots(true);
      setTime('');
      const { data, error: rpcError } = await supabase.rpc('get_public_booking_slots', {
        p_slug: slug,
        p_service_id: serviceId,
        p_date: date,
      });
      if (cancelled) return;
      if (rpcError) {
        setSlots([]);
        setError('No pudimos consultar los horarios disponibles.');
      } else {
        setSlots((data || []).map((row) => row.slot_time));
        setError('');
      }
      setLoadingSlots(false);
    })();
    return () => { cancelled = true; };
  }, [slug, serviceId, date]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!serviceId || !date || !time || form.name.trim().length < 2) {
      setError('Completa tu nombre, fecha y horario.');
      return;
    }
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('create_public_booking', {
      p_slug: slug,
      p_service_id: serviceId,
      p_date: date,
      p_time: time,
      p_client_name: form.name.trim(),
      p_client_email: form.email.trim() || null,
      p_client_phone: form.phone.trim() || null,
      p_notes: form.notes.trim() || null,
    });
    if (rpcError) {
      setError(rpcError.message || 'No se pudo completar la reserva.');
      setSubmitting(false);
      const { data: refreshed } = await supabase.rpc('get_public_booking_slots', {
        p_slug: slug,
        p_service_id: serviceId,
        p_date: date,
      });
      setSlots((refreshed || []).map((row) => row.slot_time));
      setTime('');
      return;
    }
    setConfirmed({ id: data, date, time, service: selectedService?.name || 'Cita' });
    setSubmitting(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-[#F7F3EE] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D45387]" /></div>;
  }

  if (!pageData || !page) {
    return (
      <main className="min-h-screen bg-[#F7F3EE] px-4 py-12">
        <div className="mx-auto max-w-lg rounded-3xl border bg-white p-8 text-center shadow-sm">
          <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
          <h1 className="mt-4 text-2xl font-black">Agenda no disponible</h1>
          <p className="mt-2 text-sm text-gray-500">Este enlace no existe o las reservas están desactivadas.</p>
        </div>
      </main>
    );
  }

  const primary = page.brand_primary_color || '#D45387';

  if (confirmed) {
    return (
      <main className="min-h-screen bg-[#F7F3EE] px-4 py-12">
        <div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 text-center shadow-xl">
          {page.logo_url ? <img src={page.logo_url} alt={page.business_name} className="mx-auto mb-4 h-14 max-w-[180px] object-contain" /> : null}
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
          <h1 className="mt-4 text-3xl font-black">Reserva confirmada</h1>
          <p className="mt-3 text-gray-600">Tu cita quedó registrada en la agenda de {page.business_name}.</p>
          <div className="mt-6 rounded-2xl bg-gray-50 p-5 text-left">
            <p className="font-bold">{confirmed.service}</p>
            <p className="mt-2 text-sm text-gray-600">{confirmed.date} · {confirmed.time}</p>
          </div>
          <p className="mt-5 text-xs text-gray-400">Puedes guardar esta información para tu referencia.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F3EE] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center">
          {page.logo_url ? <img src={page.logo_url} alt={page.business_name} className="mx-auto mb-4 h-14 max-w-[180px] object-contain" /> : null}
          <p className="text-sm font-bold" style={{ color: primary }}>{page.business_name}</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{page.title}</h1>
          {page.description ? <p className="mx-auto mt-3 max-w-2xl text-gray-600">{page.description}</p> : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">1. Elige tu cita</h2>
            <div className="mt-5 space-y-4">
              <div>
                <Label>Tipo de cita</Label>
                <select className="mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>{service.name} · {service.duration_minutes} min</option>
                  ))}
                </select>
                {selectedService?.description ? <p className="mt-2 text-xs text-gray-500">{selectedService.description}</p> : null}
              </div>

              <div>
                <Label>Fecha</Label>
                <Input type="date" className="mt-1 h-11" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div>
                <Label>Horario disponible</Label>
                {!date ? (
                  <p className="mt-2 text-sm text-gray-500">Selecciona una fecha para ver horarios.</p>
                ) : loadingSlots ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Buscando disponibilidad…</div>
                ) : slots.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTime(slot)}
                        className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${time === slot ? 'text-white' : 'bg-white hover:bg-gray-50'}`}
                        style={time === slot ? { backgroundColor: primary, borderColor: primary } : undefined}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">No hay horarios disponibles para esta fecha.</p>
                )}
              </div>

              <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
                <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                Zona horaria: {page.timezone}
              </div>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black">2. Tus datos</h2>
            <div className="mt-5 space-y-4">
              <div>
                <Label>Nombre *</Label>
                <Input className="mt-1 h-11" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Tu nombre" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" className="mt-1 h-11" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="tu@correo.com" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input className="mt-1 h-11" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+1 809 000 0000" />
              </div>
              <div>
                <Label>¿Qué necesitas conversar?</Label>
                <textarea className="mt-1 min-h-[110px] w-full rounded-md border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Cuéntanos brevemente…" />
              </div>
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
              <Button type="submit" className="h-12 w-full text-base font-bold" disabled={submitting || !time} style={{ backgroundColor: primary }}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
                Confirmar reserva
              </Button>
              <p className="text-center text-xs text-gray-400">La cita se añade automáticamente a la agenda del negocio.</p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

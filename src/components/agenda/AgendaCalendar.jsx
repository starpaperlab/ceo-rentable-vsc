import React, { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const STATUS_STYLES = {
  programado: 'bg-blue-100 text-blue-700',
  confirmado: 'bg-green-100 text-green-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  completado: 'bg-violet-100 text-violet-700',
  cancelado: 'bg-red-100 text-red-700',
};

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function AgendaCalendar({ appointments = [], onEdit }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDay = useMemo(() => appointments.reduce((map, appointment) => {
    const date = normalizeDate(appointment.date);
    if (!date) return map;
    const key = format(date, 'yyyy-MM-dd');
    if (!map[key]) map[key] = [];
    map[key].push(appointment);
    return map;
  }, {}), [appointments]);

  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedAppointments = byDay[selectedKey] || [];

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold capitalize">{format(cursor, 'MMMM yyyy', { locale: es })}</p>
            <p className="text-xs text-muted-foreground">Vista mensual de citas y actividades programadas.</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>setCursor((value)=>subMonths(value,1))}><ChevronLeft className="h-4 w-4"/></Button>
            <Button variant="outline" size="sm" onClick={()=>{const now=new Date();setCursor(now);setSelectedDate(now)}}>Hoy</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>setCursor((value)=>addMonths(value,1))}><ChevronRight className="h-4 w-4"/></Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b bg-muted/25 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day)=><div key={day} className="px-1 py-2">{day}</div>)}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day)=>{
            const key=format(day,'yyyy-MM-dd');
            const items=byDay[key]||[];
            const selected=isSameDay(day,selectedDate);
            return (
              <button
                key={key}
                type="button"
                onClick={()=>setSelectedDate(day)}
                className={`min-h-[92px] border-b border-r p-1.5 text-left transition hover:bg-muted/25 sm:min-h-[108px] ${!isSameMonth(day,cursor)?'bg-muted/10 text-muted-foreground/45':''} ${selected?'ring-2 ring-inset ring-primary/40':''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isSameDay(day,new Date())?'bg-primary text-primary-foreground':''}`}>{format(day,'d')}</span>
                  {items.length>0?<span className="text-[10px] font-semibold text-primary">{items.length}</span>:null}
                </div>
                <div className="mt-1 space-y-1">
                  {items.slice(0,2).map((item)=>(
                    <div key={item.id} className="truncate rounded-md bg-primary/8 px-1.5 py-1 text-[10px] font-medium text-foreground">
                      {item.time ? `${item.time} · ` : ''}{item.client_name || item.service_type || 'Actividad'}
                    </div>
                  ))}
                  {items.length>2?<div className="px-1 text-[10px] text-muted-foreground">+{items.length-2} más</div>:null}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <div>
          <p className="text-sm font-semibold capitalize">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</p>
          <p className="text-xs text-muted-foreground">{selectedAppointments.length} actividad{selectedAppointments.length===1?'':'es'}</p>
        </div>

        <div className="mt-4 space-y-2">
          {selectedAppointments.length===0?(
            <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No hay citas programadas para este día.</div>
          ):selectedAppointments
            .slice()
            .sort((a,b)=>`${a.time||'99:99'}`.localeCompare(`${b.time||'99:99'}`))
            .map((appointment)=>(
              <button key={appointment.id} type="button" onClick={()=>onEdit?.(appointment)} className="w-full rounded-xl border border-border/60 p-3 text-left transition hover:bg-muted/25">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{appointment.client_name || 'Cliente'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.service_type || 'Actividad'}{appointment.time ? ` · ${appointment.time}` : ''}</p>
                  </div>
                  <Badge className={`${STATUS_STYLES[appointment.status] || STATUS_STYLES.programado} border-0 text-[10px]`}>{appointment.status?.replace('_',' ') || 'programado'}</Badge>
                </div>
              </button>
            ))}
        </div>
      </Card>
    </div>
  );
}

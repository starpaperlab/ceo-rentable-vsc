import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarClock, Eye, Pencil, Trash2, Users, Star } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';

const statusLabels={new:'Nuevo',recurring:'Recurrente',vip:'VIP'};
const statusColors={new:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',recurring:'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',vip:'bg-primary/10 text-primary'};
const stageLabels={new:'Nuevo',follow_up:'En seguimiento',interested:'Interesado',quoted:'Cotizado',negotiation:'Negociación',won:'Ganado',lost:'Perdido'};
const stageColors={new:'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',follow_up:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',interested:'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',quoted:'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',negotiation:'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',won:'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',lost:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'};
const priorityLabels={low:'Baja',normal:'Normal',high:'Alta',urgent:'Urgente'};
const priorityColors={low:'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',normal:'bg-muted text-foreground',high:'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',urgent:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'};

function formatFollowUp(value){
  if(!value)return null;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return new Intl.DateTimeFormat('es-DO',{day:'2-digit',month:'short',hour:'numeric',minute:'2-digit'}).format(date);
}

function Actions({client,onView,onEdit,onDelete,readOnly}){
  return <div className="flex gap-1">
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>onView?.(client)} title="Ver cliente 360"><Eye className="h-3.5 w-3.5"/></Button>
    {!readOnly&&<>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>onEdit(client)} title="Editar cliente"><Pencil className="h-3.5 w-3.5"/></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>onDelete(client.id)} title="Eliminar cliente"><Trash2 className="h-3.5 w-3.5 text-muted-foreground"/></Button>
    </>}
  </div>;
}

export default function ClientTable({clients,onView,onEdit,onDelete,readOnly=false}){
  const{formatMoney}=useCurrency();

  if(clients.length===0){
    return <Card className="py-12 text-center"><Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2"/><p className="text-sm text-muted-foreground">No hay clientes aún</p></Card>;
  }

  return <>
    <div className="grid gap-3 md:hidden">
      {clients.map(c=><Card key={c.id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{c.name?.[0]?.toUpperCase()}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">{c.email||'Sin email'}</p>
            </div>
          </div>
          <Actions client={c} onView={onView} onEdit={onEdit} onDelete={onDelete} readOnly={readOnly}/>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className={statusColors[c.status||'new']}>{statusLabels[c.status||'new']}</Badge>
          <Badge className={stageColors[c.crm_stage||'new']}>{stageLabels[c.crm_stage||'new']}</Badge>
          <Badge className={priorityColors[c.priority||'normal']}>{priorityLabels[c.priority||'normal']}</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Facturación</p>
            <p className="mt-0.5 font-semibold">{formatMoney(c.total_billed||0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Seguimiento</p>
            {c.next_follow_up_at?<p className="mt-0.5 flex items-center gap-1 font-medium"><CalendarClock className="h-3.5 w-3.5 text-primary"/>{formatFollowUp(c.next_follow_up_at)}</p>:<p className="mt-0.5 text-muted-foreground">Sin seguimiento</p>}
          </div>
        </div>
      </Card>)}
    </div>

    <Card className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead>Cliente</TableHead><TableHead>Email</TableHead><TableHead>Facturación</TableHead><TableHead>Categoría</TableHead><TableHead>Etapa</TableHead><TableHead>Prioridad</TableHead><TableHead>Ranking</TableHead><TableHead>Próximo seguimiento</TableHead><TableHead className="w-28"/></TableRow></TableHeader><TableBody>{clients.map(c=><TableRow key={c.id} className="hover:bg-muted/30"><TableCell><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{c.name?.[0]?.toUpperCase()}</div><span className="font-medium">{c.name}</span></div></TableCell><TableCell className="text-sm text-muted-foreground">{c.email||'-'}</TableCell><TableCell className="font-semibold">{formatMoney(c.total_billed||0)}</TableCell><TableCell><Badge className={statusColors[c.status||'new']}>{statusLabels[c.status||'new']}</Badge></TableCell><TableCell><Badge className={stageColors[c.crm_stage||'new']}>{stageLabels[c.crm_stage||'new']}</Badge></TableCell><TableCell><Badge className={priorityColors[c.priority||'normal']}>{priorityLabels[c.priority||'normal']}</Badge></TableCell><TableCell><div className="flex gap-0.5">{[1,2,3].map(i=><Star key={i} className={`h-3.5 w-3.5 ${i<=(c.ranking||0)?'fill-yellow-400 text-yellow-400':'text-muted'}`}/>)}</div></TableCell><TableCell>{c.next_follow_up_at?<div className="flex items-center gap-1.5 whitespace-nowrap text-xs"><CalendarClock className="h-3.5 w-3.5 text-primary"/><span>{formatFollowUp(c.next_follow_up_at)}</span></div>:<span className="text-xs text-muted-foreground">Sin seguimiento</span>}</TableCell><TableCell><Actions client={c} onView={onView} onEdit={onEdit} onDelete={onDelete} readOnly={readOnly}/></TableCell></TableRow>)}</TableBody></Table></div></Card>
  </>;
}

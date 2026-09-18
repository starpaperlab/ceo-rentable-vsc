import React, { useMemo, useState } from 'react';
import { emailService } from '@/services/emailService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Search, Send, Loader2, RefreshCw, Eye, MousePointerClick, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import format from 'date-fns/format';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/AuthContext';

const statusLabel = {
  pending: ['Pendiente', 'bg-slate-100 text-slate-700'],
  sent: ['Enviado', 'bg-blue-100 text-blue-700'],
  delivered: ['Entregado', 'bg-emerald-100 text-emerald-700'],
  opened: ['Abierto', 'bg-pink-100 text-pink-700'],
  clicked: ['Clic', 'bg-purple-100 text-purple-700'],
  failed: ['Falló', 'bg-red-100 text-red-700'],
  bounced: ['Rebotó', 'bg-red-100 text-red-700'],
  complained: ['Spam', 'bg-orange-100 text-orange-700'],
  suppressed: ['Suprimido', 'bg-amber-100 text-amber-700'],
};

function pct(n, d) {
  return d ? Math.round((n / d) * 100) : 0;
}

function dateTime(value) {
  if (!value) return '—';
  try { return format(new Date(value), 'dd/MM/yyyy HH:mm', { locale: es }); } catch { return '—'; }
}

export default function EmailLogs() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [resendingId, setResendingId] = useState(null);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['email-logs'],
    queryFn: () => emailService.getEmailLogs(),
    enabled: isAdmin?.() === true,
    refetchInterval: 30000,
  });

  const resendMutation = useMutation({
    mutationFn: (id) => emailService.resendEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
      toast.success('Email reenviado');
      setResendingId(null);
    },
    onError: (err) => {
      toast.error('Error: ' + (err.message || 'No se pudo reenviar'));
      setResendingId(null);
    },
  });

  const filterByDate = (log) => {
    if (dateFilter === 'all') return true;
    const logDate = new Date(log.timestamp);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const week = new Date(today); week.setDate(week.getDate() - 7);
    if (dateFilter === 'today') return logDate.toDateString() === today.toDateString();
    if (dateFilter === 'yesterday') return logDate.toDateString() === yesterday.toDateString();
    if (dateFilter === 'week') return logDate >= week;
    return true;
  };

  const filtered = logs.filter((log) => {
    const q = search.toLowerCase();
    const matchSearch = [log.email, log.name, log.subject, log.template_name, log.admin_name]
      .some((v) => (v || '').toLowerCase().includes(q));
    return matchSearch && (statusFilter === 'all' || log.status === statusFilter) && filterByDate(log);
  });

  const metrics = useMemo(() => {
    const total = filtered.length;
    const delivered = filtered.filter((x) => x.delivered_at || ['delivered','opened','clicked'].includes(x.status)).length;
    const opened = filtered.filter((x) => Number(x.open_count || 0) > 0 || ['opened','clicked'].includes(x.status)).length;
    const clicked = filtered.filter((x) => Number(x.click_count || 0) > 0 || x.status === 'clicked').length;
    return { total, delivered, opened, clicked };
  }, [filtered]);

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAdmin?.()) return <div className="p-6 max-w-2xl mx-auto"><Card className="p-6 text-center"><h2 className="text-lg font-semibold">Acceso restringido</h2><p className="text-sm text-muted-foreground mt-2">Solo cuentas administradoras pueden ver Email Marketing.</p></Card></div>;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email Marketing</h1>
        <p className="text-sm text-muted-foreground mt-1">Panel interno · entregas, aperturas, clics y seguimiento de campañas.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><Mail className="h-4 w-4 text-muted-foreground"/><p className="text-2xl font-bold mt-2">{metrics.total}</p><p className="text-xs text-muted-foreground">Enviados</p></Card>
        <Card className="p-4"><CheckCircle2 className="h-4 w-4 text-muted-foreground"/><p className="text-2xl font-bold mt-2">{metrics.delivered}</p><p className="text-xs text-muted-foreground">Entregados</p></Card>
        <Card className="p-4"><Eye className="h-4 w-4 text-muted-foreground"/><p className="text-2xl font-bold mt-2">{metrics.opened} <span className="text-sm font-medium text-muted-foreground">({pct(metrics.opened, metrics.delivered)}%)</span></p><p className="text-xs text-muted-foreground">Aperturas únicas</p></Card>
        <Card className="p-4"><MousePointerClick className="h-4 w-4 text-muted-foreground"/><p className="text-2xl font-bold mt-2">{metrics.clicked} <span className="text-sm font-medium text-muted-foreground">({pct(metrics.clicked, metrics.delivered)}%)</span></p><p className="text-xs text-muted-foreground">Clics únicos</p></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Buscar..." value={search} onChange={(e)=>setSearch(e.target.value)} className="pl-10"/></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="delivered">Entregados</SelectItem><SelectItem value="opened">Abiertos</SelectItem><SelectItem value="clicked">Con clic</SelectItem>
          <SelectItem value="bounced">Rebotados</SelectItem><SelectItem value="failed">Fallidos</SelectItem>
        </SelectContent></Select>
        <Select value={dateFilter} onValueChange={setDateFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          <SelectItem value="all">Todas las fechas</SelectItem><SelectItem value="today">Hoy</SelectItem><SelectItem value="yesterday">Ayer</SelectItem><SelectItem value="week">Última semana</SelectItem>
        </SelectContent></Select>
        <Button variant="outline" onClick={()=>refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Actualizar</Button>
      </div>

      <Card className="overflow-hidden"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-muted/50"><TableHead>Destinatario</TableHead><TableHead>Campaña / asunto</TableHead><TableHead>Estado</TableHead><TableHead>Aperturas</TableHead><TableHead>Clics</TableHead><TableHead>Enviado</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader>
        <TableBody>{filtered.length===0?<TableRow><TableCell colSpan={7} className="text-center py-12"><Mail className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2"/><p className="text-sm text-muted-foreground">No hay emails para estos filtros.</p></TableCell></TableRow>:
          filtered.map((log)=>{
            const cfg=statusLabel[log.status]||statusLabel.pending;
            return <TableRow key={log.id}>
              <TableCell><p className="text-sm font-medium">{log.email}</p><p className="text-xs text-muted-foreground">{log.name||'Sin nombre'}</p></TableCell>
              <TableCell><p className="text-sm font-medium">{log.template_name||'Campaña'}</p><p className="text-xs text-muted-foreground max-w-[280px] truncate">{log.subject}</p></TableCell>
              <TableCell><Badge className={cfg[1]}>{cfg[0]}</Badge></TableCell>
              <TableCell><p className="text-sm font-semibold">{log.open_count||0}</p><p className="text-[11px] text-muted-foreground">{dateTime(log.first_opened_at)}</p></TableCell>
              <TableCell><p className="text-sm font-semibold">{log.click_count||0}</p><p className="text-[11px] text-muted-foreground max-w-[180px] truncate" title={log.last_clicked_url||''}>{log.last_clicked_url||dateTime(log.first_clicked_at)}</p></TableCell>
              <TableCell className="text-xs text-muted-foreground">{dateTime(log.timestamp)}</TableCell>
              <TableCell><Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={()=>{setResendingId(log.id);resendMutation.mutate(log.id)}} disabled={resendingId===log.id}>{resendingId===log.id?<Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/>:<Send className="h-3.5 w-3.5 mr-1"/>}Reenviar</Button></TableCell>
            </TableRow>
          })}
        </TableBody>
      </Table></div></Card>
      <p className="text-[11px] text-muted-foreground">Nota: las aperturas son orientativas porque algunos proveedores de correo protegen o precargan imágenes. Los clics son una señal más confiable.</p>
    </div>
  );
}

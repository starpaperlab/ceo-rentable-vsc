import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Download,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  BellRing,
  CalendarClock,
  CircleDollarSign,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { buildDashboardFinancials, buildSixMonthTrend, normalizeInvoiceTotal } from '@/lib/dashboardMetrics';
import { groupPaymentsByInvoice, getInvoicePaymentSummary } from '@/lib/invoicePayments';

function dateKeyInTimeZone(value = new Date(), timeZone = 'America/Santo_Domingo') {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export default function Dashboard() {
  const { formatMoney } = useCurrency();
  const { canWrite } = useWorkspace();
  const { user, userProfile } = useAuth();
  const { activeWorkspace, enabled, fetchRows, queryKey: contextQueryKey } = useWorkContextScope();
  const userName = (userProfile?.full_name || user?.email || 'CEO').split(' ')[0];

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['dashboard-products', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'products' }),
    enabled,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['dashboard-invoices', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'invoices' }),
    enabled,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['dashboard-clients', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'clients' }),
    enabled,
  });

  const { data: invoicePayments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['dashboard-invoice-payments', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'invoice_payments', orderBy: 'payment_date', ascending: false }),
    enabled,
  });

  const { data: monthlyRecords = [], isLoading: loadingMonthlyRecords } = useQuery({
    queryKey: ['dashboard-monthly-records', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'monthly_records', orderBy: 'month', ascending: false }),
    enabled,
  });

  const { data: costLibraryItems = [], isLoading: loadingCostLibrary } = useQuery({
    queryKey: ['dashboard-cost-library', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'cost_library_items' }),
    enabled,
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ['dashboard-reminders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'reminders', orderBy: 'due_at', ascending: true }),
    enabled,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['dashboard-appointments', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'appointments', orderBy: 'date', ascending: true }),
    enabled,
  });

  const paymentsByInvoice = useMemo(
    () => groupPaymentsByInvoice(invoicePayments),
    [invoicePayments]
  );

  const financials = useMemo(
    () => buildDashboardFinancials({
      invoices,
      invoicePayments,
      monthlyRecords,
      costLibraryItems,
    }),
    [costLibraryItems, invoicePayments, invoices, monthlyRecords]
  );

  const stats = useMemo(() => ({
    facturado: financials.current.billed,
    ingresos: financials.current.collected,
    gastos: financials.current.expenses,
    beneficio: financials.current.profit,
    margen: financials.current.margin,
    invoicesCount: financials.current.invoiceCount,
    ticketPromedio: financials.current.averageTicket,
    cuentasPorCobrar: financials.receivables.totalReceivable,
    facturasPendientes: financials.receivables.openInvoices,
  }), [financials]);

  const growth = useMemo(() => ({
    revenueGrowth: financials.growth.collected,
    billedGrowth: financials.growth.billed,
    costGrowth: financials.growth.expenses,
    benefitGrowth: financials.growth.profit,
    marginGrowth: financials.growth.marginPoints,
  }), [financials]);

  const pendingInvoices = useMemo(
    () => financials.receivables.rows
      .filter((row) => row.summary.balanceDue > 0)
      .map((row) => row.invoice),
    [financials.receivables.rows]
  );

  const topProducts = useMemo(
    () => [...products]
      .filter((item) => (item.status || 'active') !== 'inactive')
      .sort((a, b) => Number(b.margin_pct || 0) - Number(a.margin_pct || 0))
      .slice(0, 5),
    [products]
  );

  const topClients = useMemo(() => {
    const map = new Map();

    invoices.forEach((invoice) => {
      const summary = getInvoicePaymentSummary(invoice, paymentsByInvoice[invoice.id] || []);
      if (summary.amountCollected <= 0) return;

      const key = invoice.client_id || invoice.client_name || invoice.id;
      const current = map.get(key) || {
        id: invoice.client_id || null,
        client: invoice.client_name || 'Cliente sin nombre',
        amount: 0,
        purchases: 0,
      };
      current.amount += summary.amountCollected;
      current.purchases += 1;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 4);
  }, [invoices, paymentsByInvoice]);

  const fugaProducts = useMemo(
    () => products.filter((product) => Number(product.margin_pct || 0) < 20).length,
    [products]
  );

  const ceoMetrics = useMemo(() => {
    const marginScore = Math.max(0, Math.min(100, Math.round((stats.margen / 50) * 100)));
    const incomeGrowthScore = Math.max(0, Math.min(100, Math.round(50 + growth.revenueGrowth)));
    const costControlScore = Math.max(0, Math.min(100, Math.round(100 - ((stats.gastos / Math.max(stats.facturado, 1)) * 100))));
    const score = Math.round((marginScore * 0.45) + (incomeGrowthScore * 0.3) + (costControlScore * 0.25));

    let status = 'Saludable';
    if (score < 41) status = 'Crítico';
    else if (score < 71) status = 'Inestable';

    return { marginScore, incomeGrowthScore, costControlScore, score, status };
  }, [stats, growth]);

  const todayChecklist = useMemo(() => {
    const todayStart = startOfDay();
    const salesToday = invoices.some((invoice) => {
      const date = new Date(invoice.date || invoice.created_at || new Date());
      return date >= todayStart;
    });

    const items = [
      { label: 'Tienes productos registrados', done: products.length > 0 },
      { label: 'Registraste una venta hoy', done: salesToday },
      { label: 'Sin facturas pendientes', done: pendingInvoices.length === 0 },
      { label: 'Sin alertas pendientes', done: fugaProducts === 0 },
    ];

    return {
      items,
      doneCount: items.filter((item) => item.done).length,
      totalCount: items.length,
    };
  }, [products, invoices, pendingInvoices, fugaProducts]);

  const dailySummary = useMemo(() => {
    const now = new Date();
    const start = startOfDay(now);
    const end = endOfDay(now);

    const dueFollowUps = clients
      .filter((client) => client.next_follow_up_at)
      .filter((client) => {
        const date = new Date(client.next_follow_up_at);
        return date <= end;
      })
      .sort((a, b) => new Date(a.next_follow_up_at) - new Date(b.next_follow_up_at));

    const pendingReminders = reminders
      .filter((item) => item.status === 'pending')
      .filter((item) => {
        const date = new Date(item.due_at);
        return date <= end;
      })
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

    const todayKey = dateKeyInTimeZone(now, activeWorkspace?.timezone || 'America/Santo_Domingo');
    const todayAppointments = appointments
      .filter((item) => item.date === todayKey && item.status !== 'cancelado')
      .sort((a, b) => `${a.time || '99:99'}`.localeCompare(`${b.time || '99:99'}`));

    const overdueInvoices = financials.receivables.rows
      .filter((row) => row.overdue)
      .map((row) => row.invoice);

    const actionItems = [
      ...pendingReminders.map((item) => ({
        id: `reminder-${item.id}`,
        icon: BellRing,
        title: item.title || 'Recordatorio pendiente',
        detail: item.notes || 'Requiere atención',
        tone: new Date(item.due_at) < start ? 'critical' : 'warning',
        to: item.client_id ? `${createPageUrl('Clients')}?client=${encodeURIComponent(item.client_id)}` : createPageUrl('Clients'),
      })),
      ...dueFollowUps.map((client) => ({
        id: `followup-${client.id}`,
        icon: Users,
        title: client.name || 'Cliente',
        detail: client.next_follow_up_note || 'Seguimiento comercial',
        tone: new Date(client.next_follow_up_at) < start ? 'critical' : 'warning',
        to: `${createPageUrl('Clients')}?client=${encodeURIComponent(client.id)}`,
      })),
      ...todayAppointments.map((item) => ({
        id: `appointment-${item.id}`,
        icon: CalendarClock,
        title: item.client_name || item.service_type || 'Actividad',
        detail: item.time ? `${item.service_type || 'Actividad'} · ${item.time}` : (item.service_type || 'Actividad de hoy'),
        tone: 'info',
        to: createPageUrl('Agenda'),
      })),
      ...overdueInvoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        icon: CircleDollarSign,
        title: invoice.client_name || invoice.invoice_number || 'Factura vencida',
        detail: `${invoice.invoice_number || 'Factura'} · ${formatMoney(normalizeInvoiceTotal(invoice))}`,
        tone: 'critical',
        to: createPageUrl('Billing'),
      })),
    ].slice(0, 8);

    return {
      followUps: dueFollowUps.length,
      reminders: pendingReminders.length,
      appointments: todayAppointments.length,
      overdueInvoices: overdueInvoices.length,
      actionItems,
    };
  }, [activeWorkspace?.timezone, appointments, clients, financials.receivables.rows, formatMoney, reminders]);

  const chartData = useMemo(
    () => buildSixMonthTrend({ invoices, invoicePayments, monthlyRecords }),
    [invoicePayments, invoices, monthlyRecords]
  );

  const topClient = topClients[0];
  const bestProduct = topProducts[0];
  const breakEven = financials.breakEven;
  const isLoading = loadingProducts || loadingInvoices || loadingPayments || loadingMonthlyRecords || loadingCostLibrary;

  const downloadDashboardReport = () => {
    const rows = [
      ['Metrica', 'Valor'],
      ['Periodo', financials.current.monthKey],
      ['Facturado', stats.facturado.toFixed(2)],
      ['Ingresos cobrados', stats.ingresos.toFixed(2)],
      ['Gastos', stats.gastos.toFixed(2)],
      ['Fuente de gastos', financials.current.expenseSource === 'registered' ? 'Registrados' : 'Estimados con costos directos'],
      ['Beneficio', stats.beneficio.toFixed(2)],
      ['Margen', `${stats.margen.toFixed(1)}%`],
      ['Cuentas por cobrar', stats.cuentasPorCobrar.toFixed(2)],
      ['Ticket promedio', stats.ticketPromedio.toFixed(2)],
      ['Punto de equilibrio', breakEven == null ? 'Sin datos suficientes' : breakEven.toFixed(2)],
      ['CEO Score', ceoMetrics.score],
      ['Facturas del periodo', stats.invoicesCount],
      ['Facturas pendientes', stats.facturasPendientes],
      ['Productos en fuga', fugaProducts],
    ];

    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dashboard_ceo_rentable_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[440px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[1180px] mx-auto space-y-3 sm:space-y-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3 flex-wrap">
        <div>
          <p className="text-[11px] sm:text-xs text-muted-foreground">Buenas tardes, {userName} 👋</p>
          <h1 className="text-[26px] sm:text-[34px] leading-[1.04] font-extrabold tracking-tight text-foreground">Visión 360°</h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
{canWrite ? (
          <Button
            variant="outline"
            className="h-8 w-8 px-0 text-xs gap-1.5 sm:h-9 sm:w-auto sm:px-3"
            onClick={downloadDashboardReport}
            title="Descargar reporte"
            aria-label="Descargar reporte"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Descargar Reporte</span>
          </Button>
          ) : null}
          <span className={`px-2 h-7 sm:px-2.5 sm:h-8 inline-flex items-center rounded-full text-[11px] sm:text-xs font-semibold border ${
            ceoMetrics.status === 'Saludable'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : ceoMetrics.status === 'Inestable'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {ceoMetrics.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
        <KpiCard
          label="FACTURADO"
          value={formatMoney(stats.facturado)}
          subtitle={`${stats.invoicesCount} factura${stats.invoicesCount === 1 ? '' : 's'} este mes`}
          growth={growth.billedGrowth}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="COBRADO"
          value={formatMoney(stats.ingresos)}
          subtitle="Efectivo cobrado este mes"
          growth={growth.revenueGrowth}
          icon={<CircleDollarSign className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="GASTOS"
          value={formatMoney(stats.gastos)}
          subtitle={financials.current.expenseSource === 'registered' ? 'Gastos registrados' : 'Estimado con costos directos'}
          growth={growth.costGrowth}
          inverseGrowth
          icon={<ArrowDownRight className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="BENEFICIO"
          value={formatMoney(stats.beneficio)}
          subtitle="Facturado − gastos"
          growth={growth.benefitGrowth}
          positive={stats.beneficio >= 0}
          icon={<Target className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="MARGEN"
          value={`${stats.margen.toFixed(1)}%`}
          subtitle="Margen del mes"
          growth={growth.marginGrowth}
          growthSuffix=" pts"
          icon={<ArrowUpRight className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="CUENTAS POR COBRAR"
          value={formatMoney(stats.cuentasPorCobrar)}
          subtitle={`${stats.facturasPendientes} factura${stats.facturasPendientes === 1 ? '' : 's'} abierta${stats.facturasPendientes === 1 ? '' : 's'}`}
          growth={0}
          showGrowth={false}
          icon={<CircleDollarSign className="h-4 w-4 text-primary" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-3">
        <div className="rounded-xl sm:rounded-2xl border border-[#F0D074] bg-gradient-to-br from-[#FFF6D9] via-[#FFF4CC] to-[#FFF2C2] p-3 sm:p-5 space-y-2.5 sm:space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.14em] text-[#8D6A14]">CEO SCORE™</p>
              <p className="text-[11px] sm:text-xs text-[#7A6B4E]">Salud Financiera Global</p>
            </div>
            <span className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 sm:py-1 rounded-full border border-[#F2CB6B] text-[#B57400] bg-[#FFF9E6]">
              {ceoMetrics.status}
            </span>
          </div>

          <div className="flex items-end gap-2">
            <span className="text-4xl sm:text-5xl leading-none font-black text-[#D97A1D]">{ceoMetrics.score}</span>
            <span className="text-[11px] sm:text-xs text-[#6B6251] pb-1 sm:pb-1.5">de 100 pts</span>
          </div>

          <div className="h-2 sm:h-2.5 rounded-full bg-white/70 overflow-hidden">
            <div className="h-full bg-[#F39A2D]" style={{ width: `${ceoMetrics.score}%` }} />
          </div>
          <div className="text-[9px] sm:text-[10px] text-[#7A6B4E] grid grid-cols-3">
            <span>0 · Crítico</span>
            <span className="text-center">41 · Inestable</span>
            <span className="text-right">71 · Saludable</span>
          </div>

          <MetricBar label="Margen de Ganancia" value={ceoMetrics.marginScore} tone="warning" />
          <MetricBar label="Crecimiento de Ingresos" value={ceoMetrics.incomeGrowthScore} tone="success" />
          <MetricBar label="Control de Gastos" value={ceoMetrics.costControlScore} tone="warning" />
        </div>

        <Card className="p-3 sm:p-5">
          <div className="flex items-start justify-between">
            <h3 className="text-base sm:text-[24px] leading-tight font-bold tracking-tight text-foreground">Diagnóstico Estratégico</h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 sm:py-1 rounded-full bg-muted text-muted-foreground">
              {fugaProducts > 0 ? '1 insight' : '0 insights'}
            </span>
          </div>
          <div className="mt-2 sm:mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
            <div className="flex gap-2 sm:gap-3">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-700">
                  {fugaProducts} producto(s) en Zona de Fuga
                </p>
                <p className="text-xs text-amber-700/90">
                  Margen menor al 20% — están drenando rentabilidad.
                </p>
                <p className="text-xs text-amber-700/80 mt-1.5">
                  Optimiza costos o considera ajustar precio en los productos críticos.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
        <Card className="p-3 sm:p-4">
          <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">PUNTO DE EQUILIBRIO</p>
          <p className="text-lg sm:text-[32px] leading-none font-extrabold mt-1.5 sm:mt-2 text-foreground">
            {breakEven == null ? 'Sin datos' : formatMoney(breakEven)}
          </p>
          <div className="mt-2 sm:mt-3 h-1.5 rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: breakEven && stats.facturado > 0 ? `${Math.min(100, (stats.facturado / breakEven) * 100)}%` : '0%' }}
            />
          </div>
          <p className={`mt-1.5 sm:mt-2 text-[11px] sm:text-xs font-semibold ${breakEven && stats.facturado >= breakEven ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {breakEven == null
              ? 'Completa gastos/costos para estimarlo'
              : financials.breakEvenSource === 'configured-fixed-costs'
                ? (stats.facturado >= breakEven ? '✓ Superaste el equilibrio' : 'Basado en costos fijos configurados')
                : (stats.facturado >= breakEven ? '✓ Superaste el equilibrio estimado' : 'Estimado con gastos registrados')}
          </p>
        </Card>

        <Card className="p-3 sm:p-4">
          <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">MEJOR PRODUCTO</p>
          <p className="text-base sm:text-[24px] leading-tight font-bold mt-1.5 sm:mt-2 text-foreground truncate">{bestProduct?.name || 'Sin datos'}</p>
          <p className="text-[11px] sm:text-xs font-semibold text-primary mt-1.5 sm:mt-2">{Number(bestProduct?.margin_pct || 0).toFixed(1)}% margen</p>
        </Card>

        <Card className="p-3 sm:p-4">
          <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">MEJOR CLIENTE</p>
          <p className="text-base sm:text-[24px] leading-tight font-bold mt-1.5 sm:mt-2 text-foreground truncate">{topClient?.client || 'Sin datos'}</p>
          <p className="text-[11px] sm:text-xs font-semibold text-primary mt-1.5 sm:mt-2">{formatMoney(topClient?.amount || 0)}</p>
        </Card>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-base sm:text-lg font-bold text-foreground">Resumen diario</p>
            <p className="text-xs text-muted-foreground mt-0.5">Lo que requiere tu atención hoy.</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {dailySummary.actionItems.length} pendiente{dailySummary.actionItems.length===1?'':'s'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link to={createPageUrl('Clients')} className="rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Seguimientos</p>
            <p className="mt-1 text-xl font-bold">{dailySummary.followUps}</p>
          </Link>
          <Link to={createPageUrl('Clients')} className="rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recordatorios</p>
            <p className="mt-1 text-xl font-bold">{dailySummary.reminders}</p>
          </Link>
          <Link to={createPageUrl('Agenda')} className="rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Agenda hoy</p>
            <p className="mt-1 text-xl font-bold">{dailySummary.appointments}</p>
          </Link>
          <Link to={createPageUrl('Billing')} className="rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Facturas vencidas</p>
            <p className={`mt-1 text-xl font-bold ${dailySummary.overdueInvoices>0?'text-red-600':''}`}>{dailySummary.overdueInvoices}</p>
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {dailySummary.actionItems.length===0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No tienes pendientes urgentes para hoy.</div>
          ) : dailySummary.actionItems.map((item)=>{
            const Icon=item.icon;
            return <Link key={item.id} to={item.to || createPageUrl('Dashboard')} className="flex items-start gap-3 rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone==='critical'?'bg-red-100 text-red-700':item.tone==='warning'?'bg-amber-100 text-amber-700':'bg-primary/10 text-primary'}`}><Icon className="h-4 w-4"/></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>;
          })}
        </div>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-base sm:text-lg font-bold text-foreground">Hoy en tu negocio</p>
          <span className="text-xs font-semibold text-muted-foreground">
            {todayChecklist.doneCount} de {todayChecklist.totalCount} tareas
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-primary/15 mt-2 sm:mt-3">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(todayChecklist.doneCount / todayChecklist.totalCount) * 100}%` }}
          />
        </div>
        <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
          {todayChecklist.items.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <CheckCircle2 className={`h-4 w-4 ${item.done ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              <span className={item.done ? 'line-through text-muted-foreground' : 'text-foreground'}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-3">
        <Card className="p-3 sm:p-4">
          <h3 className="text-sm sm:text-base font-bold text-foreground">Ingresos vs Gastos · últimos 6 meses</h3>
          <p className="mb-2 sm:mb-3 text-[11px] text-muted-foreground">Cobros reales y gastos registrados. Los meses sin gastos no se estiman.</p>
          <div className="h-[210px] sm:h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 12, left: 2, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" />
                <XAxis dataKey="periodo" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [formatMoney(value), '']}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="cobrado" name="Cobrado" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5, fill: 'hsl(var(--primary))' }} />
                <Line type="monotone" dataKey="gastos" name="Gastos" connectNulls={false} stroke="hsl(var(--accent))" strokeWidth={3} dot={{ r: 3, fill: 'hsl(var(--accent))' }} activeDot={{ r: 5, fill: 'hsl(var(--accent))' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-3 h-0.5 bg-primary" />Cobrado</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-3 h-0.5 bg-accent" />Gastos</span>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3">
          <Card className="p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-bold text-foreground mb-2 sm:mb-3">Top Productos</h3>
            <div className="space-y-1.5 sm:space-y-2">
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin productos suficientes para ranking.</p>
              ) : (
                topProducts.map((product, index) => (
                  <div key={product.id || `${product.name}-${index}`} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground w-3">{index + 1}</span>
                      <span className="truncate font-medium">{product.name || 'Producto'}</span>
                    </div>
                    <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-emerald-100 text-emerald-700">
                      {Number(product.margin_pct || 0).toFixed(0)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-bold text-foreground mb-2 sm:mb-3">Top Clientes</h3>
            <div className="space-y-1.5 sm:space-y-2">
              {topClients.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay clientes con compras pagadas.</p>
              ) : (
                topClients.map((client) => (
                  <div key={client.client} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {(client.client || 'C').trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium truncate">{client.client}</span>
                    </div>
                    <span className="text-xs font-bold text-primary">{formatMoney(client.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  growth,
  icon,
  positive = true,
  inverseGrowth = false,
  showGrowth = true,
  growthSuffix = '%',
}) {
  const isUp = growth >= 0;
  const favorable = inverseGrowth ? !isUp : isUp;

  return (
    <Card className="p-2.5 sm:p-4 border border-border/60 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[9px] sm:text-[10px] tracking-[0.08em] sm:tracking-[0.14em] font-extrabold text-muted-foreground">{label}</p>
        <span className="hidden min-[390px]:inline-flex sm:inline-flex">{icon}</span>
      </div>
      <p className={`mt-1 text-base sm:text-[30px] leading-tight sm:leading-none font-extrabold truncate ${positive ? 'text-foreground' : 'text-red-600'}`}>{value}</p>
      <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs leading-tight text-muted-foreground">{subtitle}</p>
      {showGrowth ? (
        <p className={`mt-0.5 sm:mt-1 text-[10px] sm:text-xs font-bold ${favorable ? 'text-emerald-600' : 'text-red-600'}`}>
          {isUp ? '↗' : '↘'} {Math.abs(growth || 0).toFixed(growthSuffix === ' pts' ? 1 : 0)}{growthSuffix}
        </p>
      ) : null}
    </Card>
  );
}

function MetricBar({ label, value, tone }) {
  const color = tone === 'success' ? '#0E9F6E' : '#F39A2D';

  return (
    <div>
      <div className="flex items-center justify-between text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] sm:tracking-[0.12em] text-[#725A2D]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-white/70">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

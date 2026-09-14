import React, { useMemo, useState } from 'react';
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
import { buildCeoScore, buildDashboardFinancials, buildDashboardOperations, buildSixMonthTrend, buildTopProducts, normalizeInvoiceTotal } from '@/lib/dashboardMetrics';
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
  const { currency, formatMoney } = useCurrency();
  const { canWrite } = useWorkspace();
  const { user, userProfile } = useAuth();
  const { activeWorkspace, enabled, fetchRows, queryKey: contextQueryKey } = useWorkContextScope();
  const userName = (userProfile?.full_name || user?.email || 'CEO').split(' ')[0];
  const [topProductCriterion, setTopProductCriterion] = useState('sales');

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

  const { data: quotes = [] } = useQuery({
    queryKey: ['dashboard-quotes', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'quotes', orderBy: 'date', ascending: false }),
    enabled,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['dashboard-orders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'orders', orderBy: 'created_at', ascending: false }),
    enabled,
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['dashboard-order-items', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'order_items', orderBy: 'created_at', ascending: false }),
    enabled,
  });

  const { data: orderStatuses = [] } = useQuery({
    queryKey: ['dashboard-order-statuses', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'order_statuses', orderBy: 'sort_order', ascending: true }),
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
    () => buildTopProducts({
      products,
      invoices,
      orderItems,
      criterion: topProductCriterion,
    }),
    [invoices, orderItems, products, topProductCriterion]
  );

  const operations = useMemo(
    () => buildDashboardOperations({ quotes, orders, orderStatuses }),
    [orderStatuses, orders, quotes]
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

  const overdueOperationalItems = useMemo(() => {
    const today = startOfDay();
    const overdueReminders = reminders.filter(
      (item) => item.status === 'pending' && item.due_at && new Date(item.due_at) < today
    ).length;
    const overdueFollowUps = clients.filter(
      (client) => client.next_follow_up_at && new Date(client.next_follow_up_at) < today
    ).length;
    return overdueReminders + overdueFollowUps;
  }, [clients, reminders]);

  const ceoMetrics = useMemo(
    () => buildCeoScore({
      financials,
      products,
      overdueOperationalItems,
    }),
    [financials, overdueOperationalItems, products]
  );

  const todayChecklist = useMemo(() => {
    const todayStart = startOfDay();
    const salesToday = invoices.some((invoice) => {
      const date = new Date(invoice.date || invoice.created_at || new Date());
      return date >= todayStart;
    });

    const items = [
      { label: 'Tienes productos registrados', done: products.length > 0 },
      { label: 'Registraste una venta hoy', done: salesToday },
      { label: 'Sin facturas vencidas', done: financials.receivables.overdueInvoices === 0 },
      { label: 'Sin productos en fuga', done: fugaProducts === 0 },
      { label: 'Sin cotizaciones pendientes', done: operations.pendingQuotesCount === 0 },
      { label: 'Sin entregas próximas pendientes', done: operations.upcomingOrdersCount === 0 },
    ];

    return {
      items,
      doneCount: items.filter((item) => item.done).length,
      totalCount: items.length,
    };
  }, [financials.receivables.overdueInvoices, fugaProducts, invoices, operations.pendingQuotesCount, operations.upcomingOrdersCount, products]);

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
        detail: `${invoice.invoice_number || 'Factura'} · ${formatMoney(getInvoicePaymentSummary(invoice, paymentsByInvoice[invoice.id] || []).balanceDue)} pendiente`,
        tone: 'critical',
        to: createPageUrl('Receivables'),
      })),
      ...operations.pendingQuotes.slice(0, 2).map((quote) => ({
        id: `quote-${quote.id}`,
        icon: Target,
        title: quote.client_name || quote.quote_number || 'Cotización pendiente',
        detail: `${quote.quote_number || 'Cotización'} · ${formatMoney(normalizeInvoiceTotal(quote))}`,
        tone: 'warning',
        to: createPageUrl('Billing'),
      })),
      ...operations.upcomingOrders.slice(0, 2).map(({ order, targetDate }) => ({
        id: `order-${order.id}`,
        icon: CalendarClock,
        title: order.client_name || order.order_number || 'Entrega próxima',
        detail: `${order.order_number || 'Pedido'} · ${targetDate.toLocaleDateString('es-DO')}`,
        tone: 'info',
        to: createPageUrl('Orders'),
      })),
    ].slice(0, 10);

    return {
      followUps: dueFollowUps.length,
      reminders: pendingReminders.length,
      appointments: todayAppointments.length,
      overdueInvoices: overdueInvoices.length,
      pendingQuotes: operations.pendingQuotesCount,
      upcomingOrders: operations.upcomingOrdersCount,
      actionItems,
    };
  }, [activeWorkspace?.timezone, appointments, clients, financials.receivables.rows, formatMoney, operations, paymentsByInvoice, reminders]);

  const chartData = useMemo(
    () => buildSixMonthTrend({ invoices, invoicePayments, monthlyRecords }),
    [invoicePayments, invoices, monthlyRecords]
  );

  const topClient = topClients[0];
  const bestProduct = topProducts[0];
  const breakEven = financials.breakEven;
  const isLoading = loadingProducts || loadingInvoices || loadingPayments || loadingMonthlyRecords || loadingCostLibrary;

  const downloadTrendCsv = () => {
    const rows = [
      ['Periodo', 'Facturado', 'Cobrado', 'Gastos', 'Moneda'],
      ...chartData.map((row) => [
        row.monthKey,
        Number(row.facturado || 0).toFixed(2),
        Number(row.cobrado || 0).toFixed(2),
        row.gastos == null ? '' : Number(row.gastos).toFixed(2),
        currency,
      ]),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dashboard_tendencia_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const downloadDashboardReport = () => {
    const rows = [
      ['Metrica', 'Valor'],
      ['Periodo', financials.current.monthKey],
      ['Facturado', stats.facturado.toFixed(2)],
      ['Ingresos cobrados', stats.ingresos.toFixed(2)],
      ['Moneda', currency],
      ['Gastos', stats.gastos == null ? 'Sin datos' : stats.gastos.toFixed(2)],
      ['Fuente de gastos', financials.current.expenseSource === 'registered' ? 'Registrados' : financials.current.expenseSource === 'estimated-direct-costs' ? 'Estimados con costos directos' : 'Sin datos'],
      ['Beneficio', stats.beneficio == null ? 'Sin datos' : stats.beneficio.toFixed(2)],
      ['Margen', stats.margen == null ? 'Sin datos' : `${stats.margen.toFixed(1)}%`],
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
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900'
              : ceoMetrics.status === 'Inestable'
                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900'
                : ceoMetrics.status === 'Crítico'
                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900'
                  : 'bg-muted text-muted-foreground border-border'
          }`}>
            {ceoMetrics.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
        <KpiCard
          label="FACTURADO"
          to={createPageUrl('Billing')}
          value={formatMoney(stats.facturado)}
          subtitle={`${stats.invoicesCount} factura${stats.invoicesCount === 1 ? '' : 's'} este mes`}
          growth={growth.billedGrowth}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="COBRADO"
          to={createPageUrl('Receivables')}
          value={formatMoney(stats.ingresos)}
          subtitle="Efectivo cobrado este mes"
          growth={growth.revenueGrowth}
          icon={<CircleDollarSign className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="GASTOS"
          to={createPageUrl('MonthlyControl')}
          value={stats.gastos == null ? 'Sin datos' : formatMoney(stats.gastos)}
          subtitle={financials.current.expenseSource === 'registered' ? 'Gastos registrados' : financials.current.expenseSource === 'estimated-direct-costs' ? 'Estimado con costos directos' : 'Completa Control Mensual'}
          growth={growth.costGrowth}
          inverseGrowth
          showGrowth={growth.costGrowth != null}
          icon={<ArrowDownRight className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="BENEFICIO"
          to={createPageUrl('Profitability')}
          value={stats.beneficio == null ? 'Sin datos' : formatMoney(stats.beneficio)}
          subtitle={stats.beneficio == null ? 'Faltan gastos/costos' : 'Facturado − gastos'}
          growth={growth.benefitGrowth}
          showGrowth={growth.benefitGrowth != null}
          positive={stats.beneficio == null || stats.beneficio >= 0}
          icon={<Target className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="MARGEN"
          to={createPageUrl('Profitability')}
          value={stats.margen == null ? 'Sin datos' : `${stats.margen.toFixed(1)}%`}
          subtitle={stats.margen == null ? 'Faltan gastos/costos' : 'Margen del mes'}
          growth={growth.marginGrowth}
          showGrowth={growth.marginGrowth != null}
          growthSuffix=" pts"
          icon={<ArrowUpRight className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="CUENTAS POR COBRAR"
          to={createPageUrl('Receivables')}
          value={formatMoney(stats.cuentasPorCobrar)}
          subtitle={`${stats.facturasPendientes} factura${stats.facturasPendientes === 1 ? '' : 's'} abierta${stats.facturasPendientes === 1 ? '' : 's'}`}
          growth={0}
          showGrowth={false}
          icon={<CircleDollarSign className="h-4 w-4 text-primary" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-3">
        <Card className="p-3 sm:p-5 border-border/70 bg-card">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.14em] text-primary">CEO SCORE™</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground">Salud global del negocio</p>
            </div>
            <span className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 sm:py-1 rounded-full border ${
              ceoMetrics.status === 'Saludable'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900'
                : ceoMetrics.status === 'Inestable'
                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900'
                  : ceoMetrics.status === 'Crítico'
                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900'
                    : 'bg-muted text-muted-foreground border-border'
            }`}>
              {ceoMetrics.status}
            </span>
          </div>

          {ceoMetrics.hasSufficientData ? (
            <>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl sm:text-5xl leading-none font-black text-foreground">{ceoMetrics.score}</span>
                <span className="text-[11px] sm:text-xs text-muted-foreground pb-1 sm:pb-1.5">de 100 pts</span>
              </div>

              <div className="mt-3 h-2 sm:h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${ceoMetrics.score}%` }} />
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{ceoMetrics.explanation}</p>

              <div className="mt-4 grid gap-2">
                {ceoMetrics.factors.map((factor) => (
                  <MetricBar key={factor.key} label={factor.label} value={factor.score} />
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border p-4">
              <p className="text-sm font-semibold text-foreground">Tu CEO Score todavía no se puede calcular.</p>
              <p className="mt-1 text-xs text-muted-foreground">{ceoMetrics.explanation}</p>
            </div>
          )}
        </Card>

        <Card className="p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-[24px] leading-tight font-bold tracking-tight text-foreground">Diagnóstico Estratégico</h3>
              <p className="mt-1 text-xs text-muted-foreground">Qué está impulsando o frenando tu negocio ahora.</p>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 sm:py-1 rounded-full bg-muted text-muted-foreground">
              {ceoMetrics.hasSufficientData ? `${ceoMetrics.riskFactors.length} riesgo${ceoMetrics.riskFactors.length === 1 ? '' : 's'}` : 'Pendiente'}
            </span>
          </div>

          {!ceoMetrics.hasSufficientData ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Registra actividad financiera para generar un diagnóstico basado en datos reales.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {ceoMetrics.riskFactors.length > 0 ? (
                ceoMetrics.riskFactors.map((factor) => {
                  const factorRoutes = {
                    margin: createPageUrl('Profitability'),
                    growth: createPageUrl('Billing'),
                    expenses: createPageUrl('MonthlyControl'),
                    collections: createPageUrl('Receivables'),
                    products: createPageUrl('Products'),
                    operations: createPageUrl('Agenda'),
                  };
                  return (
                    <Link
                      key={factor.key}
                      to={factorRoutes[factor.key] || createPageUrl('Dashboard')}
                      className="block rounded-xl border border-amber-200 bg-amber-50 p-3 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-amber-900/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/35"
                    >
                      <div className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{factor.label}: {factor.score}/100</p>
                          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">Este factor está reduciendo tu CEO Score. Toca para revisarlo.</p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/20 dark:text-emerald-300">
                  No hay factores críticos en este momento.
                </div>
              )}

              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Acciones recomendadas</p>
                <div className="mt-2 space-y-1.5">
                  {ceoMetrics.actions.map((action) => (
                    <p key={action} className="text-xs text-foreground">• {action}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
        <Link to={createPageUrl('Profitability')} className="block focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-xl">
          <Card className="p-3 sm:p-4 h-full transition hover:bg-muted/30 hover:border-primary/30">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">PUNTO DE EQUILIBRIO</p>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
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
        </Link>

        <Link to={createPageUrl('Products')} className="block focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-xl">
          <Card className="p-3 sm:p-4 h-full transition hover:bg-muted/30 hover:border-primary/30">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">MEJOR PRODUCTO</p>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-base sm:text-[24px] leading-tight font-bold mt-1.5 sm:mt-2 text-foreground truncate">{bestProduct?.name || 'Sin datos'}</p>
          <p className="text-[11px] sm:text-xs font-semibold text-primary mt-1.5 sm:mt-2">{bestProduct ? formatMoney(bestProduct.revenue) : 'Sin ventas'}</p>
          </Card>
        </Link>

        <Link
          to={topClient?.id ? `${createPageUrl('Clients')}?client=${encodeURIComponent(topClient.id)}` : createPageUrl('Clients')}
          className="block focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-xl"
        >
          <Card className="p-3 sm:p-4 h-full transition hover:bg-muted/30 hover:border-primary/30">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">MEJOR CLIENTE</p>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-base sm:text-[24px] leading-tight font-bold mt-1.5 sm:mt-2 text-foreground truncate">{topClient?.client || 'Sin datos'}</p>
          <p className="text-[11px] sm:text-xs font-semibold text-primary mt-1.5 sm:mt-2">{formatMoney(topClient?.amount || 0)}</p>
          </Card>
        </Link>
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

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
          <Link to={createPageUrl('Receivables')} className="rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Facturas vencidas</p>
            <p className={`mt-1 text-xl font-bold ${dailySummary.overdueInvoices>0?'text-red-600':''}`}>{dailySummary.overdueInvoices}</p>
          </Link>
          <Link to={createPageUrl('Billing')} className="rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cotizaciones</p>
            <p className={`mt-1 text-xl font-bold ${dailySummary.pendingQuotes>0?'text-amber-600':''}`}>{dailySummary.pendingQuotes}</p>
          </Link>
          <Link to={createPageUrl('Orders')} className="rounded-xl border border-border/60 p-3 transition hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Entregas próximas</p>
            <p className="mt-1 text-xl font-bold">{dailySummary.upcomingOrders}</p>
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Ingresos vs Gastos · últimos 6 meses</h3>
              <p className="mb-2 sm:mb-3 text-[11px] text-muted-foreground">Cobros reales y gastos registrados. Los meses sin gastos no se estiman.</p>
            </div>
            {canWrite ? (
              <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={downloadTrendCsv}>
                <Download className="mr-1 h-3.5 w-3.5" /> CSV
              </Button>
            ) : null}
          </div>
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
            <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
              <h3 className="text-sm sm:text-base font-bold text-foreground">Top Productos</h3>
              <select
                value={topProductCriterion}
                onChange={(event) => setTopProductCriterion(event.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground"
                aria-label="Criterio de Top Productos"
              >
                <option value="sales">Ventas</option>
                <option value="profit">Beneficio</option>
                <option value="margin">Margen</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay ventas suficientes para generar el ranking.</p>
              ) : (
                topProducts.map((product, index) => (
                  <Link
                    key={product.id || `${product.name}-${index}`}
                    to={createPageUrl('Products')}
                    className="flex items-center justify-between gap-3 rounded-lg p-1.5 text-xs transition hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground w-3">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{product.name || 'Producto'}</p>
                        <p className="text-[10px] text-muted-foreground">{product.quantity.toFixed(0)} unidad(es)</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-primary">
                      {topProductCriterion === 'profit'
                        ? (product.profit == null ? 'Sin costo histórico' : formatMoney(product.profit))
                        : topProductCriterion === 'margin'
                          ? (product.margin == null ? 'Sin costo histórico' : `${product.margin.toFixed(1)}%`)
                          : formatMoney(product.revenue)}
                    </span>
                  </Link>
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
                  <Link
                    key={client.id || client.client}
                    to={client.id ? `${createPageUrl('Clients')}?client=${encodeURIComponent(client.id)}` : createPageUrl('Clients')}
                    className="flex items-center justify-between gap-3 rounded-lg p-1.5 transition hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {(client.client || 'C').trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{client.client}</p>
                        <p className="text-[10px] text-muted-foreground">{client.purchases} compra(s)</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary">{formatMoney(client.amount)}</span>
                  </Link>
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
  to = null,
}) {
  const isUp = growth >= 0;
  const favorable = inverseGrowth ? !isUp : isUp;

  const content = (
    <Card className={`p-2.5 sm:p-4 border border-border/60 shadow-[0_10px_28px_rgba(15,23,42,0.05)] h-full ${to ? 'transition hover:bg-muted/30 hover:border-primary/30' : ''}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-[9px] sm:text-[10px] tracking-[0.08em] sm:tracking-[0.14em] font-extrabold text-muted-foreground">{label}</p>
        <span className="hidden min-[390px]:inline-flex sm:inline-flex">{to ? <ArrowUpRight className="h-4 w-4 text-muted-foreground" /> : icon}</span>
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

  if (!to) return content;

  return (
    <Link
      to={to}
      className="block min-w-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40"
      aria-label={`Abrir detalle de ${label}`}
    >
      {content}
    </Link>
  );
}

function MetricBar({ label, value }) {
  const semanticClass = value >= 70
    ? 'bg-emerald-500'
    : value >= 41
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div>
      <div className="flex items-center justify-between text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] sm:tracking-[0.12em] text-muted-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-muted">
        <div className={`h-full rounded-full ${semanticClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

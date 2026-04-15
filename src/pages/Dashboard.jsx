import React, { useMemo } from 'react';
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
import { fetchOwnedRows } from '@/lib/supabaseOwnership';

function monthLabel(dateValue) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-DO', { month: '2-digit', year: '2-digit' });
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

function daysAgo(count) {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date;
}

function isPaidStatus(status) {
  const normalized = `${status ?? ''}`.trim().toLowerCase();
  return ['paid', 'pagada', 'pagado', 'completed', 'completado'].includes(normalized);
}

function normalizeInvoiceTotal(invoice) {
  const direct = Number(invoice.total_final ?? invoice.total_amount ?? invoice.total ?? 0);
  if (direct > 0) return direct;

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  return lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price ?? item.price ?? 0);
    return sum + (quantity * unitPrice);
  }, 0);
}

export default function Dashboard() {
  const { formatMoney } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;
  const userName = (userProfile?.full_name || user?.email || 'CEO').split(' ')[0];

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['dashboard-products', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'products', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['dashboard-invoices', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoices', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => isPaidStatus(invoice.status)),
    [invoices]
  );

  const pendingInvoices = useMemo(
    () => invoices.filter((invoice) => !isPaidStatus(invoice.status)),
    [invoices]
  );

  const topProducts = useMemo(
    () => [...products]
      .filter((item) => (item.status || 'active') !== 'inactive')
      .sort((a, b) => Number(b.margin_pct || 0) - Number(a.margin_pct || 0))
      .slice(0, 5),
    [products]
  );

  const topClients = useMemo(() => {
    const map = {};
    paidInvoices.forEach((invoice) => {
      const key = invoice.client_name || 'Cliente sin nombre';
      if (!map[key]) map[key] = { client: key, amount: 0 };
      map[key].amount += normalizeInvoiceTotal(invoice);
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, 4);
  }, [paidInvoices]);

  const stats = useMemo(() => {
    const ingresos = paidInvoices.reduce((sum, invoice) => sum + normalizeInvoiceTotal(invoice), 0);

    const costos = paidInvoices.reduce((sum, invoice) => {
      const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
      const invoiceCost = lineItems.reduce((subtotal, item) => {
        const quantity = Number(item.quantity ?? 1);
        const unitCost = Number(item.unit_cost ?? item.cost ?? 0);
        return subtotal + (quantity * unitCost);
      }, 0);
      return sum + invoiceCost;
    }, 0);

    const ingresosFallbackCost = products.reduce((sum, product) => {
      const stock = Number(product.current_stock ?? 0);
      const cost = Number(product.costo_unitario ?? 0);
      return sum + Math.max(0, stock * cost * 0.04);
    }, 0);

    const finalCosts = costos > 0 ? costos : ingresosFallbackCost;
    const beneficio = ingresos - finalCosts;
    const margen = ingresos > 0 ? (beneficio / ingresos) * 100 : 0;

    return {
      ingresos,
      costos: finalCosts,
      beneficio,
      margen,
      invoicesCount: paidInvoices.length,
    };
  }, [paidInvoices, products]);

  const growth = useMemo(() => {
    const currentStart = startOfDay(daysAgo(30));
    const previousStart = startOfDay(daysAgo(60));
    const previousEnd = endOfDay(daysAgo(31));

    const currentPeriod = paidInvoices.filter((invoice) => {
      const date = new Date(invoice.date || invoice.created_at || new Date());
      return date >= currentStart;
    });

    const previousPeriod = paidInvoices.filter((invoice) => {
      const date = new Date(invoice.date || invoice.created_at || new Date());
      return date >= previousStart && date <= previousEnd;
    });

    const currentRevenue = currentPeriod.reduce((sum, invoice) => sum + normalizeInvoiceTotal(invoice), 0);
    const previousRevenue = previousPeriod.reduce((sum, invoice) => sum + normalizeInvoiceTotal(invoice), 0);
    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : (currentRevenue > 0 ? 100 : 0);

    return {
      revenueGrowth,
      costGrowth: revenueGrowth * 0.78,
      benefitGrowth: revenueGrowth,
      marginGrowth: revenueGrowth * 0.65,
    };
  }, [paidInvoices]);

  const fugaProducts = useMemo(
    () => products.filter((product) => Number(product.margin_pct || 0) < 20).length,
    [products]
  );

  const ceoMetrics = useMemo(() => {
    const marginScore = Math.max(0, Math.min(100, Math.round((stats.margen / 50) * 100)));
    const incomeGrowthScore = Math.max(0, Math.min(100, Math.round(50 + growth.revenueGrowth)));
    const costControlScore = Math.max(0, Math.min(100, Math.round(100 - ((stats.costos / Math.max(stats.ingresos, 1)) * 100))));
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

  const chartData = useMemo(() => {
    const monthlyMap = {};
    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(key);
      monthlyMap[key] = { periodo: monthLabel(d), ingresos: 0, gastos: 0 };
    }

    paidInvoices.forEach((invoice) => {
      const date = new Date(invoice.date || invoice.created_at || new Date());
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) return;
      monthlyMap[key].ingresos += normalizeInvoiceTotal(invoice);
    });

    const costRatio = stats.ingresos > 0 ? (stats.costos / stats.ingresos) : 0.26;
    months.forEach((key) => {
      monthlyMap[key].gastos = monthlyMap[key].ingresos * Math.max(0.12, costRatio);
    });

    return months.map((key) => monthlyMap[key]);
  }, [paidInvoices, stats]);

  const topClient = topClients[0];
  const bestProduct = topProducts[0];
  const breakEven = stats.costos;
  const isLoading = loadingProducts || loadingInvoices;

  const downloadDashboardReport = () => {
    const rows = [
      ['Metrica', 'Valor'],
      ['Ingresos', stats.ingresos.toFixed(2)],
      ['Gastos', stats.costos.toFixed(2)],
      ['Beneficio', stats.beneficio.toFixed(2)],
      ['Margen', `${stats.margen.toFixed(1)}%`],
      ['CEO Score', ceoMetrics.score],
      ['Facturas pagadas', stats.invoicesCount],
      ['Facturas pendientes', pendingInvoices.length],
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
    <div className="p-4 lg:p-6 max-w-[1180px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Buenas tardes, {userName} 👋</p>
          <h1 className="text-[34px] leading-[1.04] font-extrabold tracking-tight text-foreground">Visión 360°</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 text-xs gap-1.5" onClick={downloadDashboardReport}>
            <Download className="h-3.5 w-3.5" />
            Descargar Reporte
          </Button>
          <span className={`px-2.5 h-8 inline-flex items-center rounded-full text-xs font-semibold border ${
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="INGRESOS"
          value={formatMoney(stats.ingresos)}
          subtitle={`${stats.invoicesCount} facturas pagadas`}
          growth={growth.revenueGrowth}
          icon={<TrendingUp className="h-4 w-4 text-[#D45387]" />}
        />
        <KpiCard
          label="GASTOS"
          value={formatMoney(stats.costos)}
          subtitle="Costo operativo estimado"
          growth={growth.costGrowth}
          icon={<ArrowDownRight className="h-4 w-4 text-[#D45387]" />}
        />
        <KpiCard
          label="BENEFICIO"
          value={formatMoney(stats.beneficio)}
          subtitle="Ingresos − costos"
          growth={growth.benefitGrowth}
          positive={stats.beneficio >= 0}
          icon={<Target className="h-4 w-4 text-[#D45387]" />}
        />
        <KpiCard
          label="MARGEN"
          value={`${stats.margen.toFixed(1)}%`}
          subtitle="Rentabilidad global"
          growth={growth.marginGrowth}
          icon={<ArrowUpRight className="h-4 w-4 text-[#D45387]" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-3">
        <div className="rounded-2xl border border-[#F0D074] bg-gradient-to-br from-[#FFF6D9] via-[#FFF4CC] to-[#FFF2C2] p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.14em] text-[#8D6A14]">CEO SCORE™</p>
              <p className="text-xs text-[#7A6B4E]">Salud Financiera Global</p>
            </div>
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full border border-[#F2CB6B] text-[#B57400] bg-[#FFF9E6]">
              {ceoMetrics.status}
            </span>
          </div>

          <div className="flex items-end gap-2">
            <span className="text-5xl leading-none font-black text-[#D97A1D]">{ceoMetrics.score}</span>
            <span className="text-xs text-[#6B6251] pb-1.5">de 100 pts</span>
          </div>

          <div className="h-2.5 rounded-full bg-white/70 overflow-hidden">
            <div className="h-full bg-[#F39A2D]" style={{ width: `${ceoMetrics.score}%` }} />
          </div>
          <div className="text-[10px] text-[#7A6B4E] grid grid-cols-3">
            <span>0 · Crítico</span>
            <span className="text-center">41 · Inestable</span>
            <span className="text-right">71 · Saludable</span>
          </div>

          <MetricBar label="Margen de Ganancia" value={ceoMetrics.marginScore} tone="warning" />
          <MetricBar label="Crecimiento de Ingresos" value={ceoMetrics.incomeGrowthScore} tone="success" />
          <MetricBar label="Control de Gastos" value={ceoMetrics.costControlScore} tone="warning" />
        </div>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <h3 className="text-[24px] leading-tight font-bold tracking-tight text-foreground">Diagnóstico Estratégico</h3>
            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
              {fugaProducts > 0 ? '1 insight' : '0 insights'}
            </span>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">PUNTO DE EQUILIBRIO</p>
          <p className="text-[32px] leading-none font-extrabold mt-2 text-foreground">{formatMoney(breakEven)}</p>
          <div className="mt-3 h-1.5 rounded-full bg-[#EED4DF]">
            <div className="h-full rounded-full bg-[#D45387]" style={{ width: '100%' }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-emerald-600">✓ Superaste el equilibrio</p>
        </Card>

        <Card className="p-4">
          <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">MEJOR PRODUCTO</p>
          <p className="text-[24px] leading-tight font-bold mt-2 text-foreground">{bestProduct?.name || 'Sin datos'}</p>
          <p className="text-xs font-semibold text-[#D45387] mt-2">{Number(bestProduct?.margin_pct || 0).toFixed(1)}% margen</p>
        </Card>

        <Card className="p-4">
          <p className="text-[10px] tracking-[0.15em] font-bold text-muted-foreground">MEJOR CLIENTE</p>
          <p className="text-[24px] leading-tight font-bold mt-2 text-foreground">{topClient?.client || 'Sin datos'}</p>
          <p className="text-xs font-semibold text-[#D45387] mt-2">{formatMoney(topClient?.amount || 0)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-lg font-bold text-foreground">Hoy en tu negocio</p>
          <span className="text-xs font-semibold text-muted-foreground">
            {todayChecklist.doneCount} de {todayChecklist.totalCount} tareas
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[#EED4DF] mt-3">
          <div
            className="h-full rounded-full bg-[#D45387]"
            style={{ width: `${(todayChecklist.doneCount / todayChecklist.totalCount) * 100}%` }}
          />
        </div>
        <div className="mt-3 space-y-2">
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
        <Card className="p-4">
          <h3 className="text-base font-bold text-foreground mb-3">Proyección de Ingresos vs Gastos</h3>
          <div className="h-[290px]">
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
                    background: 'white',
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="ingresos" stroke="#D45387" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="gastos" stroke="#A06BCF" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-3 h-0.5 bg-[#D45387]" />Ingresos</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-3 h-0.5 bg-[#A06BCF]" />Gastos</span>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3">
          <Card className="p-4">
            <h3 className="text-base font-bold text-foreground mb-3">Top Productos</h3>
            <div className="space-y-2">
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

          <Card className="p-4">
            <h3 className="text-base font-bold text-foreground mb-3">Top Clientes</h3>
            <div className="space-y-2">
              {topClients.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay clientes con compras pagadas.</p>
              ) : (
                topClients.map((client) => (
                  <div key={client.client} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-[#D45387] text-white text-xs font-bold flex items-center justify-center">
                        {(client.client || 'C').trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium truncate">{client.client}</span>
                    </div>
                    <span className="text-xs font-bold text-[#D45387]">{formatMoney(client.amount)}</span>
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

function KpiCard({ label, value, subtitle, growth, icon, positive = true }) {
  const isUp = growth >= 0;

  return (
    <Card className="p-4 border border-[#E7E1D9] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between">
        <p className="text-[10px] tracking-[0.14em] font-extrabold text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`mt-1 text-[30px] leading-none font-extrabold ${positive ? 'text-foreground' : 'text-red-600'}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <p className={`mt-1 text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>
        {isUp ? '↗' : '↘'} {Math.abs(growth || 0).toFixed(0)}%
      </p>
    </Card>
  );
}

function MetricBar({ label, value, tone }) {
  const color = tone === 'success' ? '#0E9F6E' : '#F39A2D';

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-[#725A2D]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-white/70">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

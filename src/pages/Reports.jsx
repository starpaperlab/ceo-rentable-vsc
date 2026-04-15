import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Package, TrendingUp, ShoppingCart, Users, AlertTriangle,
  Download, Loader2, Filter, CheckCircle2
} from 'lucide-react';
import PageTour from '@/components/shared/PageTour';

const REPORTS_TOUR_STEPS = [
  { title: 'Centro de Reportes 📊', description: 'Análisis completo de tu negocio basado en facturas pagadas. Aquí tienes datos reales para tomar decisiones.' },
  { title: 'Filtra por fechas 📅', description: 'Selecciona un rango de fechas para analizar un período específico: un mes, un trimestre, un año.' },
  { title: 'Exporta en CSV 📥', description: 'Cada reporte se puede exportar en CSV para importar en Excel o Google Sheets y hacer análisis adicionales.' },
];
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { fetchOwnedRows } from '@/lib/supabaseOwnership';

const TABS = [
  { id: 'inventory', label: 'Inventario', icon: Package },
  { id: 'profitability', label: 'Rentabilidad', icon: TrendingUp },
  { id: 'sales', label: 'Ventas', icon: ShoppingCart },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'alerts', label: 'Alertas', icon: AlertTriangle },
];

function isPaidStatus(status) {
  const normalized = `${status ?? ''}`.trim().toLowerCase();
  return ['paid', 'pagada', 'pagado', 'completed', 'completado'].includes(normalized);
}

function StatusBadge({ level }) {
  const cfg = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30',
    yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  }[level] || 'bg-muted text-muted-foreground';
  const label = { green: 'Normal', yellow: 'Atención', red: 'Crítico' }[level] || '—';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg}`}>{label}</span>;
}

function downloadCSV(rows, filename) {
  if (!rows.length) { toast.error('Sin datos para exportar'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  toast.success('CSV descargado');
}

export default function Reports() {
  const queryClient = useQueryClient();
  const { formatMoney, currency } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;
  const [activeTab, setActiveTab] = useState('inventory');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: products = [], isLoading: loadingProd } = useQuery({
    queryKey: ['products', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'products', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: invoices = [], isLoading: loadingInv } = useQuery({
    queryKey: ['invoices', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoices', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: inventoryItems = [], isLoading: loadingInventory } = useQuery({
    queryKey: ['inventory-items', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'inventory_items', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const isLoading = loadingProd || loadingInv || loadingInventory;

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => isPaidStatus(invoice.status)),
    [invoices]
  );
  const pendingInvoices = useMemo(
    () => invoices
      .filter((invoice) => !isPaidStatus(invoice.status))
      .sort((a, b) => `${b.due_date || b.date || b.created_at || ''}`.localeCompare(`${a.due_date || a.date || a.created_at || ''}`)),
    [invoices]
  );

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('id', invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Factura marcada como pagada');
    },
    onError: (error) => {
      toast.error(`No se pudo marcar como pagada: ${error.message}`);
    },
  });

  // Filter paid invoices by date range
  const filteredInvoices = useMemo(() => paidInvoices.filter((inv) => {
    const invoiceDate = inv.date || `${inv.created_at || ''}`.slice(0, 10);
    if (dateFrom && invoiceDate < dateFrom) return false;
    if (dateTo && invoiceDate > dateTo) return false;
    return true;
  }), [paidInvoices, dateFrom, dateTo]);

  // ── Inventory report ──
  const inventorySource = useMemo(() => {
    if (inventoryItems.length > 0) {
      return inventoryItems;
    }
    return products.filter((product) => !product.product_type || product.product_type === 'fisico');
  }, [inventoryItems, products]);

  const inventoryRows = useMemo(() => inventorySource.map(item => {
    const stockActual = Number(item.current_stock || 0);
    const stockMinimo = Number(item.min_stock_alert || 0);
    const costoUnitario = Number(item.costo_unitario || 0);
    const hasMinControl = stockMinimo > 0;
    const isLowStock = hasMinControl && stockActual <= stockMinimo;

    return {
      producto: item.product_name || item.name || 'Producto',
      sku: item.sku || '—',
      stock_actual: stockActual,
      stock_minimo: stockMinimo,
      valor_inventario: stockActual * costoUnitario,
      estado: hasMinControl ? (isLowStock ? 'Bajo Stock' : 'Normal') : 'Sin mínimo',
      _level: hasMinControl ? (isLowStock ? 'red' : 'green') : 'yellow',
    };
  }), [inventorySource]);

  // ── Profitability per product ──
  const profitRows = useMemo(() => {
    const map = {};
    filteredInvoices.forEach(inv => {
      (inv.line_items || []).forEach(li => {
        const name = li.description || 'Sin nombre';
        if (!map[name]) map[name] = { producto: name, ingresos: 0, costos: 0, ganancia: 0, ventas: 0 };
        const qty = parseFloat(li.quantity) || 1;
        const price = parseFloat(li.unit_price) || 0;
        map[name].ingresos += price * qty;
        map[name].ventas += qty;
        // Try to match inventory cost
        const invMatch = inventoryItems.find(i => i.product_name?.toLowerCase() === name.toLowerCase());
        map[name].costos += (invMatch?.costo_unitario || 0) * qty;
      });
    });
    return Object.values(map).map(r => {
      r.ganancia = r.ingresos - r.costos;
      r.margen_pct = r.ingresos > 0 ? ((r.ganancia / r.ingresos) * 100).toFixed(1) : '0.0';
      r._level = parseFloat(r.margen_pct) >= 30 ? 'green' : parseFloat(r.margen_pct) >= 15 ? 'yellow' : 'red';
      return r;
    });
  }, [filteredInvoices, inventoryItems]);

  // ── Sales report ──
  const salesRows = useMemo(() => {
    const byMonth = {};
    filteredInvoices.forEach(inv => {
      const month = (inv.date || '').slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { periodo: month, ventas: 0, cantidad: 0 };
      byMonth[month].ventas += inv.total_final || 0;
      byMonth[month].cantidad += (inv.line_items || []).reduce((s, li) => s + (parseFloat(li.quantity) || 1), 0);
    });
    return Object.values(byMonth).sort((a, b) => b.periodo.localeCompare(a.periodo)).map(r => ({
      ...r,
      ticket_promedio: r.cantidad > 0 ? (r.ventas / r.cantidad).toFixed(2) : '0.00',
    }));
  }, [filteredInvoices]);

  // ── Clients report ──
  const clientRows = useMemo(() => {
    const map = {};
    filteredInvoices.forEach(inv => {
      const name = inv.client_name || 'Sin nombre';
      if (!map[name]) map[name] = { cliente: name, total_comprado: 0, num_compras: 0 };
      map[name].total_comprado += inv.total_final || 0;
      map[name].num_compras += 1;
    });
    return Object.values(map).sort((a, b) => b.total_comprado - a.total_comprado);
  }, [filteredInvoices]);

  // ── Alerts ──
  const alertRows = useMemo(() => {
    const rows = [];
    products.filter(p => p.status === 'active').forEach(p => {
      if ((p.margin_pct || 0) < 15) rows.push({ tipo: 'Margen Crítico', producto: p.name, detalle: `Margen: ${(p.margin_pct || 0).toFixed(1)}%`, _level: 'red' });
      else if ((p.margin_pct || 0) < 30) rows.push({ tipo: 'Margen Bajo', producto: p.name, detalle: `Margen: ${(p.margin_pct || 0).toFixed(1)}%`, _level: 'yellow' });
    });
    return rows;
  }, [products]);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageTour pageName="Reports" userEmail={ownerEmail} steps={REPORTS_TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Centro de Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">Análisis completo del negocio — solo facturas pagadas</p>
      </motion.div>

      {/* Date filter */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Filter className="h-4 w-4 text-muted-foreground mb-2" />
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 h-8 text-sm w-40" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 h-8 text-sm w-40" />
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDateFrom(''); setDateTo(''); }}>Limpiar</Button>
          <span className="text-xs text-muted-foreground ml-auto">{filteredInvoices.length} facturas pagadas • {currency}</span>
        </div>
      </Card>

      {pendingInvoices.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50/50">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground">Facturas pendientes por cobrar</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Marca como pagadas para actualizar Ventas, Rentabilidad y Clientes.
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              {pendingInvoices.length} pendientes
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {pendingInvoices.slice(0, 6).map((invoice) => {
              const invoiceLabel = invoice.invoice_number || `FAC-${String(invoice.id || '').slice(0, 6)}`;
              const invoiceDate = invoice.date || `${invoice.created_at || ''}`.slice(0, 10) || '—';
              const isMarking = markPaidMutation.isPending && markPaidMutation.variables === invoice.id;

              return (
                <div key={invoice.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-card border border-border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {invoiceLabel} • {invoice.client_name || 'Cliente sin nombre'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {invoiceDate} • {formatMoney(invoice.total_final || 0)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => markPaidMutation.mutate(invoice.id)}
                    disabled={isMarking}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    {isMarking ? 'Guardando...' : 'Marcar pagada'}
                  </Button>
                </div>
              );
            })}
          </div>

          {pendingInvoices.length > 6 && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Mostrando 6 de {pendingInvoices.length} facturas pendientes.
            </p>
          )}
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Inventory */}
      {activeTab === 'inventory' && (
        <ReportSection
          title="Reporte de Inventario"
          count={inventoryRows.length}
          onExport={() => downloadCSV(inventoryRows.map(r => ({ Producto: r.producto, SKU: r.sku, 'Stock Actual': r.stock_actual, 'Stock Mínimo': r.stock_minimo, 'Valor Inventario': r.valor_inventario, Estado: r.estado })), 'inventario')}
        >
          <Table headers={['Producto', 'SKU', 'Stock Actual', 'Stock Mín.', 'Valor Inventario', 'Estado']}>
            {inventoryRows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="py-2.5 px-3 text-sm font-medium">{r.producto}</td>
                <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono">{r.sku}</td>
                <td className="py-2.5 px-3 text-sm">{r.stock_actual}</td>
                <td className="py-2.5 px-3 text-sm">{r.stock_minimo}</td>
                <td className="py-2.5 px-3 text-sm font-semibold">{formatMoney(r.valor_inventario)}</td>
                <td className="py-2.5 px-3"><StatusBadge level={r._level} /></td>
              </tr>
            ))}
          </Table>
        </ReportSection>
      )}

      {/* Profitability */}
      {activeTab === 'profitability' && (
        <ReportSection
          title="Rentabilidad por Producto"
          count={profitRows.length}
          onExport={() => downloadCSV(profitRows.map(r => ({ Producto: r.producto, Ingresos: r.ingresos, Costos: r.costos, Ganancia: r.ganancia, 'Margen %': r.margen_pct, Estado: r._level === 'green' ? 'Rentable' : r._level === 'yellow' ? 'Atención' : 'Riesgo' })), 'rentabilidad')}
        >
          <Table headers={['Producto', 'Ingresos', 'Costos', 'Ganancia', 'Margen %', 'Estado']}>
            {profitRows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="py-2.5 px-3 text-sm font-medium">{r.producto}</td>
                <td className="py-2.5 px-3 text-sm">{formatMoney(r.ingresos)}</td>
                <td className="py-2.5 px-3 text-sm text-muted-foreground">{formatMoney(r.costos)}</td>
                <td className="py-2.5 px-3 text-sm font-semibold">{formatMoney(r.ganancia)}</td>
                <td className={`py-2.5 px-3 text-sm font-bold ${parseFloat(r.margen_pct) >= 30 ? 'text-green-600' : parseFloat(r.margen_pct) >= 15 ? 'text-amber-500' : 'text-red-600'}`}>{r.margen_pct}%</td>
                <td className="py-2.5 px-3"><StatusBadge level={r._level} /></td>
              </tr>
            ))}
          </Table>
        </ReportSection>
      )}

      {/* Sales */}
      {activeTab === 'sales' && (
        <ReportSection
          title="Reporte de Ventas"
          count={salesRows.length}
          onExport={() => downloadCSV(salesRows.map(r => ({ Período: r.periodo, 'Total Ventas': r.ventas, 'Unidades Vendidas': r.cantidad, 'Ticket Promedio': r.ticket_promedio })), 'ventas')}
        >
          <Table headers={['Período', 'Total Ventas', 'Unidades Vendidas', 'Ticket Promedio']}>
            {salesRows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="py-2.5 px-3 text-sm font-medium">{r.periodo}</td>
                <td className="py-2.5 px-3 text-sm font-bold text-primary">{formatMoney(r.ventas)}</td>
                <td className="py-2.5 px-3 text-sm">{r.cantidad}</td>
                <td className="py-2.5 px-3 text-sm">{formatMoney(parseFloat(r.ticket_promedio))}</td>
              </tr>
            ))}
          </Table>
        </ReportSection>
      )}

      {/* Clients */}
      {activeTab === 'clients' && (
        <ReportSection
          title="Reporte de Clientes"
          count={clientRows.length}
          onExport={() => downloadCSV(clientRows.map((r, i) => ({ Pos: i + 1, Cliente: r.cliente, 'Total Comprado': r.total_comprado, 'Nº Compras': r.num_compras })), 'clientes')}
        >
          <Table headers={['#', 'Cliente', 'Total Comprado', 'Nº Compras']}>
            {clientRows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="py-2.5 px-3 text-xs text-muted-foreground">#{i + 1}</td>
                <td className="py-2.5 px-3 text-sm font-medium">{r.cliente}</td>
                <td className="py-2.5 px-3 text-sm font-bold text-primary">{formatMoney(r.total_comprado)}</td>
                <td className="py-2.5 px-3 text-sm">{r.num_compras}</td>
              </tr>
            ))}
          </Table>
        </ReportSection>
      )}

      {/* Alerts */}
      {activeTab === 'alerts' && (
        <ReportSection
          title="Reporte de Alertas"
          count={alertRows.length}
          onExport={() => downloadCSV(alertRows.map(r => ({ Tipo: r.tipo, Producto: r.producto, Detalle: r.detalle })), 'alertas')}
        >
          {alertRows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-green-600 font-semibold">✓ Sin alertas activas</p>
              <p className="text-xs text-muted-foreground mt-1">Todos los productos están en estado saludable</p>
            </div>
          ) : (
            <Table headers={['Tipo', 'Producto', 'Detalle']}>
              {alertRows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3"><StatusBadge level={r._level} /></td>
                  <td className="py-2.5 px-3 text-sm font-medium">{r.producto}</td>
                  <td className="py-2.5 px-3 text-sm text-muted-foreground">{r.detalle}</td>
                </tr>
              ))}
            </Table>
          )}
        </ReportSection>
      )}
    </div>
  );
}

function ReportSection({ title, count, onExport, children }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{count} registros</p>
        </div>
        <Button variant="outline" size="sm" onClick={onExport} className="gap-2">
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

function Table({ headers, children }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="bg-muted/40">
          {headers.map(h => (
            <th key={h} className="py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { ORDER_STATUS } from '@/lib/orders';
import { getInvoicePaymentSummary, getPaymentStatusMeta } from '@/lib/invoicePayments';
import { AlertCircle, CalendarClock, FileText, Pencil, Receipt, Truck, Trash2 } from 'lucide-react';

const COLOR_CLASS = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  brand: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function statusMeta(order, statusByCode = {}) {
  const configured = statusByCode[order.operational_status];
  const fallback = ORDER_STATUS[order.operational_status] || ORDER_STATUS.draft;
  return {
    label: configured?.name || fallback.label,
    badgeClass: COLOR_CLASS[configured?.color] || fallback.badgeClass,
  };
}

function getOrderProfitability(order, items = []) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
  const cost = items.reduce((sum, item) => sum + Number(item.unit_cost_snapshot || 0) * Number(item.quantity || 0), 0);
  const fees = items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const pct = Number(item.percentage_fees_snapshot || 0);
    const fixed = Number(item.fixed_fees_snapshot || 0);
    return sum + (((unitPrice * pct) / 100) + fixed) * quantity;
  }, 0);
  const discount = Number(order?.discount_amount || 0);
  const netRevenue = Math.max(0, subtotal - discount);
  const profit = netRevenue - cost - fees;
  const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
  return { subtotal, netRevenue, cost, fees, discount, profit, margin };
}

function formatHistoryDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function OrderList({
  orders = [],
  orderItemsById = {},
  invoiceByOrderId = {},
  paymentsByInvoiceId = {},
  quoteById = {},
  opportunityById = {},
  statusByCode = {},
  statusHistoryByOrderId = {},
  onEdit,
  onDelete,
  onGenerateInvoice,
  generatingInvoiceId = null,
  readOnly = false,
}) {
  const { formatMoney } = useCurrency();

  if (orders.length === 0) {
    return (
      <Card className="py-16 text-center">
        <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">No hay pedidos todavía</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Crea tu primer pedido o convierte una cotización aprobada.</p>
      </Card>
    );
  }

  const renderOrderDetails = (order) => {
    const status = statusMeta(order, statusByCode);
    const relatedInvoice = invoiceByOrderId[order.id] || null;
    const relatedQuote = order.quote_id ? quoteById[order.quote_id] || null : null;
    const relatedOpportunity = order.opportunity_id ? opportunityById[order.opportunity_id] || null : null;
    const hasInvoice = Boolean(order.generated_invoice_id || relatedInvoice);
    const paymentSummary = relatedInvoice
      ? getInvoicePaymentSummary(relatedInvoice, paymentsByInvoiceId[relatedInvoice.id] || [])
      : null;
    const paymentMeta = paymentSummary ? getPaymentStatusMeta(paymentSummary.paymentStatus) : null;
    const history = statusHistoryByOrderId[order.id] || [];
    const latestHistory = history[0] || null;
    const deliveryDate = order.commitment_date || order.estimated_delivery_date || order.event_date || '';
    const hasImportantNotes = Boolean(order.important_notes || order.internal_notes || order.client_instructions);
    const orderItems = orderItemsById[order.id] || [];
    const itemCount = orderItems.length;
    const profitability = getOrderProfitability(order, orderItems);

    return {
      status,
      relatedInvoice,
      relatedQuote,
      relatedOpportunity,
      hasInvoice,
      paymentSummary,
      paymentMeta,
      history,
      latestHistory,
      deliveryDate,
      hasImportantNotes,
      itemCount,
      profitability,
    };
  };

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {orders.map((order) => {
          const view = renderOrderDetails(order);
          return (
            <Card key={order.id} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-semibold">{order.order_number}</p>
                    {view.hasImportantNotes ? <AlertCircle className="h-3.5 w-3.5 text-amber-600" /> : null}
                  </div>
                  <p className="truncate text-sm font-medium">{order.client_name || '-'}</p>
                  {view.relatedQuote ? <p className="text-[11px] text-muted-foreground">Desde {view.relatedQuote.quote_number}</p> : null}
                  {view.relatedOpportunity ? <p className="text-[11px] text-muted-foreground">Oportunidad: {view.relatedOpportunity.title}</p> : null}
                </div>
                <Badge className={`${view.status.badgeClass} border-0 text-xs`}>{view.status.label}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                  <p className="font-bold text-primary">{formatMoney(order.total_final || 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Rentabilidad</p>
                  <p className={view.profitability.profit < 0 ? 'font-semibold text-red-600' : 'font-semibold'}>{formatMoney(view.profitability.profit)} · {view.profitability.margin.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Entrega</p>
                  <p>{view.deliveryDate || 'Sin fecha'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Factura</p>
                  <p>{view.relatedInvoice?.invoice_number || 'Sin generar'}</p>
                </div>
              </div>

              {view.paymentSummary ? (
                <div className="rounded-lg bg-muted/35 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>Abonado {formatMoney(view.paymentSummary.amountCollected)}</span>
                    <span>Saldo {formatMoney(view.paymentSummary.balanceDue)}</span>
                  </div>
                  <Badge className={`${view.paymentMeta.badgeClass} mt-2 border-0 text-[10px]`}>{view.paymentMeta.label}</Badge>
                </div>
              ) : null}

              {view.latestHistory ? (
                <p className="text-[11px] text-muted-foreground">
                  Último cambio: {statusByCode[view.latestHistory.to_status]?.name || view.latestHistory.to_status}
                  {view.latestHistory.changed_at ? ` · ${formatHistoryDate(view.latestHistory.changed_at)}` : ''}
                </p>
              ) : null}

              {!readOnly ? (
                <div className="grid grid-cols-3 gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => onEdit(order)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                  <Button variant="outline" size="sm" onClick={() => onGenerateInvoice(order)} disabled={view.hasInvoice || generatingInvoiceId === order.id}>
                    <Receipt className="mr-1 h-3.5 w-3.5" />Facturar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDelete(order)} disabled={view.hasInvoice}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Eliminar
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Pedido</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="hidden text-xs lg:table-cell">Fecha</TableHead>
                <TableHead className="hidden text-xs xl:table-cell">Entrega</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                {!readOnly ? <TableHead className="w-36" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const view = renderOrderDetails(order);
                return (
                  <TableRow key={order.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-semibold">{order.order_number}</p>
                        {view.hasImportantNotes ? <AlertCircle className="h-3.5 w-3.5 text-amber-600" /> : null}
                      </div>
                      {view.relatedQuote ? <p className="text-[11px] text-muted-foreground">Desde {view.relatedQuote.quote_number}</p> : null}
                      {view.relatedOpportunity ? <p className="text-[11px] text-muted-foreground">Oportunidad: {view.relatedOpportunity.title}</p> : null}
                      {view.relatedInvoice ? <p className="text-[11px] text-primary">Factura {view.relatedInvoice.invoice_number}</p> : null}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">{order.client_name || '-'}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{order.date || '-'}</TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="space-y-1 text-sm">
                        <p className="flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-muted-foreground" />{order.delivery_method || 'Sin método'}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{view.deliveryDate || 'Sin fecha'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-bold text-primary">{formatMoney(order.total_final || 0)}</p>
                      {view.itemCount > 0 ? <p className={`mt-0.5 text-[11px] ${view.profitability.profit < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Ganancia {formatMoney(view.profitability.profit)} · margen {view.profitability.margin.toFixed(1)}%</p> : null}
                      {view.paymentSummary ? (
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                          <p>Abonado {formatMoney(view.paymentSummary.amountCollected)}</p>
                          <p>Saldo {formatMoney(view.paymentSummary.balanceDue)}</p>
                          <Badge className={`${view.paymentMeta.badgeClass} border-0 text-[10px]`}>{view.paymentMeta.label}</Badge>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${view.status.badgeClass} border-0 text-xs`}>{view.status.label}</Badge>
                      {view.latestHistory ? (
                        <p className="mt-1 max-w-[160px] text-[10px] text-muted-foreground">
                          {formatHistoryDate(view.latestHistory.changed_at)}
                        </p>
                      ) : null}
                    </TableCell>
                    {!readOnly ? (
                      <TableCell>
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(order)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:text-primary"
                            onClick={() => onGenerateInvoice(order)}
                            disabled={view.hasInvoice || generatingInvoiceId === order.id}
                            title={view.hasInvoice ? 'Factura ya generada' : 'Generar factura'}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onDelete(order)}
                            disabled={view.hasInvoice}
                            title={view.hasInvoice ? 'No se puede eliminar un pedido facturado' : 'Eliminar'}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { ORDER_STATUS } from '@/lib/orders';
import { getInvoicePaymentSummary, getPaymentStatusMeta } from '@/lib/invoicePayments';
import { AlertCircle, CalendarClock, FileText, Pencil, Receipt, Truck, Trash2 } from 'lucide-react';

export default function OrderList({
  orders = [],
  orderItemsById = {},
  invoiceByOrderId = {},
  paymentsByInvoiceId = {},
  onEdit,
  onDelete,
  onGenerateInvoice,
  generatingInvoiceId = null,
}) {
  const { formatMoney } = useCurrency();

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">Pedido</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Fecha</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Entrega</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Trabajo</TableHead>
              <TableHead className="text-xs">Total</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="w-36"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No hay pedidos todavia</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Crea tu primer pedido y luego genera su factura.</p>
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const status = ORDER_STATUS[order.operational_status] || ORDER_STATUS.draft;
                const itemCount = orderItemsById[order.id]?.length || 0;
                const relatedInvoice = invoiceByOrderId[order.id] || null;
                const hasInvoice = Boolean(order.generated_invoice_id || relatedInvoice);
                const paymentSummary = relatedInvoice
                  ? getInvoicePaymentSummary(relatedInvoice, paymentsByInvoiceId[relatedInvoice.id] || [])
                  : null;
                const paymentMeta = paymentSummary ? getPaymentStatusMeta(paymentSummary.paymentStatus) : null;
                const deliveryDate = order.commitment_date || order.estimated_delivery_date || order.event_date || '';
                const hasImportantNotes = Boolean(order.important_notes || order.internal_notes || order.client_instructions);

                return (
                  <TableRow key={order.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-semibold">{order.order_number}</p>
                        {hasImportantNotes ? (
                          <span title="Tiene notas importantes" className="text-amber-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                      {hasInvoice ? (
                        <p className="text-[11px] text-muted-foreground">Factura generada</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm max-w-[140px] truncate">{order.client_name || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{order.date || '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="space-y-1 text-sm">
                        <p className="flex items-center gap-1 text-foreground">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          {order.delivery_method || 'Sin metodo'}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {deliveryDate || 'Sin fecha'}
                        </p>
                        {order.tracking_number ? (
                          <p className="text-[11px] text-muted-foreground">Guia {order.tracking_number}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{itemCount} item{itemCount === 1 ? '' : 's'}</p>
                        {order.theme ? <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">Tema: {order.theme}</p> : null}
                        {order.custom_name ? <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">Nombre: {order.custom_name}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-bold text-primary">{formatMoney(order.total_final || 0)}</p>
                      {relatedInvoice ? (
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                          <p>Factura {relatedInvoice.invoice_number}: {formatMoney(paymentSummary.total)}</p>
                          <p>Abonado {formatMoney(paymentSummary.amountCollected)} · Saldo {formatMoney(paymentSummary.balanceDue)}</p>
                          <Badge className={`${paymentMeta.badgeClass} border-0 text-[10px]`}>{paymentMeta.label}</Badge>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">Este pedido aún no tiene factura generada.</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${status.badgeClass} border-0 text-xs`}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(order)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary"
                          onClick={() => onGenerateInvoice(order)}
                          disabled={hasInvoice || generatingInvoiceId === order.id}
                          title={hasInvoice ? 'Factura ya generada' : 'Generar factura'}
                        >
                          <Receipt className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(order.id)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

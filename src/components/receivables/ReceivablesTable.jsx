import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { CalendarClock, Eye, PlusCircle, Receipt } from 'lucide-react';

function formatPaymentDate(payment) {
  return payment?.payment_date || payment?.created_at?.slice?.(0, 10) || '-';
}

function AgingBadge({ row }) {
  const overdue = Number(row.overdueDays || 0);
  const label = row.agingMeta?.label || 'Al día';
  if (row.summary.balanceDue <= 0) {
    return <Badge className="border-0 bg-green-100 text-green-700 text-xs">Pagada</Badge>;
  }
  return (
    <div className="space-y-1">
      <Badge
        variant="outline"
        className={overdue > 0 ? 'border-red-200 bg-red-50 text-red-700 text-xs' : 'text-xs'}
      >
        {label}
      </Badge>
      <p className={`text-[10px] ${overdue > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
        {overdue > 0 ? `${overdue} día${overdue === 1 ? '' : 's'} vencida` : row.invoice.due_date ? 'No vencida' : 'Sin fecha límite'}
      </p>
    </div>
  );
}

export default function ReceivablesTable({
  rows = [],
  clientBalances = [],
  onViewInvoice,
  onRegisterPayment,
  onScheduleCollection,
}) {
  const { formatMoney } = useCurrency();

  const renderActions = (row) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewInvoice(row)} title="Ver factura">
        <Eye className="h-3.5 w-3.5" />
      </Button>
      {row.summary.balanceDue > 0 ? (
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={() => onRegisterPayment(row)} title="Registrar abono">
            <PlusCircle className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700" onClick={() => onScheduleCollection?.(row)} title="Programar seguimiento de cobro">
            <CalendarClock className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <div className="grid gap-3 md:hidden">
          {rows.length === 0 ? (
            <Card className="py-12 text-center">
              <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No hay facturas para estos filtros</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Ajusta los filtros o registra una factura pendiente.</p>
            </Card>
          ) : rows.map((row) => (
            <Card key={row.invoice.id} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.invoice.client_name || '-'}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.invoice.invoice_number || '-'}</p>
                  {row.order ? <p className="mt-1 text-[11px] text-primary">Pedido {row.order.order_number}</p> : <p className="mt-1 text-[11px] text-muted-foreground">Factura manual</p>}
                </div>
                <Badge className={`${row.statusMeta.badgeClass} border-0 text-xs`}>{row.statusMeta.label}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                  <p className="font-semibold">{formatMoney(row.summary.total)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Abonado</p>
                  <p className="font-semibold text-green-600">{formatMoney(row.summary.amountCollected)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</p>
                  <p className={row.summary.balanceDue > 0 ? 'font-bold text-red-600' : 'font-bold text-green-600'}>{formatMoney(row.summary.balanceDue)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencimiento</p>
                  <p className="text-sm">{row.invoice.due_date || 'Sin fecha'}</p>
                </div>
              </div>

              <AgingBadge row={row} />

              {row.lastPayment ? (
                <p className="text-xs text-muted-foreground">Último abono: {formatMoney(row.lastPayment.amount)} · {formatPaymentDate(row.lastPayment)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin abonos registrados</p>
              )}
              {row.nextCollectionAction ? (
                <p className="text-xs font-medium text-amber-700">Próximo cobro: {new Date(row.nextCollectionAction.due_at).toLocaleString('es-DO')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin seguimiento de cobro programado</p>
              )}

              <div className="border-t pt-2">{renderActions(row)}</div>
            </Card>
          ))}
        </div>

        <Card className="hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Factura</TableHead>
                  <TableHead className="text-xs">Pedido</TableHead>
                  <TableHead className="hidden text-xs lg:table-cell">Vence</TableHead>
                  <TableHead className="text-xs">Total</TableHead>
                  <TableHead className="text-xs">Abonado</TableHead>
                  <TableHead className="text-xs">Saldo</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs">Antigüedad</TableHead>
                  <TableHead className="hidden text-xs xl:table-cell">Último abono</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-16 text-center">
                      <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">No hay facturas para estos filtros</p>
                      <p className="mt-1 text-xs text-muted-foreground/60">Ajusta los filtros o registra una factura pendiente.</p>
                    </TableCell>
                  </TableRow>
                ) : rows.map((row) => (
                  <TableRow key={row.invoice.id} className="hover:bg-muted/30">
                    <TableCell className="max-w-[140px] truncate text-sm">{row.invoice.client_name || '-'}</TableCell>
                    <TableCell>
                      <p className="font-mono text-sm font-semibold">{row.invoice.invoice_number || '-'}</p>
                      {row.isManualInvoice ? <p className="text-[11px] text-muted-foreground">Factura manual</p> : null}
                    </TableCell>
                    <TableCell>
                      {row.order ? <Badge variant="outline" className="text-xs">{row.order.order_number}</Badge> : <span className="text-xs text-muted-foreground">{row.invoice.order_id ? 'Pedido no cargado' : 'Manual'}</span>}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{row.invoice.due_date || '-'}</TableCell>
                    <TableCell className="font-semibold">{formatMoney(row.summary.total)}</TableCell>
                    <TableCell className="font-semibold text-green-600">{formatMoney(row.summary.amountCollected)}</TableCell>
                    <TableCell className={row.summary.balanceDue > 0 ? 'font-bold text-red-600' : 'font-bold text-green-600'}>{formatMoney(row.summary.balanceDue)}</TableCell>
                    <TableCell><Badge className={`${row.statusMeta.badgeClass} border-0 text-xs`}>{row.statusMeta.label}</Badge></TableCell>
                    <TableCell><AgingBadge row={row} /></TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                      <div className="space-y-1">
                        <p>{row.lastPayment ? `${formatMoney(row.lastPayment.amount)} · ${formatPaymentDate(row.lastPayment)}` : '-'}</p>
                        {row.nextCollectionAction ? <p className="text-[10px] font-medium text-amber-700">Cobro: {new Date(row.nextCollectionAction.due_at).toLocaleDateString('es-DO')}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>{renderActions(row)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Card className="h-fit p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Clientes con saldo</p>
            <p className="text-xs text-muted-foreground">Ordenados por monto pendiente</p>
          </div>
          <Badge variant="outline">{clientBalances.length}</Badge>
        </div>

        <div className="mt-4 space-y-2">
          {clientBalances.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">Sin saldos pendientes</p>
            </div>
          ) : clientBalances.slice(0, 8).map((client) => (
            <div key={client.clientId || client.clientName} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{client.clientName}</p>
                  <p className="text-xs text-muted-foreground">{client.invoiceCount} factura{client.invoiceCount === 1 ? '' : 's'}</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-red-600">{formatMoney(client.balanceDue)}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

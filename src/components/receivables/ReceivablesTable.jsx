import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Eye, PlusCircle, Receipt } from 'lucide-react';

function formatPaymentDate(payment) {
  return payment?.payment_date || payment?.created_at?.slice?.(0, 10) || '-';
}

export default function ReceivablesTable({
  rows = [],
  clientBalances = [],
  onViewInvoice,
  onRegisterPayment,
}) {
  const { formatMoney } = useCurrency();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Factura</TableHead>
                <TableHead className="text-xs">Pedido</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Fecha</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Vence</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Abonado</TableHead>
                <TableHead className="text-xs">Saldo</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs hidden xl:table-cell">Último abono</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-16 text-center">
                    <Receipt className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No hay facturas para estos filtros</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Ajusta los filtros o registra una factura pendiente.</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.invoice.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm max-w-[140px] truncate">{row.invoice.client_name || '-'}</TableCell>
                    <TableCell>
                      <p className="font-mono text-sm font-semibold">{row.invoice.invoice_number || '-'}</p>
                      {row.isManualInvoice ? (
                        <p className="text-[11px] text-muted-foreground">Factura manual</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.order ? (
                        <Badge variant="outline" className="text-xs">{row.order.order_number}</Badge>
                      ) : row.invoice.order_id ? (
                        <span className="text-xs text-muted-foreground">Pedido no cargado</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{row.invoice.date || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{row.invoice.due_date || '-'}</TableCell>
                    <TableCell className="font-semibold">{formatMoney(row.summary.total)}</TableCell>
                    <TableCell className="font-semibold text-green-600">{formatMoney(row.summary.amountCollected)}</TableCell>
                    <TableCell className={row.summary.balanceDue > 0 ? 'font-bold text-red-600' : 'font-bold text-green-600'}>
                      {formatMoney(row.summary.balanceDue)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${row.statusMeta.badgeClass} border-0 text-xs`}>{row.statusMeta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden xl:table-cell">
                      {row.lastPayment ? `${formatMoney(row.lastPayment.amount)} · ${formatPaymentDate(row.lastPayment)}` : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewInvoice(row)} title="Ver factura">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {row.summary.balanceDue > 0 ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={() => onRegisterPayment(row)} title="Registrar abono">
                            <PlusCircle className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4 h-fit">
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
          ) : (
            clientBalances.slice(0, 8).map((client) => (
              <div key={client.clientId || client.clientName} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{client.clientName}</p>
                    <p className="text-xs text-muted-foreground">{client.invoiceCount} factura{client.invoiceCount === 1 ? '' : 's'}</p>
                  </div>
                  <p className="text-sm font-bold text-red-600 shrink-0">{formatMoney(client.balanceDue)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

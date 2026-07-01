import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Eye, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { generateReceiptPdf } from '@/lib/receiptPdf';

function getReceiptMeta(receipt = {}) {
  return receipt.receipt_metadata && typeof receipt.receipt_metadata === 'object'
    ? receipt.receipt_metadata
    : {};
}

function getReceiptDate(receipt = {}) {
  return receipt.receipt_issued_at?.slice?.(0, 10) || receipt.payment_date || receipt.created_at?.slice?.(0, 10) || '-';
}

function getBalanceValue(receipt = {}, key) {
  const metadata = getReceiptMeta(receipt);
  return Number(metadata[key] ?? 0);
}

export function ReceiptDetailDialog({ receipt, onClose }) {
  const { formatMoney, symbol } = useCurrency();
  const [isDownloading, setIsDownloading] = useState(false);
  if (!receipt) return null;

  const metadata = getReceiptMeta(receipt);
  const invoiceNumber = receipt.invoice?.invoice_number || metadata.invoice_number || '-';
  const clientName = receipt.invoice?.client_name || metadata.client_name || 'Sin cliente';
  const brandLabel = receipt.brandLabel || 'Histórico sin marca';
  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      await generateReceiptPdf({ receipt, symbol });
    } catch (error) {
      toast.error(error?.message || 'No se pudo descargar el PDF del recibo.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={Boolean(receipt)} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DialogTitle>{receipt.receipt_number || 'Recibo'}</DialogTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-2"
            disabled={isDownloading}
            onClick={handleDownloadPdf}
          >
            <Download className="h-4 w-4" />
            {isDownloading ? 'Generando...' : 'Descargar PDF'}
          </Button>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Cliente</p>
                <p className="text-base font-semibold">{clientName}</p>
                <p className="text-sm text-muted-foreground">Factura {invoiceNumber}</p>
              </div>
              <Badge className="w-fit border-0 bg-green-100 text-green-700">Recibo generado</Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Fecha</p>
              <p className="mt-1 font-medium">{getReceiptDate(receipt)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Marca / contexto</p>
              <p className="mt-1 font-medium">{brandLabel}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Monto recibido</p>
              <p className="mt-1 font-bold text-green-600">{formatMoney(receipt.amount || 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Método</p>
              <p className="mt-1 font-medium">{receipt.payment_method || '-'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Referencia</p>
              <p className="mt-1 font-medium">{receipt.reference_number || '-'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Concepto</p>
              <p className="mt-1 font-medium">Abono a factura {invoiceNumber}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Balance anterior</p>
              <p className="mt-1 font-bold">{formatMoney(getBalanceValue(receipt, 'balance_previous'))}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Abonado</p>
              <p className="mt-1 font-bold text-green-600">{formatMoney(getBalanceValue(receipt, 'amount_paid') || receipt.amount || 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Balance pendiente</p>
              <p className="mt-1 font-bold text-primary">{formatMoney(getBalanceValue(receipt, 'balance_after'))}</p>
            </div>
          </div>

          {receipt.notes || metadata.notes ? (
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Notas</p>
              <p className="mt-1 text-sm">{receipt.notes || metadata.notes}</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReceiptList({ receipts = [], onViewReceipt }) {
  const { formatMoney, symbol } = useCurrency();
  const [downloadingReceiptId, setDownloadingReceiptId] = useState(null);

  const handleDownloadReceipt = async (receipt) => {
    setDownloadingReceiptId(receipt.id);
    try {
      await generateReceiptPdf({ receipt, symbol });
    } catch (error) {
      toast.error(error?.message || 'No se pudo descargar el PDF del recibo.');
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">Recibo</TableHead>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Factura</TableHead>
              <TableHead className="text-xs">Monto</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Método</TableHead>
              <TableHead className="text-xs hidden xl:table-cell">Balance anterior</TableHead>
              <TableHead className="text-xs">Pendiente</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Marca</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-16 text-center">
                  <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No hay recibos generados</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">Genera un recibo desde el panel de abonos de una factura.</p>
                </TableCell>
              </TableRow>
            ) : (
              receipts.map((receipt) => {
                const metadata = getReceiptMeta(receipt);
                const invoiceNumber = receipt.invoice?.invoice_number || metadata.invoice_number || '-';
                const clientName = receipt.invoice?.client_name || metadata.client_name || 'Sin cliente';
                return (
                  <TableRow key={receipt.id} className="hover:bg-muted/30">
                    <TableCell>
                      <p className="font-mono text-sm font-semibold">{receipt.receipt_number || '-'}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{getReceiptDate(receipt)}</TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm">{clientName}</TableCell>
                    <TableCell className="font-mono text-sm">{invoiceNumber}</TableCell>
                    <TableCell className="font-semibold text-green-600">{formatMoney(receipt.amount || 0)}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{receipt.payment_method || '-'}</TableCell>
                    <TableCell className="hidden font-semibold xl:table-cell">{formatMoney(getBalanceValue(receipt, 'balance_previous'))}</TableCell>
                    <TableCell className="font-semibold text-primary">{formatMoney(getBalanceValue(receipt, 'balance_after'))}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs">{receipt.brandLabel || 'Histórico sin marca'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewReceipt?.(receipt)} title="Ver recibo">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={downloadingReceiptId === receipt.id}
                          onClick={() => handleDownloadReceipt(receipt)}
                          title="Descargar PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
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

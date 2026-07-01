import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Edit2, Plus, Receipt, Trash2 } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';
import {
  PAYMENT_METHODS,
  getAvailablePaymentAmount,
  getInvoicePaymentSummary,
  getInvoicePaymentErrorMessage,
  getPaymentStatusMeta,
  getPaymentUserLabel,
  roundMoney,
  sortInvoicePayments,
} from '@/lib/invoicePayments';

const INITIAL_FORM = {
  amount: '',
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'Efectivo',
  reference_number: '',
  notes: '',
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${value}`;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildPaymentTimeline(invoice, payments, total) {
  const sortedPayments = sortInvoicePayments(payments);
  let cumulative = 0;
  const events = [
    {
      id: 'invoice-created',
      date: invoice.created_at || invoice.date,
      user: invoice.created_by || 'Sistema',
      description: 'Factura creada',
    },
  ];

  sortedPayments.forEach((payment, index) => {
    cumulative = roundMoney(cumulative + Number(payment.amount || 0));
    const isFinalPayment = total > 0 && cumulative >= total;
    const ordinal = index === 0 ? 'Primer abono' : isFinalPayment ? 'Pago final' : `Abono ${index + 1}`;
    events.push({
      id: payment.id,
      date: payment.created_at || payment.payment_date,
      user: getPaymentUserLabel(payment),
      description: `${ordinal}: ${payment.payment_method || 'Método no especificado'}`,
    });
  });

  return events;
}

export default function InvoicePaymentsPanel({
  invoice,
  payments = [],
  canManage = false,
  isSaving = false,
  onCreatePayment,
  onUpdatePayment,
  onDeletePayment,
  onGenerateReceipt,
  onViewReceipt,
  generatingReceiptId = null,
}) {
  const { formatMoney } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState('');

  const sortedPayments = useMemo(() => sortInvoicePayments(payments), [payments]);
  const summary = useMemo(() => getInvoicePaymentSummary(invoice, sortedPayments), [invoice, sortedPayments]);
  const statusMeta = getPaymentStatusMeta(summary.paymentStatus);
  const timeline = useMemo(
    () => buildPaymentTimeline(invoice, sortedPayments, summary.total),
    [invoice, sortedPayments, summary.total]
  );

  const openCreateDialog = () => {
    setEditingPayment(null);
    setForm({
      ...INITIAL_FORM,
      payment_date: new Date().toISOString().slice(0, 10),
    });
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (payment) => {
    setEditingPayment(payment);
    setForm({
      amount: `${payment.amount || ''}`,
      payment_date: payment.payment_date || new Date().toISOString().slice(0, 10),
      payment_method: payment.payment_method || 'Efectivo',
      reference_number: payment.reference_number || '',
      notes: payment.notes || '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const updateForm = (field, value) => {
    setFormError('');
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    const amount = roundMoney(form.amount);
    const availableAmount = getAvailablePaymentAmount(invoice, sortedPayments, editingPayment?.id || null);

    if (amount <= 0) {
      setFormError('El monto debe ser mayor que cero.');
      return;
    }

    if (amount > availableAmount) {
      setFormError(`El abono no puede superar el saldo disponible de ${formatMoney(availableAmount)}.`);
      return;
    }

    const payload = {
      amount,
      payment_date: form.payment_date || new Date().toISOString().slice(0, 10),
      payment_method: form.payment_method || 'Efectivo',
      reference_number: `${form.reference_number || ''}`.trim() || null,
      notes: `${form.notes || ''}`.trim() || null,
    };

    try {
      if (editingPayment) {
        await onUpdatePayment?.(editingPayment, payload);
      } else {
        await onCreatePayment?.(payload);
      }

      setDialogOpen(false);
      setEditingPayment(null);
    } catch (error) {
      setFormError(getInvoicePaymentErrorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Resumen financiero</p>
            <p className="text-xs text-muted-foreground mt-0.5">El total original de la factura no se modifica.</p>
          </div>
          <Badge className={`${statusMeta.badgeClass} border-0`}>{statusMeta.label}</Badge>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Total factura</p>
            <p className="text-lg font-bold text-foreground mt-1">{formatMoney(summary.total)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Total abonado</p>
            <p className="text-lg font-bold text-green-600 mt-1">{formatMoney(summary.totalPaid)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Saldo pendiente</p>
            <p className={`text-lg font-bold mt-1 ${summary.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatMoney(summary.balanceDue)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Porcentaje pagado</p>
            <p className="text-lg font-bold text-foreground mt-1">{summary.percentPaid}%</p>
          </div>
        </div>
        <Progress value={summary.percentPaid} className="mt-4 h-2" />
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Pagos recibidos</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sortedPayments.length} abono{sortedPayments.length === 1 ? '' : 's'} registrado{sortedPayments.length === 1 ? '' : 's'}</p>
          </div>
          {canManage && summary.paymentStatus !== 'paid' ? (
            <Button size="sm" onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Registrar abono
            </Button>
          ) : null}
        </div>

        {sortedPayments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-5 text-center">
            <p className="text-sm font-medium text-muted-foreground">Sin abonos registrados</p>
            <p className="text-xs text-muted-foreground mt-1">La factura conserva su flujo actual hasta que registres el primer pago.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Monto</th>
                  <th className="py-2 pr-3">Método</th>
                  <th className="py-2 pr-3">Referencia</th>
                  <th className="py-2 pr-3">Notas</th>
                  <th className="py-2 pr-3">Usuario</th>
                  <th className="py-2 pr-3">Recibo</th>
                  {canManage ? <th className="py-2 w-20"></th> : null}
                </tr>
              </thead>
              <tbody>
                {sortedPayments.map((payment) => {
                  const hasReceipt = payment.receipt_status === 'generated' && payment.receipt_number;
                  const isGenerating = generatingReceiptId === payment.id;
                  return (
                    <tr key={payment.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-3 text-sm">{payment.payment_date || '-'}</td>
                      <td className="py-3 pr-3 text-sm font-semibold text-green-600">{formatMoney(payment.amount || 0)}</td>
                      <td className="py-3 pr-3 text-sm">{payment.payment_method || '-'}</td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground">{payment.reference_number || '-'}</td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground max-w-[180px] truncate">{payment.notes || '-'}</td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground">{getPaymentUserLabel(payment)}</td>
                      <td className="py-3 pr-3">
                        {hasReceipt && onViewReceipt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs"
                            onClick={() => onViewReceipt?.(payment)}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            {payment.receipt_number}
                          </Button>
                        ) : hasReceipt ? (
                          <Badge className="border-0 bg-green-100 text-green-700 text-xs">
                            Recibo {payment.receipt_number}
                          </Badge>
                        ) : onGenerateReceipt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs"
                            disabled={isGenerating}
                            onClick={() => onGenerateReceipt(payment)}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            {isGenerating ? 'Generando...' : 'Generar recibo'}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-xs">Sin recibo</Badge>
                        )}
                      </td>
                      {canManage ? (
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(payment)} title="Editar abono">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() => onDeletePayment?.(payment)}
                              title="Eliminar abono"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-sm font-semibold text-foreground">Línea de tiempo</p>
        <div className="mt-4 space-y-3">
          {timeline.map((event) => (
            <div key={event.id} className="flex gap-3">
              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{event.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(event.date)} · {event.user}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? 'Editar abono' : 'Registrar abono'}</DialogTitle>
            <DialogDescription>
              Saldo disponible: {formatMoney(getAvailablePaymentAmount(invoice, sortedPayments, editingPayment?.id || null))}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="payment-amount">Monto</Label>
              <Input
                id="payment-amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateForm('amount', event.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-date">Fecha</Label>
              <Input
                id="payment-date"
                type="date"
                value={form.payment_date}
                onChange={(event) => updateForm('payment_date', event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Método de pago</Label>
              <Select value={form.payment_method} onValueChange={(value) => updateForm('payment_method', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona método" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>{method}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-reference">Número de referencia</Label>
              <Input
                id="payment-reference"
                value={form.reference_number}
                onChange={(event) => updateForm('reference_number', event.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-notes">Notas</Label>
              <Textarea
                id="payment-notes"
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                placeholder="Opcional"
              />
            </div>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

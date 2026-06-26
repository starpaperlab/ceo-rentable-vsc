import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import PreviewModal from '@/components/billing/PreviewModal';
import ReceivablesFilters from '@/components/receivables/ReceivablesFilters';
import ReceivablesSummary from '@/components/receivables/ReceivablesSummary';
import ReceivablesTable from '@/components/receivables/ReceivablesTable';
import {
  buildReceivableRows,
  filterReceivableRows,
  getReceivablesSummary,
} from '@/lib/receivables';
import {
  getInvoicePaymentErrorMessage,
  groupPaymentsByInvoice,
} from '@/lib/invoicePayments';
import { deleteOwnedRowById, fetchOwnedRows, updateOwnedRowById } from '@/lib/supabaseOwnership';

const INITIAL_FILTERS = {
  client: '',
  status: 'all',
  source: 'all',
  startDate: '',
  endDate: '',
  overdueOnly: false,
};

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

function mapById(rows = []) {
  return rows.reduce((map, row) => {
    if (row?.id) map[row.id] = row;
    return map;
  }, {});
}

export default function Receivables() {
  const queryClient = useQueryClient();
  const {
    adminMode,
    enabled,
    fetchRows,
    ownerEmail,
    ownerId,
    queryKey: contextQueryKey,
  } = useWorkContextScope();

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [previewRow, setPreviewRow] = useState(null);

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'invoices' }),
    enabled,
  });

  const { data: invoicePayments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['invoice-payments', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoice_payments', ownerId, ownerEmail, adminMode }),
    enabled,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'orders' }),
    enabled,
  });

  const paymentsByInvoiceId = useMemo(() => groupPaymentsByInvoice(invoicePayments), [invoicePayments]);
  const ordersById = useMemo(() => mapById(orders), [orders]);
  const rows = useMemo(
    () => buildReceivableRows({ invoices, paymentsByInvoice: paymentsByInvoiceId, ordersById }),
    [invoices, ordersById, paymentsByInvoiceId]
  );
  const openRows = useMemo(
    () => rows.filter((row) => row.summary.balanceDue > 0 && row.status !== 'canceled'),
    [rows]
  );
  const tableBaseRows = useMemo(
    () => (filters.status === 'paid'
      ? rows.filter((row) => row.status === 'paid')
      : openRows),
    [filters.status, openRows, rows]
  );
  const filteredRows = useMemo(
    () => filterReceivableRows(tableBaseRows, filters),
    [filters, tableBaseRows]
  );
  const summary = useMemo(() => getReceivablesSummary(rows), [rows]);
  const sortedFilteredRows = useMemo(
    () => [...filteredRows].sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;
      return Number(b.summary.balanceDue || 0) - Number(a.summary.balanceDue || 0);
    }),
    [filteredRows]
  );

  const selectedInvoicePayments = previewRow ? paymentsByInvoiceId[previewRow.invoice.id] || [] : [];

  const createInvoicePaymentMutation = useMutation({
    mutationFn: async ({ invoice, payload }) => {
      const paymentPayload = {
        ...payload,
        invoice_id: invoice.id,
        user_id: invoice.user_id || ownerId || null,
        created_by: normalizeEmail(invoice.created_by) || ownerEmail || null,
        registered_by: ownerId || null,
        registered_by_email: ownerEmail || null,
      };
      const { data, error } = await supabase
        .from('invoice_payments')
        .insert(paymentPayload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Abono registrado');
    },
    onError: (error) => {
      toast.error(getInvoicePaymentErrorMessage(error));
    },
  });

  const updateInvoicePaymentMutation = useMutation({
    mutationFn: async ({ payment, payload }) => {
      await updateOwnedRowById({
        table: 'invoice_payments',
        id: payment.id,
        payload: {
          ...payload,
          registered_by: ownerId || null,
          registered_by_email: ownerEmail || null,
        },
        ownerId,
        ownerEmail,
        adminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Abono actualizado');
    },
    onError: (error) => {
      toast.error(getInvoicePaymentErrorMessage(error));
    },
  });

  const deleteInvoicePaymentMutation = useMutation({
    mutationFn: async (payment) => {
      await deleteOwnedRowById({
        table: 'invoice_payments',
        id: payment.id,
        ownerId,
        ownerEmail,
        adminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Abono eliminado');
    },
    onError: (error) => {
      toast.error(getInvoicePaymentErrorMessage(error));
    },
  });

  const isLoading = loadingInvoices || loadingPayments || loadingOrders;
  const isSavingPayment = createInvoicePaymentMutation.isPending
    || updateInvoicePaymentMutation.isPending
    || deleteInvoicePaymentMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[420px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cuentas por Cobrar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona facturas con saldo, abonos reales y pedidos vinculados sin duplicar pagos.
          </p>
        </div>
        <Card className="px-4 py-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Facturas abiertas</p>
          <p className="text-xl font-bold text-primary">{openRows.length}</p>
        </Card>
      </div>

      <ReceivablesSummary summary={summary} />

      <ReceivablesFilters
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(INITIAL_FILTERS)}
      />

      <ReceivablesTable
        rows={sortedFilteredRows}
        clientBalances={summary.clientBalances}
        onViewInvoice={(row) => setPreviewRow(row)}
        onRegisterPayment={(row) => setPreviewRow(row)}
      />

      {previewRow ? (
        <PreviewModal
          document={{ ...previewRow.invoice, payment_summary: previewRow.summary, _type: 'invoice' }}
          type="invoice"
          onClose={() => setPreviewRow(null)}
          payments={selectedInvoicePayments}
          canManagePayments={Boolean(previewRow.invoice.id)}
          isSavingPayment={isSavingPayment}
          onCreatePayment={(payload) => createInvoicePaymentMutation.mutateAsync({ invoice: previewRow.invoice, payload })}
          onUpdatePayment={(payment, payload) => updateInvoicePaymentMutation.mutateAsync({ payment, payload })}
          onDeletePayment={(payment) => deleteInvoicePaymentMutation.mutate(payment)}
        />
      ) : null}
    </div>
  );
}

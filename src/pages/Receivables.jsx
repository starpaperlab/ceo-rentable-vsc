import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card } from '@/components/ui/card';
import { Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import PreviewModal from '@/components/billing/PreviewModal';
import { ReceiptDetailDialog } from '@/components/billing/ReceiptList';
import CollectionFollowUpDialog from '@/components/receivables/CollectionFollowUpDialog';
import ReceivablesFilters from '@/components/receivables/ReceivablesFilters';
import ReceivablesSummary from '@/components/receivables/ReceivablesSummary';
import ReceivablesTable from '@/components/receivables/ReceivablesTable';
import { buildReceivableRows, filterReceivableRows, getReceivablesSummary } from '@/lib/receivables';
import { getInvoicePaymentErrorMessage, groupPaymentsByInvoice } from '@/lib/invoicePayments';
import { deleteOwnedRowById, updateOwnedRowById } from '@/lib/supabaseOwnership';

const INITIAL_FILTERS = {
  client: '',
  status: 'all',
  source: 'all',
  agingBucket: 'all',
  startDate: '',
  endDate: '',
  overdueOnly: false,
};

const normalizeEmail = (value = '') => `${value || ''}`.trim().toLowerCase();

const mapById = (rows = []) => rows.reduce((map, row) => {
  if (row?.id) map[row.id] = row;
  return map;
}, {});

const groupInvoiceReminders = (rows = []) => rows.reduce((map, reminder) => {
  if (reminder?.source_type !== 'invoice' || !reminder?.source_id) return map;
  map[reminder.source_id] = map[reminder.source_id] || [];
  map[reminder.source_id].push(reminder);
  return map;
}, {});

export default function Receivables() {
  const queryClient = useQueryClient();
  const { canWrite } = useWorkspace();
  const {
    activeWorkspaceId,
    adminMode,
    enabled,
    fetchRows,
    ownerEmail,
    ownerId,
    queryKey: contextQueryKey,
    scopedAdminMode,
    scopedOwnerEmail,
    scopedOwnerId,
    writeOwnerEmail,
    writeOwnerId,
  } = useWorkContextScope();

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [previewRow, setPreviewRow] = useState(null);
  const [autoOpenPaymentDialog, setAutoOpenPaymentDialog] = useState(false);
  const [collectionRow, setCollectionRow] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);

  const assertCanWrite = () => {
    if (!canWrite) {
      throw new Error('Tu perfil es de solo lectura. No puedes registrar, editar ni eliminar abonos o seguimientos.');
    }
  };

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'invoices' }),
    enabled,
  });

  const { data: invoicePayments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['invoice-payments', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'invoice_payments' }),
    enabled,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'orders' }),
    enabled,
  });

  const { data: reminders = [], isLoading: loadingReminders } = useQuery({
    queryKey: ['receivable-reminders', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'reminders', orderBy: 'due_at', ascending: true }),
    enabled,
  });

  const paymentsByInvoiceId = useMemo(() => groupPaymentsByInvoice(invoicePayments), [invoicePayments]);
  const ordersById = useMemo(() => mapById(orders), [orders]);
  const remindersByInvoice = useMemo(() => groupInvoiceReminders(reminders), [reminders]);

  const rows = useMemo(
    () => buildReceivableRows({
      invoices,
      paymentsByInvoice: paymentsByInvoiceId,
      ordersById,
      remindersByInvoice,
    }),
    [invoices, ordersById, paymentsByInvoiceId, remindersByInvoice]
  );

  const openRows = useMemo(
    () => rows.filter((row) => row.summary.balanceDue > 0 && row.status !== 'canceled'),
    [rows]
  );

  const tableBaseRows = useMemo(
    () => filters.status === 'paid' ? rows.filter((row) => row.status === 'paid') : openRows,
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
      if (Number(b.overdueDays || 0) !== Number(a.overdueDays || 0)) {
        return Number(b.overdueDays || 0) - Number(a.overdueDays || 0);
      }
      return Number(b.summary.balanceDue || 0) - Number(a.summary.balanceDue || 0);
    }),
    [filteredRows]
  );

  const selectedInvoicePayments = previewRow
    ? paymentsByInvoiceId[previewRow.invoice.id] || []
    : [];

  const createInvoicePaymentMutation = useMutation({
    mutationFn: async ({ invoice, payload }) => {
      assertCanWrite();
      const paymentPayload = {
        ...payload,
        workspace_id: activeWorkspaceId || invoice.workspace_id || null,
        invoice_id: invoice.id,
        user_id: invoice.user_id || ownerId || null,
        created_by: normalizeEmail(invoice.created_by) || ownerEmail || null,
        registered_by: ownerId || null,
        registered_by_email: ownerEmail || null,
      };
      const { data, error } = await supabase.from('invoice_payments').insert(paymentPayload).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Abono registrado');
    },
    onError: (error) => toast.error(getInvoicePaymentErrorMessage(error)),
  });

  const updateInvoicePaymentMutation = useMutation({
    mutationFn: async ({ payment, payload }) => {
      assertCanWrite();
      await updateOwnedRowById({
        table: 'invoice_payments',
        id: payment.id,
        payload: {
          ...payload,
          registered_by: ownerId || null,
          registered_by_email: ownerEmail || null,
        },
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Abono actualizado');
    },
    onError: (error) => toast.error(getInvoicePaymentErrorMessage(error)),
  });

  const deleteInvoicePaymentMutation = useMutation({
    mutationFn: async (payment) => {
      assertCanWrite();
      await deleteOwnedRowById({
        table: 'invoice_payments',
        id: payment.id,
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Abono eliminado');
    },
    onError: (error) => toast.error(getInvoicePaymentErrorMessage(error)),
  });

  const generateReceiptMutation = useMutation({
    mutationFn: async (payment) => {
      assertCanWrite();
      const { data, error } = await supabase.rpc('generate_invoice_payment_receipt', {
        payment_id: payment.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      setReceiptPreview({
        ...receipt,
        invoice: previewRow?.invoice || null,
      });
      toast.success(`Recibo ${receipt?.receipt_number || ''} generado`.trim());
    },
    onError: (error) => toast.error(error.message || 'No se pudo generar el recibo.'),
  });

  const createCollectionFollowUpMutation = useMutation({
    mutationFn: async ({ row, payload }) => {
      assertCanWrite();
      const invoice = row.invoice;
      const reminder = {
        workspace_id: activeWorkspaceId || invoice.workspace_id || null,
        client_id: invoice.client_id || null,
        user_id: writeOwnerId || ownerId || null,
        created_by: writeOwnerEmail || ownerEmail || null,
        title: `Seguimiento de cobro · ${invoice.invoice_number || 'Factura'}`,
        notes: payload.notes || null,
        due_at: payload.due_at,
        priority: payload.priority || 'normal',
        status: 'pending',
        source_type: 'invoice',
        source_id: invoice.id,
      };
      const { data, error } = await supabase.from('reminders').insert(reminder).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivable-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['notification-bell-reminders'] });
      setCollectionRow(null);
      toast.success('Seguimiento de cobro programado');
    },
    onError: (error) => toast.error(`No se pudo programar el seguimiento: ${error.message}`),
  });

  const isLoading = loadingInvoices || loadingPayments || loadingOrders || loadingReminders;
  const isSavingPayment =
    createInvoicePaymentMutation.isPending
    || updateInvoicePaymentMutation.isPending
    || deleteInvoicePaymentMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8">
      {!canWrite && (
        <Card className="flex items-center gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Eye className="h-5 w-5" />
          <div>
            <p className="font-semibold">Modo solo lectura</p>
            <p className="text-xs">Puedes consultar saldos, facturas, abonos y seguimientos, pero no modificarlos.</p>
          </div>
        </Card>
      )}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cuentas por Cobrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestiona saldo, antigüedad, abonos, recibos y próximos seguimientos de cobro.</p>
        </div>
        <Card className="px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Facturas abiertas</p>
          <p className="text-xl font-bold text-primary">{openRows.length}</p>
        </Card>
      </div>

      <ReceivablesSummary summary={summary} />
      <ReceivablesFilters filters={filters} onChange={setFilters} onReset={() => setFilters(INITIAL_FILTERS)} />

      <ReceivablesTable
        rows={sortedFilteredRows}
        clientBalances={summary.clientBalances}
        onViewInvoice={(row) => {
          setAutoOpenPaymentDialog(false);
          setPreviewRow(row);
        }}
        onRegisterPayment={(row) => {
          setAutoOpenPaymentDialog(true);
          setPreviewRow(row);
        }}
        onScheduleCollection={(row) => setCollectionRow(row)}
      />

      {previewRow ? (
        <PreviewModal
          document={{ ...previewRow.invoice, payment_summary: previewRow.summary, _type: 'invoice' }}
          type="invoice"
          onClose={() => {
            setPreviewRow(null);
            setAutoOpenPaymentDialog(false);
          }}
          canExport={canWrite}
          autoOpenPaymentDialog={autoOpenPaymentDialog}
          payments={selectedInvoicePayments}
          canManagePayments={canWrite && Boolean(previewRow.invoice.id)}
          isSavingPayment={isSavingPayment}
          onCreatePayment={(payload) => createInvoicePaymentMutation.mutateAsync({ invoice: previewRow.invoice, payload })}
          onUpdatePayment={(payment, payload) => updateInvoicePaymentMutation.mutateAsync({ payment, payload })}
          onDeletePayment={(payment) => deleteInvoicePaymentMutation.mutate(payment)}
          onGenerateReceipt={(payment) => generateReceiptMutation.mutate(payment)}
          onViewReceipt={(payment) => setReceiptPreview({ ...payment, invoice: previewRow.invoice })}
          generatingReceiptId={generateReceiptMutation.isPending ? generateReceiptMutation.variables?.id || null : null}
        />
      ) : null}

      <CollectionFollowUpDialog
        open={Boolean(collectionRow)}
        onOpenChange={(open) => {
          if (!open) setCollectionRow(null);
        }}
        row={collectionRow}
        responsibleLabel={writeOwnerEmail || ownerEmail || ''}
        onSave={(payload) => createCollectionFollowUpMutation.mutateAsync({ row: collectionRow, payload })}
        isSaving={createCollectionFollowUpMutation.isPending}
      />

      <ReceiptDetailDialog
        receipt={receiptPreview}
        onClose={() => setReceiptPreview(null)}
        canExport={adminMode || canWrite}
      />
    </div>
  );
}

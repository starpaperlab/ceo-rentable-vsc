import { getInvoicePaymentSummary, getPaymentStatusMeta, roundMoney, sortInvoicePayments } from '@/lib/invoicePayments';

export const RECEIVABLE_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Sin pago' },
  { value: 'partial', label: 'Pago parcial' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
];

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOverdue(invoice = {}, summary = {}, today = new Date()) {
  if (summary.balanceDue <= 0 || !invoice.due_date) return false;
  const dueDate = parseDateOnly(invoice.due_date);
  if (!dueDate) return false;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dueDate < current;
}

export function getReceivableStatus(invoice = {}, summary = {}, today = new Date()) {
  if (summary.paymentStatus === 'canceled') return 'canceled';
  if (summary.balanceDue <= 0 || summary.paymentStatus === 'paid') return 'paid';
  if (isOverdue(invoice, summary, today)) return 'overdue';
  if (summary.totalPaid > 0) return 'partial';
  return 'pending';
}

export function getReceivableStatusMeta(status) {
  if (status === 'pending') {
    return {
      ...getPaymentStatusMeta('pending'),
      label: 'Sin pago',
    };
  }
  return getPaymentStatusMeta(status);
}

export function buildReceivableRows({ invoices = [], paymentsByInvoice = {}, ordersById = {}, today = new Date() }) {
  return invoices.map((invoice) => {
    const payments = sortInvoicePayments(paymentsByInvoice[invoice.id] || []);
    const summary = getInvoicePaymentSummary(invoice, payments);
    const status = getReceivableStatus(invoice, summary, today);
    const order = invoice.order_id ? ordersById[invoice.order_id] || null : null;
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;

    return {
      invoice,
      payments,
      summary,
      status,
      statusMeta: getReceivableStatusMeta(status),
      order,
      lastPayment,
      isManualInvoice: !invoice.order_id,
      isConnectedToOrder: Boolean(invoice.order_id),
    };
  });
}

export function getReceivablesSummary(rows = []) {
  const activeRows = rows.filter((row) => row.status !== 'canceled');
  const openRows = activeRows.filter((row) => row.summary.balanceDue > 0);
  const clientBalances = openRows.reduce((map, row) => {
    const key = row.invoice.client_id || row.invoice.client_name || row.invoice.id;
    const current = map.get(key) || {
      clientId: row.invoice.client_id || null,
      clientName: row.invoice.client_name || 'Cliente sin nombre',
      balanceDue: 0,
      invoiceCount: 0,
    };
    current.balanceDue = roundMoney(current.balanceDue + row.summary.balanceDue);
    current.invoiceCount += 1;
    map.set(key, current);
    return map;
  }, new Map());

  return {
    totalPending: roundMoney(openRows.reduce((sum, row) => sum + row.summary.balanceDue, 0)),
    totalCollected: roundMoney(activeRows.reduce((sum, row) => sum + row.summary.amountCollected, 0)),
    pendingInvoices: openRows.filter((row) => row.status === 'pending').length,
    partialInvoices: openRows.filter((row) => row.status === 'partial').length,
    overdueInvoices: openRows.filter((row) => row.status === 'overdue').length,
    clientsWithBalance: clientBalances.size,
    clientBalances: Array.from(clientBalances.values()).sort((a, b) => b.balanceDue - a.balanceDue),
  };
}

export function filterReceivableRows(rows = [], filters = {}) {
  const search = `${filters.client || ''}`.trim().toLowerCase();
  const status = filters.status || 'all';
  const source = filters.source || 'all';
  const startDate = parseDateOnly(filters.startDate);
  const endDate = parseDateOnly(filters.endDate);
  const overdueOnly = Boolean(filters.overdueOnly);

  return rows.filter((row) => {
    const invoice = row.invoice;
    const invoiceDate = parseDateOnly(invoice.date);
    const matchesClient = !search
      || `${invoice.client_name || ''}`.toLowerCase().includes(search)
      || `${invoice.client_email || ''}`.toLowerCase().includes(search)
      || `${invoice.client_phone || ''}`.toLowerCase().includes(search);
    const matchesStatus = status === 'all' || row.status === status;
    const matchesSource = source === 'all'
      || (source === 'with_order' && row.isConnectedToOrder)
      || (source === 'manual' && row.isManualInvoice);
    const matchesStart = !startDate || (invoiceDate && invoiceDate >= startDate);
    const matchesEnd = !endDate || (invoiceDate && invoiceDate <= endDate);
    const matchesOverdue = !overdueOnly || row.status === 'overdue';

    return matchesClient && matchesStatus && matchesSource && matchesStart && matchesEnd && matchesOverdue;
  });
}

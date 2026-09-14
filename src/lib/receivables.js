import { getInvoicePaymentSummary, getPaymentStatusMeta, roundMoney, sortInvoicePayments } from '@/lib/invoicePayments';
import { AGING_BUCKETS, getAgingBucket, getAgingMeta, getOverdueDays, parseDateOnly } from '@/lib/receivableAging';

export const RECEIVABLE_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Sin pago' },
  { value: 'partial', label: 'Pago parcial' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
];

export function getReceivableStatus(invoice = {}, summary = {}, today = new Date()) {
  if (summary.paymentStatus === 'canceled') return 'canceled';
  if (summary.balanceDue <= 0 || summary.paymentStatus === 'paid') return 'paid';
  if (summary.balanceDue > 0 && getOverdueDays(invoice.due_date, today) > 0) return 'overdue';
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

export function buildReceivableRows({ invoices = [], paymentsByInvoice = {}, ordersById = {}, remindersByInvoice = {}, today = new Date() }) {
  return invoices.map((invoice) => {
    const payments = sortInvoicePayments(paymentsByInvoice[invoice.id] || []);
    const summary = getInvoicePaymentSummary(invoice, payments);
    const status = getReceivableStatus(invoice, summary, today);
    const order = invoice.order_id ? ordersById[invoice.order_id] || null : null;
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
    const overdueDays = summary.balanceDue > 0 ? getOverdueDays(invoice.due_date, today) : 0;
    const agingBucket = summary.balanceDue > 0 ? getAgingBucket(invoice.due_date, today) : 'current';
    const agingMeta = getAgingMeta(agingBucket);
    const collectionReminders = (remindersByInvoice[invoice.id] || []).filter((reminder) => reminder.status === 'pending').sort((a, b) => `${a.due_at || ''}`.localeCompare(`${b.due_at || ''}`));
    const nextCollectionAction = collectionReminders[0] || null;

    return {
      invoice,
      payments,
      summary,
      status,
      statusMeta: getReceivableStatusMeta(status),
      order,
      lastPayment,
      overdueDays,
      agingBucket,
      agingMeta,
      nextCollectionAction,
      collectionReminders,
      isManualInvoice: !invoice.order_id,
      isConnectedToOrder: Boolean(invoice.order_id),
    };
  });
}

export function getReceivablesSummary(rows = []) {
  const activeRows = rows.filter((row) => row.status !== 'canceled');
  const openRows = activeRows.filter((row) => row.summary.balanceDue > 0);
  const aging = AGING_BUCKETS.reduce((map, bucket) => {
    map[bucket.value] = {
      ...bucket,
      amount: 0,
      invoiceCount: 0,
    };
    return map;
  }, {});

  openRows.forEach((row) => {
    const bucket = aging[row.agingBucket] || aging.current;
    bucket.amount = roundMoney(bucket.amount + row.summary.balanceDue);
    bucket.invoiceCount += 1;
  });

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
    aging,
    agingBuckets: AGING_BUCKETS.map((bucket) => aging[bucket.value]),
  };
}

export function filterReceivableRows(rows = [], filters = {}) {
  const search = `${filters.client || ''}`.trim().toLowerCase();
  const status = filters.status || 'all';
  const source = filters.source || 'all';
  const startDate = parseDateOnly(filters.startDate);
  const endDate = parseDateOnly(filters.endDate);
  const overdueOnly = Boolean(filters.overdueOnly);
  const agingBucket = filters.agingBucket || 'all';

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
    const matchesAging = agingBucket === 'all' || row.agingBucket === agingBucket;

    return matchesClient && matchesStatus && matchesSource && matchesStart && matchesEnd && matchesOverdue && matchesAging;
  });
}

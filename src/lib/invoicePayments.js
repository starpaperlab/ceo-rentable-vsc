const MONEY_EPSILON = 0.005;

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'PayPal', 'Otro'];

export const PAYMENT_STATUS_META = {
  pending: {
    label: 'Pendiente',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    textClass: 'text-red-600 dark:text-red-400',
  },
  partial: {
    label: 'Pago parcial',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
  paid: {
    label: 'Pagada',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    textClass: 'text-green-600 dark:text-green-400',
  },
  overdue: {
    label: 'Vencida',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    textClass: 'text-red-600 dark:text-red-400',
  },
  canceled: {
    label: 'Cancelada',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
    textClass: 'text-slate-600 dark:text-slate-400',
  },
};

export function toMoneyNumber(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function roundMoney(value) {
  return Math.round(toMoneyNumber(value) * 100) / 100;
}

export function groupPaymentsByInvoice(payments = []) {
  return payments.reduce((map, payment) => {
    const invoiceId = payment?.invoice_id;
    if (!invoiceId) return map;
    if (!map[invoiceId]) map[invoiceId] = [];
    map[invoiceId].push(payment);
    return map;
  }, {});
}

export function sortInvoicePayments(payments = []) {
  return [...payments].sort((a, b) => {
    const dateA = `${a?.payment_date || a?.created_at || ''}`;
    const dateB = `${b?.payment_date || b?.created_at || ''}`;
    const byDate = dateA.localeCompare(dateB);
    if (byDate !== 0) return byDate;
    return `${a?.created_at || ''}`.localeCompare(`${b?.created_at || ''}`);
  });
}

export function getInvoicePaymentSummary(invoice = {}, payments = []) {
  const validPayments = payments.filter((payment) => toMoneyNumber(payment?.amount) > 0);
  const total = roundMoney(invoice?.total_final);
  const totalPaid = roundMoney(validPayments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0));
  const balanceDue = roundMoney(Math.max(total - totalPaid, 0));
  const hasPayments = validPayments.length > 0;
  const legacyStatus = `${invoice?.status || 'pending'}`.toLowerCase();
  const legacyPaid = !hasPayments && legacyStatus === 'paid';

  let paymentStatus = 'pending';
  if (hasPayments) {
    if (totalPaid <= MONEY_EPSILON) {
      paymentStatus = 'pending';
    } else if (totalPaid + MONEY_EPSILON >= total) {
      paymentStatus = 'paid';
    } else {
      paymentStatus = 'partial';
    }
  } else if (legacyPaid) {
    paymentStatus = 'paid';
  } else if (legacyStatus === 'overdue') {
    paymentStatus = 'overdue';
  } else if (legacyStatus === 'canceled') {
    paymentStatus = 'canceled';
  }

  const amountCollected = hasPayments ? totalPaid : legacyPaid ? total : 0;
  const legacyCanceled = !hasPayments && legacyStatus === 'canceled';
  const effectiveBalanceDue = hasPayments ? balanceDue : legacyPaid || legacyCanceled ? 0 : total;

  return {
    total,
    totalPaid,
    balanceDue: effectiveBalanceDue,
    rawBalanceDue: balanceDue,
    percentPaid: total > 0 ? Math.min(100, Math.round((amountCollected / total) * 100)) : 0,
    amountCollected: roundMoney(amountCollected),
    paymentStatus,
    invoiceStatusForDb: hasPayments ? (paymentStatus === 'partial' ? 'partial' : paymentStatus === 'paid' ? 'paid' : 'pending') : legacyStatus,
    hasPayments,
    payments: validPayments,
  };
}

export function enrichInvoicesWithPayments(invoices = [], paymentsByInvoice = {}) {
  return invoices.map((invoice) => {
    const payments = paymentsByInvoice[invoice.id] || [];
    const paymentSummary = getInvoicePaymentSummary(invoice, payments);
    return {
      ...invoice,
      payment_summary: paymentSummary,
      payment_status: paymentSummary.paymentStatus,
      payment_total_paid: paymentSummary.totalPaid,
      payment_balance_due: paymentSummary.balanceDue,
      payment_percent_paid: paymentSummary.percentPaid,
    };
  });
}

export function getAvailablePaymentAmount(invoice = {}, payments = [], editingPaymentId = null) {
  const summary = getInvoicePaymentSummary(
    invoice,
    payments.filter((payment) => payment.id !== editingPaymentId)
  );
  return roundMoney(summary.total - summary.totalPaid);
}

export function getPaymentUserLabel(payment = {}) {
  return payment.registered_by_email || payment.registered_by_name || payment.created_by || 'Usuario';
}

export function getPaymentStatusMeta(status) {
  return PAYMENT_STATUS_META[status] || PAYMENT_STATUS_META.pending;
}

export function isMissingInvoicePaymentsTableError(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    text.includes('invoice_payments') &&
    (
      text.includes('schema cache') ||
      text.includes('could not find the table') ||
      text.includes('does not exist')
    )
  );
}

export function getInvoicePaymentErrorMessage(error) {
  if (isMissingInvoicePaymentsTableError(error)) {
    return 'La tabla de abonos aún no está disponible en Supabase. Ejecuta la migración de pagos parciales o espera unos segundos y recarga la página para que Supabase actualice el schema cache.';
  }

  return error?.message || 'No se pudo guardar el abono.';
}

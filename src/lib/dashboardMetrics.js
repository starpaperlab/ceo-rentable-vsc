import { getInvoicePaymentSummary, groupPaymentsByInvoice, roundMoney } from '@/lib/invoicePayments';

const MONEY_EPSILON = 0.005;

export function getMonthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizeInvoiceTotal(invoice = {}) {
  const direct = Number(invoice.total_final ?? invoice.total_amount ?? invoice.total ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  return roundMoney(lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price ?? item.price ?? 0);
    return sum + (Number.isFinite(quantity) ? quantity : 1) * (Number.isFinite(unitPrice) ? unitPrice : 0);
  }, 0));
}

export function getInvoiceDirectCost(invoice = {}) {
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const fromLines = lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitCost = Number(
      item.unit_cost_snapshot
      ?? item.unit_cost
      ?? item.cost
      ?? item.costo_unitario
      ?? 0
    );
    return sum + (Number.isFinite(quantity) ? quantity : 1) * (Number.isFinite(unitCost) ? unitCost : 0);
  }, 0);

  if (fromLines > MONEY_EPSILON) return roundMoney(fromLines);
  const legacy = Number(invoice.total_costos ?? 0);
  return roundMoney(Number.isFinite(legacy) ? legacy : 0);
}

function isCanceled(invoice = {}) {
  return ['canceled', 'cancelled', 'cancelada', 'cancelado'].includes(`${invoice.status || ''}`.trim().toLowerCase());
}

function invoiceDate(invoice = {}) {
  return invoice.date || invoice.created_at || null;
}

function paymentDate(payment = {}) {
  return payment.payment_date || payment.created_at || null;
}

function percentChange(current, previous) {
  const a = Number(current || 0);
  const b = Number(previous || 0);
  if (Math.abs(b) <= MONEY_EPSILON) return Math.abs(a) > MONEY_EPSILON ? 100 : 0;
  return ((a - b) / Math.abs(b)) * 100;
}

export function selectMonthlyRecord(records = [], monthKey) {
  const matching = records.filter((record) => record?.month === monthKey);
  if (!matching.length) return null;
  return [...matching].sort((a, b) => {
    const av = new Date(a.updated_at || a.created_at || 0).getTime();
    const bv = new Date(b.updated_at || b.created_at || 0).getTime();
    return bv - av;
  })[0];
}

export function getConfiguredMonthlyFixedCosts(items = []) {
  return roundMoney(items
    .filter((item) => item?.is_active !== false)
    .reduce((sum, item) => {
      const monthly = Number(item.monthly_cost || 0);
      if (monthly > 0) return sum + monthly;

      const annual = Number(item.annual_cost || 0);
      if (annual > 0) return sum + (annual / 12);

      if (item.billing_period === 'monthly') {
        const fixed = Number(item.fixed_amount || item.fixed_fee || 0);
        return sum + (Number.isFinite(fixed) ? fixed : 0);
      }

      return sum;
    }, 0));
}

function getPeriodSales(invoices, monthKey) {
  const rows = invoices.filter((invoice) => !isCanceled(invoice) && getMonthKey(invoiceDate(invoice)) === monthKey);
  const billed = roundMoney(rows.reduce((sum, invoice) => sum + normalizeInvoiceTotal(invoice), 0));
  const directCosts = roundMoney(rows.reduce((sum, invoice) => sum + getInvoiceDirectCost(invoice), 0));
  return { rows, billed, directCosts };
}

function getCollectionsForMonth({ invoices, paymentsByInvoice, monthKey }) {
  let collected = 0;

  invoices.filter((invoice) => !isCanceled(invoice)).forEach((invoice) => {
    const payments = paymentsByInvoice[invoice.id] || [];
    if (payments.length) {
      collected += payments
        .filter((payment) => getMonthKey(paymentDate(payment)) === monthKey)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return;
    }

    const summary = getInvoicePaymentSummary(invoice, []);
    if (summary.amountCollected > 0 && getMonthKey(invoiceDate(invoice)) === monthKey) {
      collected += summary.amountCollected;
    }
  });

  return roundMoney(collected);
}

function getPeriodSnapshot({ invoices, paymentsByInvoice, monthlyRecords, monthKey }) {
  const sales = getPeriodSales(invoices, monthKey);
  const monthlyRecord = selectMonthlyRecord(monthlyRecords, monthKey);
  const hasRegisteredExpenses = monthlyRecord && Number.isFinite(Number(monthlyRecord.expenses));
  const expenses = hasRegisteredExpenses
    ? roundMoney(Number(monthlyRecord.expenses || 0))
    : sales.directCosts;
  const expenseSource = hasRegisteredExpenses ? 'registered' : 'estimated-direct-costs';
  const profit = roundMoney(sales.billed - expenses);
  const margin = sales.billed > MONEY_EPSILON ? (profit / sales.billed) * 100 : 0;
  const collected = getCollectionsForMonth({ invoices, paymentsByInvoice, monthKey });

  return {
    monthKey,
    billed: sales.billed,
    collected,
    directCosts: sales.directCosts,
    expenses,
    expenseSource,
    profit,
    margin,
    invoiceCount: sales.rows.length,
    averageTicket: sales.rows.length ? roundMoney(sales.billed / sales.rows.length) : 0,
  };
}

export function buildReceivablesSnapshot({ invoices = [], invoicePayments = [], now = new Date() }) {
  const paymentsByInvoice = groupPaymentsByInvoice(invoicePayments);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  const activeInvoices = invoices.filter((invoice) => !isCanceled(invoice));
  const rows = activeInvoices.map((invoice) => {
    const summary = getInvoicePaymentSummary(invoice, paymentsByInvoice[invoice.id] || []);
    const due = invoice.due_date ? new Date(`${invoice.due_date}T00:00:00`) : null;
    const overdue = summary.balanceDue > MONEY_EPSILON && due && !Number.isNaN(due.getTime()) && due < startToday;
    return { invoice, summary, overdue };
  });

  return {
    totalBilled: roundMoney(rows.reduce((sum, row) => sum + row.summary.total, 0)),
    totalCollected: roundMoney(rows.reduce((sum, row) => sum + row.summary.amountCollected, 0)),
    totalReceivable: roundMoney(rows.reduce((sum, row) => sum + row.summary.balanceDue, 0)),
    openInvoices: rows.filter((row) => row.summary.balanceDue > MONEY_EPSILON).length,
    overdueInvoices: rows.filter((row) => row.overdue).length,
    overdueAmount: roundMoney(rows.filter((row) => row.overdue).reduce((sum, row) => sum + row.summary.balanceDue, 0)),
    rows,
  };
}

export function buildDashboardFinancials({
  invoices = [],
  invoicePayments = [],
  monthlyRecords = [],
  costLibraryItems = [],
  now = new Date(),
} = {}) {
  const paymentsByInvoice = groupPaymentsByInvoice(invoicePayments);
  const currentKey = getMonthKey(now);
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousKey = getMonthKey(previousDate);

  const current = getPeriodSnapshot({
    invoices,
    paymentsByInvoice,
    monthlyRecords,
    monthKey: currentKey,
  });
  const previous = getPeriodSnapshot({
    invoices,
    paymentsByInvoice,
    monthlyRecords,
    monthKey: previousKey,
  });

  const receivables = buildReceivablesSnapshot({ invoices, invoicePayments, now });
  const configuredFixedCosts = getConfiguredMonthlyFixedCosts(costLibraryItems);
  const contributionMarginRatio = current.billed > MONEY_EPSILON
    ? Math.max(0, Math.min(1, (current.billed - current.directCosts) / current.billed))
    : 0;

  let breakEven = null;
  let breakEvenSource = 'insufficient-data';
  if (contributionMarginRatio > MONEY_EPSILON && configuredFixedCosts > MONEY_EPSILON) {
    breakEven = roundMoney(configuredFixedCosts / contributionMarginRatio);
    breakEvenSource = 'configured-fixed-costs';
  } else if (contributionMarginRatio > MONEY_EPSILON && current.expenses > MONEY_EPSILON) {
    breakEven = roundMoney(current.expenses / contributionMarginRatio);
    breakEvenSource = 'estimated-from-expenses';
  }

  return {
    current,
    previous,
    receivables,
    configuredFixedCosts,
    contributionMarginRatio,
    breakEven,
    breakEvenSource,
    growth: {
      billed: percentChange(current.billed, previous.billed),
      collected: percentChange(current.collected, previous.collected),
      expenses: percentChange(current.expenses, previous.expenses),
      profit: percentChange(current.profit, previous.profit),
      marginPoints: current.margin - previous.margin,
    },
    hasFinancialData:
      current.billed > MONEY_EPSILON
      || current.collected > MONEY_EPSILON
      || current.expenses > MONEY_EPSILON
      || receivables.totalBilled > MONEY_EPSILON,
  };
}

export function buildSixMonthTrend({
  invoices = [],
  invoicePayments = [],
  monthlyRecords = [],
  now = new Date(),
} = {}) {
  const paymentsByInvoice = groupPaymentsByInvoice(invoicePayments);
  const months = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthKey = getMonthKey(date);
    const sales = getPeriodSales(invoices, monthKey);
    const record = selectMonthlyRecord(monthlyRecords, monthKey);
    const hasExpenses = Boolean(record && Number.isFinite(Number(record.expenses)));

    months.push({
      monthKey,
      periodo: date.toLocaleDateString('es-DO', { month: 'short' }),
      facturado: sales.billed,
      cobrado: getCollectionsForMonth({ invoices, paymentsByInvoice, monthKey }),
      gastos: hasExpenses ? roundMoney(Number(record.expenses || 0)) : null,
      gastosRegistrados: hasExpenses,
    });
  }

  return months;
}

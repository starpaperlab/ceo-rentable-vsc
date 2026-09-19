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

export function getInvoiceNetRevenue(invoice = {}) {
  const beforeTax = Number(invoice.subtotal_before_tax);
  if (Number.isFinite(beforeTax) && beforeTax >= 0) return roundMoney(beforeTax);

  const total = normalizeInvoiceTotal(invoice);
  const tax = Number(invoice.tax_amount || 0);
  return roundMoney(Math.max(0, total - (Number.isFinite(tax) ? tax : 0)));
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
  const netRevenue = roundMoney(rows.reduce((sum, invoice) => sum + getInvoiceNetRevenue(invoice), 0));
  const directCosts = roundMoney(rows.reduce((sum, invoice) => sum + getInvoiceDirectCost(invoice), 0));
  return { rows, billed, netRevenue, directCosts };
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
  const expenseSource = hasRegisteredExpenses
    ? 'registered'
    : sales.directCosts > MONEY_EPSILON
      ? 'estimated-direct-costs'
      : 'missing';
  const expenses = hasRegisteredExpenses
    ? roundMoney(Number(monthlyRecord.expenses || 0))
    : sales.directCosts > MONEY_EPSILON
      ? sales.directCosts
      : null;
  const profit = expenses == null ? null : roundMoney(sales.netRevenue - expenses);
  const margin = expenses != null && sales.netRevenue > MONEY_EPSILON ? (profit / sales.netRevenue) * 100 : null;
  const collected = getCollectionsForMonth({ invoices, paymentsByInvoice, monthKey });

  return {
    monthKey,
    billed: sales.billed,
    netRevenue: sales.netRevenue,
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
  const contributionMarginRatio = current.netRevenue > MONEY_EPSILON
    ? Math.max(0, Math.min(1, (current.netRevenue - current.directCosts) / current.netRevenue))
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
      expenses: current.expenses == null || previous.expenses == null ? null : percentChange(current.expenses, previous.expenses),
      profit: current.profit == null || previous.profit == null ? null : percentChange(current.profit, previous.profit),
      marginPoints: current.margin == null || previous.margin == null ? null : current.margin - previous.margin,
    },
    hasFinancialData:
      current.billed > MONEY_EPSILON
      || current.collected > MONEY_EPSILON
      || Number(current.expenses || 0) > MONEY_EPSILON
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
      ingresoNeto: sales.netRevenue,
      cobrado: getCollectionsForMonth({ invoices, paymentsByInvoice, monthKey }),
      gastos: hasExpenses ? roundMoney(Number(record.expenses || 0)) : null,
      gastosRegistrados: hasExpenses,
    });
  }

  return months;
}


function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

export function buildCeoScore({
  financials,
  products = [],
  overdueOperationalItems = 0,
  targetMargin = 40,
  minimumMargin = 20,
} = {}) {
  const current = financials?.current || {};
  const receivables = financials?.receivables || {};
  const totalHistoricalBilled = Number(receivables.totalBilled || 0);
  const hasSufficientData = totalHistoricalBilled > MONEY_EPSILON || Number(current.expenses || 0) > MONEY_EPSILON;

  if (!hasSufficientData) {
    return {
      score: null,
      status: 'Sin datos suficientes',
      hasSufficientData: false,
      explanation: 'Registra ventas, cobros o gastos para calcular la salud real de tu negocio.',
      factors: [],
      positiveFactors: [],
      riskFactors: [],
      actions: ['Registra tu primera venta o completa el Control Mensual.'],
    };
  }

  const hasMargin = current.margin != null;
  const margin = hasMargin ? Number(current.margin) : null;
  const safeTargetMargin = Math.max(1, Number(targetMargin || 40));
  const safeMinimumMargin = Math.max(0, Number(minimumMargin ?? 20));
  const marginScore = hasMargin ? clampScore((margin / safeTargetMargin) * 100) : null;

  const growthValue = Number(financials?.growth?.billed || 0);
  const growthScore = clampScore(50 + Math.max(-50, Math.min(50, growthValue)));

  const billed = Number(current.billed || 0);
  const hasExpenses = current.expenses != null;
  const expenses = hasExpenses ? Number(current.expenses || 0) : null;
  const expenseRatio = hasExpenses
    ? (billed > MONEY_EPSILON ? expenses / billed : expenses > MONEY_EPSILON ? 1 : 0)
    : null;
  const expenseControlScore = expenseRatio == null ? null : clampScore(100 - (expenseRatio * 100));

  const collected = Number(receivables.totalCollected || 0);
  const receivable = Number(receivables.totalReceivable || 0);
  const overdueAmount = Number(receivables.overdueAmount || 0);
  const collectionBase = Math.max(totalHistoricalBilled, collected + receivable, 1);
  const collectionRate = Math.max(0, Math.min(1, collected / collectionBase));
  const overdueRatio = Math.max(0, Math.min(1, overdueAmount / Math.max(receivable, 1)));
  const collectionScore = clampScore((collectionRate * 80) + ((1 - overdueRatio) * 20));

  const activeProducts = products.filter((product) => (product.status || 'active') !== 'inactive');
  const lowMarginProducts = activeProducts.filter((product) => {
    const threshold = Number(product.minimum_margin ?? safeMinimumMargin);
    return Number(product.margin_pct || 0) < threshold;
  });
  const lossProducts = activeProducts.filter((product) => Number(product.margin_pct || 0) < 0);
  const productScore = activeProducts.length
    ? clampScore(100 - ((lowMarginProducts.length / activeProducts.length) * 70) - ((lossProducts.length / activeProducts.length) * 30))
    : 70;

  const operationalScore = clampScore(100 - (Math.max(0, Number(overdueOperationalItems || 0)) * 15));

  const allFactors = [
    { key: 'margin', label: 'Rentabilidad y margen', score: marginScore, weight: 0.25, available: marginScore != null },
    { key: 'growth', label: 'Crecimiento de ingresos', score: growthScore, weight: 0.15, available: true },
    { key: 'expenses', label: 'Control de gastos', score: expenseControlScore, weight: 0.15, available: expenseControlScore != null },
    { key: 'collections', label: 'Liquidez y cobranza', score: collectionScore, weight: 0.20, available: true },
    { key: 'products', label: 'Rentabilidad de productos', score: productScore, weight: 0.15, available: true },
    { key: 'operations', label: 'Cumplimiento operativo', score: operationalScore, weight: 0.10, available: true },
  ];

  const factors = allFactors.filter((factor) => factor.available);
  const availableWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = clampScore(
    availableWeight > 0
      ? factors.reduce((sum, factor) => sum + (factor.score * factor.weight), 0) / availableWeight
      : 0
  );
  const status = score < 41 ? 'Crítico' : score < 71 ? 'Inestable' : 'Saludable';

  const positiveFactors = [...factors]
    .filter((factor) => factor.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const riskFactors = [...factors]
    .filter((factor) => factor.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const actions = [];
  if (overdueAmount > MONEY_EPSILON) actions.push('Prioriza el cobro de facturas vencidas.');
  if (margin != null && margin < safeMinimumMargin && billed > MONEY_EPSILON) actions.push('Revisa costos y precios para recuperar margen.');
  if (growthValue < -10) actions.push('Activa seguimiento comercial para recuperar ventas del mes.');
  if (expenseRatio != null && expenseRatio > 0.8 && billed > MONEY_EPSILON) actions.push('Revisa gastos: están consumiendo más del 80% de lo facturado.');
  if (lossProducts.length > 0) actions.push('Corrige productos que se están vendiendo con pérdida.');
  else if (lowMarginProducts.length > 0) actions.push('Ajusta los productos que están por debajo de su margen mínimo.');
  if (overdueOperationalItems > 0) actions.push('Completa o reprograma seguimientos y actividades vencidas.');
  if (!actions.length) actions.push('Mantén el ritmo actual y revisa semanalmente margen, cobros y crecimiento.');

  const explanation = status === 'Saludable'
    ? 'El negocio mantiene una combinación sólida de rentabilidad, cobranza y ejecución.'
    : status === 'Inestable'
      ? 'Hay señales saludables, pero uno o más factores requieren atención para estabilizar el negocio.'
      : 'La salud del negocio necesita acción prioritaria en los factores con menor puntuación.';

  return {
    score,
    status,
    hasSufficientData: true,
    explanation,
    factors,
    positiveFactors,
    riskFactors,
    actions: actions.slice(0, 4),
    context: {
      lowMarginProducts: lowMarginProducts.length,
      lossProducts: lossProducts.length,
      overdueAmount: roundMoney(overdueAmount),
      overdueOperationalItems: Number(overdueOperationalItems || 0),
      collectionRate,
      expenseRatio,
    },
  };
}


function normalizedName(value = '') {
  return `${value || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildTopProducts({
  products = [],
  invoices = [],
  orderItems = [],
  criterion = 'sales',
} = {}) {
  const productsById = new Map(products.filter((item) => item?.id).map((item) => [item.id, item]));
  const productsByName = new Map(products
    .filter((item) => item?.name)
    .map((item) => [normalizedName(item.name), item]));
  const activeInvoices = invoices.filter((invoice) => !isCanceled(invoice));
  const invoicedOrderIds = new Set(activeInvoices.filter((invoice) => invoice.order_id).map((invoice) => invoice.order_id));
  const metrics = new Map();

  const add = ({ productId = null, name, revenue = 0, quantity = 0, cost = null, profit = null }) => {
    const normalized = normalizedName(name);
    if (!normalized) return;
    const matchedProduct = productId ? productsById.get(productId) : productsByName.get(normalized);
    const key = matchedProduct?.id || normalized;
    const current = metrics.get(key) || {
      id: matchedProduct?.id || productId || null,
      name: matchedProduct?.name || name || 'Producto',
      revenue: 0,
      quantity: 0,
      knownCost: 0,
      costCoverageRevenue: 0,
      transactions: 0,
      knownProfit: 0,
      profitCoverageRevenue: 0,
    };

    const safeRevenue = roundMoney(revenue);
    current.revenue = roundMoney(current.revenue + safeRevenue);
    current.quantity += Number(quantity || 0);
    current.transactions += 1;
    if (cost != null && Number.isFinite(Number(cost))) {
      current.knownCost = roundMoney(current.knownCost + Number(cost || 0));
      current.costCoverageRevenue = roundMoney(current.costCoverageRevenue + safeRevenue);
    }
    if (profit != null && Number.isFinite(Number(profit))) {
      current.knownProfit = roundMoney(current.knownProfit + Number(profit || 0));
      current.profitCoverageRevenue = roundMoney(current.profitCoverageRevenue + safeRevenue);
    }
    metrics.set(key, current);
  };

  orderItems
    .filter((item) => invoicedOrderIds.has(item.order_id))
    .forEach((item) => {
      const quantity = Number(item.quantity || 0);
      const revenue = Number(item.total || (quantity * Number(item.unit_price || 0)) || 0);
      const unitCost = Number(item.unit_cost_snapshot || 0);
      const hasCostSnapshot = unitCost > MONEY_EPSILON;
      const unitProfit = Number(item.unit_profit_snapshot);
      add({
        productId: item.product_id || null,
        name: item.description || item.item_description || productsById.get(item.product_id)?.name,
        revenue,
        quantity,
        cost: hasCostSnapshot ? quantity * unitCost : null,
        profit: Number.isFinite(unitProfit) ? quantity * unitProfit : null,
      });
    });

  activeInvoices
    .filter((invoice) => !invoice.order_id)
    .forEach((invoice) => {
      const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
      lineItems.forEach((item) => {
        const quantity = Number(item.quantity ?? 1);
        const revenue = Number(item.total ?? (quantity * Number(item.unit_price || item.price || 0)));
        const productId = item.product_id || null;
        const name = item.description || item.name || productsById.get(productId)?.name || 'Producto';
        const snapshotCost = Number(item.unit_cost_snapshot ?? item.unit_cost ?? item.cost ?? 0);
        const snapshotProfit = Number(item.unit_profit_snapshot);
        add({
          productId,
          name,
          revenue,
          quantity,
          cost: snapshotCost > MONEY_EPSILON ? quantity * snapshotCost : null,
          profit: Number.isFinite(snapshotProfit) ? quantity * snapshotProfit : null,
        });
      });
    });

  const rows = Array.from(metrics.values()).map((item) => {
    const hasProfitSnapshots = item.profitCoverageRevenue > MONEY_EPSILON;
    const profit = hasProfitSnapshots
      ? roundMoney(item.knownProfit)
      : item.costCoverageRevenue > MONEY_EPSILON
        ? roundMoney(item.costCoverageRevenue - item.knownCost)
        : null;
    const profitRevenueBase = hasProfitSnapshots ? item.profitCoverageRevenue : item.costCoverageRevenue;
    const margin = profit != null && profitRevenueBase > MONEY_EPSILON
      ? (profit / profitRevenueBase) * 100
      : null;
    return {
      ...item,
      profit,
      margin,
      costCoverageComplete: item.costCoverageRevenue + MONEY_EPSILON >= item.revenue,
    };
  });

  const sorter = criterion === 'profit'
    ? (a, b) => Number(b.profit ?? -Infinity) - Number(a.profit ?? -Infinity)
    : criterion === 'margin'
      ? (a, b) => Number(b.margin ?? -Infinity) - Number(a.margin ?? -Infinity)
      : (a, b) => b.revenue - a.revenue;

  return rows.sort(sorter).slice(0, 5);
}

export function buildDashboardOperations({
  quotes = [],
  orders = [],
  orderStatuses = [],
  now = new Date(),
} = {}) {
  const pendingQuoteStatuses = new Set(['pending', 'draft', 'sent']);
  const pendingQuotes = quotes.filter((quote) => pendingQuoteStatuses.has(`${quote.status || ''}`.toLowerCase()));

  const terminalCodes = new Set(
    orderStatuses
      .filter((status) => status.is_terminal)
      .map((status) => status.code)
  );

  const today = startOfLocalDay(now);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 14);

  const upcomingOrders = orders
    .filter((order) => !terminalCodes.has(order.operational_status))
    .map((order) => {
      const targetDateValue = order.commitment_date || order.estimated_delivery_date || order.event_date || null;
      const targetDate = targetDateValue ? new Date(`${targetDateValue}T00:00:00`) : null;
      return { order, targetDate };
    })
    .filter(({ targetDate }) => targetDate && !Number.isNaN(targetDate.getTime()) && targetDate >= today && targetDate <= horizon)
    .sort((a, b) => a.targetDate - b.targetDate);

  return {
    pendingQuotes,
    pendingQuotesCount: pendingQuotes.length,
    upcomingOrders,
    upcomingOrdersCount: upcomingOrders.length,
  };
}

function startOfLocalDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

const CURRENCY_SYMBOLS = {
  USD: 'US$',
  DOP: 'RD$',
  EUR: '€',
};

function normalizeCurrency(currency = 'USD') {
  return `${currency || 'USD'}`.trim().toUpperCase();
}

function normalizeAmount(amount) {
  const numeric = Number(amount);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatCurrencyAmount(amount, currency = 'USD') {
  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedAmount = normalizeAmount(amount);
  const symbol = CURRENCY_SYMBOLS[normalizedCurrency];
  const hasCents = Math.abs(normalizedAmount % 1) > 0;

  const formattedAmount = normalizedAmount.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });

  if (symbol) {
    return `${symbol}${formattedAmount}`;
  }

  return `${normalizedCurrency} ${formattedAmount}`;
}

export function formatRecurringPrice(amount, currency = 'USD', period = '/mes') {
  return `${formatCurrencyAmount(amount, currency)}${period}`;
}

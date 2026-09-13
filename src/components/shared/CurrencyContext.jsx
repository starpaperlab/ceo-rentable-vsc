import React, { createContext, useContext, useEffect, useState } from 'react';

const CurrencyContext = createContext();

const FALLBACK_SYMBOLS = {
  USD: '$',
  EUR: '€',
  DOP: 'RD$',
  MXN: 'MX$',
  COP: 'COL$',
  GBP: '£',
  JPY: '¥',
  CNY: 'CN¥',
  CAD: 'CA$',
  AUD: 'A$',
  BRL: 'R$',
};

export function getCurrencySymbol(currency = 'USD') {
  try {
    const parts = new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).formatToParts(0);

    return parts.find((part) => part.type === 'currency')?.value
      || FALLBACK_SYMBOLS[currency]
      || currency;
  } catch {
    return FALLBACK_SYMBOLS[currency] || currency;
  }
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    const saved = localStorage.getItem('ceo_currency');
    if (saved) setCurrency(saved);
  }, []);

  const updateCurrency = (nextCurrency) => {
    setCurrency(nextCurrency);
    localStorage.setItem('ceo_currency', nextCurrency);
  };

  const formatMoney = (amount) => {
    const numeric = Number(amount ?? 0);
    const safeAmount = Number.isFinite(numeric) ? numeric : 0;
    const symbol = getCurrencySymbol(currency);
    const formatted = Math.abs(safeAmount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    return safeAmount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency: updateCurrency,
        formatMoney,
        symbol: getCurrencySymbol(currency),
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

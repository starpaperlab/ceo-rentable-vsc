import React, { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  DOP: 'RD$',
  MXN: 'MX$',
  COP: 'COL$'
};

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    const saved = localStorage.getItem('ceo_currency');
    if (saved) setCurrency(saved);
  }, []);

  const updateCurrency = (c) => {
    setCurrency(c);
    localStorage.setItem('ceo_currency', c);
  };

  const formatMoney = (amount) => {
    if (amount === null || amount === undefined) return `${CURRENCY_SYMBOLS[currency]}0`;
    const sym = CURRENCY_SYMBOLS[currency];
    const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return amount < 0 ? `-${sym}${formatted}` : `${sym}${formatted}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: updateCurrency, formatMoney, symbol: CURRENCY_SYMBOLS[currency] }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
import React, { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

const FALLBACK_SYMBOLS = {
  USD: '

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
    const numeric = Number(amount ?? 0);
    const symbol = getCurrencySymbol(currency);
    const formatted = Math.abs(Number.isFinite(numeric) ? numeric : 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return numeric < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: updateCurrency, formatMoney, symbol: getCurrencySymbol(currency) }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
},
  EUR: '€',
  DOP: 'RD

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
},
  MXN: 'MX

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
},
  COP: 'COL

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
},
  GBP: '£',
  JPY: '¥',
  CNY: 'CN¥',
  CAD: 'CA

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
},
  AUD: 'A

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
},
  BRL: 'R

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
},
};

export function getCurrencySymbol(currency = 'USD') {
  try {
    const parts = new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value || FALLBACK_SYMBOLS[currency] || currency;
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
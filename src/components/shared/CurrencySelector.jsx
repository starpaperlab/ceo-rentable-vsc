import React from 'react';
import { getCurrencySymbol, useCurrency } from './CurrencyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FALLBACK_CURRENCIES = [
  'AED','ARS','AUD','BOB','BRL','CAD','CHF','CLP','CNY','COP','CRC','CUP','CZK','DKK','DOP','EGP',
  'EUR','GBP','GTQ','HKD','HNL','HUF','IDR','ILS','INR','ISK','JPY','KRW','MAD','MXN','NIO','NOK',
  'NZD','PAB','PEN','PHP','PLN','PYG','RON','SAR','SEK','SGD','THB','TRY','TWD','UAH','USD','UYU',
  'VES','VND','ZAR'
];

function supportedCurrencies() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('currency');
    }
  } catch {
    // Use fallback below.
  }
  return FALLBACK_CURRENCIES;
}

const CURRENCIES = supportedCurrencies()
  .map((code) => ({ code, symbol: getCurrencySymbol(code) }))
  .sort((a, b) => a.code.localeCompare(b.code));

export default function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();

  return (
    <Select value={currency} onValueChange={setCurrency}>
      <SelectTrigger className="h-9 w-24 border-border bg-card text-xs font-medium sm:w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {CURRENCIES.map(({ code, symbol }) => (
          <SelectItem key={code} value={code}>
            {code} ({symbol})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
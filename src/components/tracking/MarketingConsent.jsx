import { useState } from 'react';
import { getMarketingConsent, setMarketingConsent } from '@/lib/marketingConsent';

export default function MarketingConsent() {
  // Privacy-first and non-blocking: never open a banner automatically.
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(() => getMarketingConsent());
  const choose = (nextChoice) => {
    setMarketingConsent(nextChoice);
    setChoice(nextChoice);
    setOpen(false);
  };

  return (
    <div className="fixed bottom-3 left-3 z-[90] max-w-[calc(100vw-1.5rem)]">
      {open ? (
        <aside aria-label="Preferencias de medición publicitaria" className="w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-gray-200 bg-white p-3 text-gray-900 shadow-lg" role="dialog">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">Preferencias de cookies</h2>
            <button type="button" aria-label="Cerrar preferencias de cookies" className="rounded px-2 text-lg leading-none" onClick={() => setOpen(false)}>×</button>
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-700">La medición publicitaria es opcional. Puedes rechazarla sin afectar el uso de CEO Rentable. Consulta <a href="/cookies" className="underline">Cookies</a> y <a href="/privacidad" className="underline">Privacidad</a>.</p>
          <div className="mt-3 flex flex-col gap-2">
            <button type="button" className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm font-semibold" onClick={() => choose('denied')}>Solo necesarias</button>
            <button type="button" className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm font-semibold" onClick={() => choose('granted')}>Permitir medición publicitaria</button>
          </div>
        </aside>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-gray-300 bg-white/95 px-2 py-1.5 text-xs text-gray-700 shadow-sm" aria-label="Abrir preferencias de cookies">
          {choice === null ? 'Cookies' : 'Preferencias de cookies'}
        </button>
      )}
    </div>
  );
}

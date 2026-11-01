import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { whopRequest } from '@/lib/whopService';
import { useAuth } from '@/lib/AuthContext';

export default function WhopPaymentResult() {
  const { refreshUserProfile } = useAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let timer; let count = 0;
    const poll = async () => {
      try {
        const status = await whopRequest('status', null, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResult(status); setError('');
        if (status.access) { await refreshUserProfile(); return; }
        if (['expired', 'cancelled', 'payment_failed'].includes(status.status)) return;
        if (++count < 12) timer = setTimeout(poll, 2500);
      } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt, refreshUserProfile]);
  const plan = result?.planCode || (new URLSearchParams(window.location.search).get('plan') === 'monthly' ? 'monthly' : 'annual');
  return <main className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4 py-8"><section className="w-full max-w-md space-y-5 rounded-3xl border border-[#F0D4DF] bg-white p-8 text-center shadow-xl" aria-live="polite">
    <img src="/brand/isotipo.png" alt="CEO Rentable OS" className="mx-auto h-12 w-12" />
    <h1 className="text-2xl font-black text-gray-900">{result?.access ? result.trialActive ? 'Tu prueba gratuita está activa' : 'Tu suscripción está activa' : 'Verificando tu suscripción'}</h1>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <p className="text-sm leading-6 text-gray-600">{result?.access ? `CEO Rentable confirmó tu plan ${plan === 'monthly' ? 'mensual' : 'anual'} con Whop.` : 'Todavía no tenemos una confirmación de acceso. La verificación puede tardar unos segundos; volver a esta página no activa la cuenta.'}</p>}
    {result?.trialActive && <p className="text-sm text-gray-600">Prueba hasta el {new Date(result.trialEnd).toLocaleDateString('es-DO')}.</p>}
    {result?.access ? <Link className="block rounded-xl bg-[#D45387] px-5 py-3.5 font-bold text-white" to="/Dashboard">Entrar al dashboard</Link> : <><button type="button" className="w-full rounded-xl bg-[#D45387] px-5 py-3.5 font-bold text-white" onClick={()=>setAttempt(value=>value+1)}>Volver a verificar</button><Link className="block text-sm font-semibold text-[#D45387]" to={`/checkout?plan=${plan}`}>Volver al checkout o reintentar</Link><Link className="block text-sm text-gray-600" to={`/login?plan=${plan}`}>Iniciar sesión</Link></>}
  </section></main>;
}

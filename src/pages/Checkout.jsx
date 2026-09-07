import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { CHECKOUT_PLANS, getCheckoutPlan, isRecurringCheckoutPlan } from '@/lib/checkoutPlans';
import { useAuth } from '@/lib/AuthContext';
import { verifyPayPalSubscription } from '@/lib/paypalService';
import PayPalSubscriptionButton from '@/components/payments/PayPalSubscriptionButton';

const fieldClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#D45387] focus:ring-2 focus:ring-[#D45387]/15 disabled:bg-gray-50 disabled:text-gray-500';
const legalLinkClass = 'font-semibold text-[#D45387] underline decoration-[#D45387]/30 underline-offset-2 hover:decoration-[#D45387]';
const CHECKOUT_CONSENT_KEY = 'ceo-rentable-checkout-consent';

const INITIAL_FORM = {
  firstName: '', lastName: '', email: '', businessName: '', phone: '', country: 'DO', password: '', confirmPassword: '',
};

function PlanSelector({ plan, onSelect, disabled = false, compact = false }) {
  return <div className={`grid grid-cols-2 ${compact ? 'gap-2.5' : 'gap-3'}`} role="radiogroup" aria-label="Frecuencia de facturación">
    {Object.values(CHECKOUT_PLANS).map((option) => {
      const isSelected = option.code === plan.code;
      const isAnnual = option.code === 'annual';
      return <button key={option.code} type="button" role="radio" aria-checked={isSelected} onClick={() => onSelect(option.code)} disabled={disabled} className={`relative rounded-2xl border-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[#D45387]/30 disabled:opacity-60 ${compact ? 'min-h-[108px] p-3.5' : 'min-h-[126px] p-4'} ${isSelected ? 'border-[#D45387] bg-[#D45387]/5 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
        {isAnnual && <span className={`absolute right-2.5 rounded-full bg-[#D45387] font-black uppercase tracking-wide text-white shadow-sm ${compact ? '-top-2.5 px-2 py-0.5 text-[9px]' : '-top-3 px-2.5 py-1 text-[10px]'}`}>Mejor valor</span>}
        <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black text-gray-900">{option.name}</p><p className={`${compact ? 'mt-1.5 text-base' : 'mt-2 text-lg'} font-black text-gray-900`}>{option.renewalLabel}</p></div><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? 'border-[#D45387] bg-[#D45387] text-white' : 'border-gray-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" strokeWidth={3} /></span></div>
        <p className={`${compact ? 'mt-1.5' : 'mt-2'} text-xs leading-4 text-gray-500`}>{isAnnual ? option.monthlyEquivalentLabel : 'Facturación cada mes'}</p>
      </button>;
    })}
  </div>;
}

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userProfile, register, refreshUserProfile, isLoadingAuth } = useAuth();
  const requestedPlan = searchParams.get('plan');
  const selectedPlanCode = isRecurringCheckoutPlan(requestedPlan) ? requestedPlan : 'annual';
  const plan = getCheckoutPlan(selectedPlanCode) || getCheckoutPlan('annual');
  const [form, setForm] = useState(INITIAL_FORM);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [accountReady, setAccountReady] = useState(Boolean(user));
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [subscriptionConfirmed, setSubscriptionConfirmed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fullName = `${userProfile?.full_name || user.user_metadata?.full_name || ''}`.trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    setForm((current) => ({ ...current, firstName: current.firstName || parts[0] || '', lastName: current.lastName || parts.slice(1).join(' '), email: current.email || user.email || '', businessName: current.businessName || userProfile?.business_name || user.user_metadata?.business_name || '', phone: current.phone || userProfile?.phone || user.user_metadata?.phone || '' }));
    setAccountReady(true);
    try {
      const consent = JSON.parse(sessionStorage.getItem(CHECKOUT_CONSENT_KEY) || 'null');
      if (consent?.email === user.email && consent?.termsAccepted) {
        setTermsAccepted(true);
        setMarketingAccepted(Boolean(consent.marketingAccepted));
        setMessage('Cuenta lista. Continúa con PayPal para iniciar tu prueba gratis.');
      }
    } catch { /* session storage is optional */ }
  }, [user, userProfile]);

  const fullName = useMemo(() => `${form.firstName} ${form.lastName}`.replace(/\s+/g, ' ').trim(), [form.firstName, form.lastName]);
  const selectPlan = (planCode) => { const nextParams = new URLSearchParams(searchParams); nextParams.set('plan', planCode); setSearchParams(nextParams, { replace: true }); setError(''); setMessage(''); };
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const saveSignedInConsent = (nextTerms, nextMarketing) => {
    if (!user?.email) return;
    try {
      sessionStorage.setItem(CHECKOUT_CONSENT_KEY, JSON.stringify({
        email: user.email,
        termsAccepted: nextTerms,
        marketingAccepted: nextMarketing,
      }));
    } catch { /* session storage is optional */ }
  };
  const handleSignedInTermsChange = (checked) => {
    setTermsAccepted(checked);
    saveSignedInConsent(checked, marketingAccepted);
    setError('');
    setMessage(checked ? `Consentimiento actualizado. Ya puedes continuar con PayPal para iniciar tus ${plan.trialDays} días gratis.` : '');
  };
  const handleSignedInMarketingChange = (checked) => {
    setMarketingAccepted(checked);
    saveSignedInConsent(termsAccepted, checked);
  };
  const validateRegistration = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) throw new Error('Escribe tu nombre y apellido.');
    if (!form.email.trim()) throw new Error('Escribe tu correo electrónico.');
    if (!form.businessName.trim()) throw new Error('Escribe el nombre de tu empresa o marca.');
    if (form.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
    if (form.password !== form.confirmPassword) throw new Error('Las contraseñas no coinciden.');
    if (!termsAccepted) throw new Error('Debes aceptar los Términos y la Política de Privacidad.');
  };

  const handleCreateAccount = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (user) { setAccountReady(true); return; }
    try {
      validateRegistration(); setCreatingAccount(true);
      sessionStorage.setItem(CHECKOUT_CONSENT_KEY, JSON.stringify({ email: form.email.trim(), termsAccepted: true, marketingAccepted }));
      const result = await register({ email: form.email, password: form.password, fullName, businessName: form.businessName, phone: form.phone, emailRedirectTo: `${window.location.origin}/checkout?plan=${plan.code}` });
      if (result.needsEmailConfirmation) { setAccountReady(false); setMessage('Tu cuenta fue creada. Confirma tu correo y vuelve a este checkout para continuar con PayPal.'); return; }
      setAccountReady(true); setTermsAccepted(true); setMessage(`Cuenta creada. Continúa con PayPal para iniciar tus ${plan.trialDays} días gratis.`);
    } catch (registrationError) { setError(registrationError?.message || 'No pudimos crear tu cuenta.'); }
    finally { setCreatingAccount(false); }
  };

  const handleSubscriptionApproved = async ({ subscriptionId, planCode }) => {
    setError(''); setMessage('Confirmando tu suscripción con PayPal…'); setVerifyingPayment(true);
    try {
      const result = await verifyPayPalSubscription(subscriptionId, planCode);
      if (!result.success) throw new Error(result.error || 'No pudimos confirmar la suscripción.');
      setSubscriptionConfirmed(true);
      sessionStorage.removeItem(CHECKOUT_CONSENT_KEY);
      await refreshUserProfile?.();
      const params = new URLSearchParams({
        provider: 'paypal',
        plan: planCode,
        subscription_id: subscriptionId,
        trial_days: String(plan.trialDays),
      });
      navigate(`/payment-success?${params.toString()}`, { replace: true });
    } catch (verificationError) {
      setError(verificationError?.message || 'PayPal recibió la solicitud, pero no pudimos confirmar el acceso todavía.');
      setMessage('');
    }
    finally { setVerifyingPayment(false); }
  };

  const paymentDisabled = isLoadingAuth || !accountReady || !termsAccepted || subscriptionConfirmed || verifyingPayment;
  const planSelectionDisabled = verifyingPayment || subscriptionConfirmed;

  return <main className="min-h-screen bg-[#F7F3EE] px-3.5 py-5 sm:px-6 sm:py-8 lg:py-12"><div className="mx-auto max-w-6xl">
    <header className="mb-5 flex items-center justify-center gap-2.5 sm:mb-8 lg:justify-start"><img src="/brand/isotipo.png" alt="CEO Rentable OS" className="h-10 w-10 sm:h-11 sm:w-11" /><div><p className="text-base font-black text-gray-900 sm:text-lg">CEO Rentable OS</p><p className="text-[11px] text-gray-500 sm:text-xs">Checkout seguro</p></div></header>
    <div className="grid overflow-hidden rounded-[26px] border border-gray-200 bg-white shadow-xl sm:rounded-3xl lg:grid-cols-[1.15fr_0.85fr]">
      <section className="p-5 sm:p-9 lg:p-12">
        <div className="mb-5 sm:mb-8"><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#D45387] sm:mb-2 sm:text-sm">{user ? 'Cuenta lista' : 'Crea tu cuenta'}</p><h1 className="text-[28px] font-black leading-[1.05] text-gray-900 sm:text-3xl">Empieza tus {plan.trialDays} días gratis</h1><p className="mt-2 text-sm leading-5 text-gray-600 sm:leading-6">{user ? 'Revisa tu plan y continúa con PayPal. Hoy pagas US$0.' : 'Completa tus datos una sola vez. Después continuarás directamente con PayPal. Hoy pagas US$0.'}</p></div>
        <div className="mb-5 rounded-2xl border border-[#F0D4DF] bg-[#FFF8FB] p-3.5 lg:hidden"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-[#D45387]">Tu plan</p><p className="mt-0.5 text-sm font-black text-gray-900">Elige mensual o anual</p></div><p className="shrink-0 text-[11px] font-semibold text-gray-500">{plan.trialDays} días gratis</p></div><PlanSelector plan={plan} onSelect={selectPlan} disabled={planSelectionDisabled} compact /></div>
        {user && <div className={`mb-5 rounded-2xl px-4 py-3 text-sm leading-5 ${termsAccepted ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-amber-200 bg-amber-50 text-amber-900'}`}><CheckCircle2 className="mr-2 inline h-4 w-4" /><strong>{termsAccepted ? 'Cuenta verificada.' : 'Tu cuenta ya existe.'}</strong> {termsAccepted ? 'Continúa con PayPal para activar la prueba.' : 'Acepta los términos actuales para habilitar PayPal. No necesitas crear otra cuenta ni cambiar tu contraseña.'}</div>}
        <form className="space-y-4 sm:space-y-5" onSubmit={handleCreateAccount}>
          <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4"><label className="text-sm font-semibold text-gray-700">Nombre<input value={form.firstName} onChange={(e)=>updateField('firstName',e.target.value)} disabled={Boolean(user)} className={`${fieldClass} mt-1.5 sm:mt-2`} placeholder="Tu nombre" /></label><label className="text-sm font-semibold text-gray-700">Apellido<input value={form.lastName} onChange={(e)=>updateField('lastName',e.target.value)} disabled={Boolean(user)} className={`${fieldClass} mt-1.5 sm:mt-2`} placeholder="Tu apellido" /></label></div>
          <label className="block text-sm font-semibold text-gray-700">Correo electrónico<input value={form.email} onChange={(e)=>updateField('email',e.target.value)} disabled={Boolean(user)} type="email" className={`${fieldClass} mt-1.5 sm:mt-2`} placeholder="nombre@empresa.com" /></label>
          <label className="block text-sm font-semibold text-gray-700">Nombre de la empresa o marca<input value={form.businessName} onChange={(e)=>updateField('businessName',e.target.value)} disabled={Boolean(user)} className={`${fieldClass} mt-1.5 sm:mt-2`} placeholder="Ej. Dulce Studio" /></label>
          <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4"><label className="text-sm font-semibold text-gray-700">WhatsApp<input value={form.phone} onChange={(e)=>updateField('phone',e.target.value)} disabled={Boolean(user)} type="tel" className={`${fieldClass} mt-1.5 sm:mt-2`} placeholder="+1 809 000 0000" /></label><label className="text-sm font-semibold text-gray-700">País<select value={form.country} onChange={(e)=>updateField('country',e.target.value)} disabled={Boolean(user)} className={`${fieldClass} mt-1.5 sm:mt-2`}><option value="DO">República Dominicana</option><option value="US">Estados Unidos</option><option value="OTHER">Otro</option></select></label></div>
          {user && <div className="rounded-2xl border border-[#F0D4DF] bg-[#FFF8FB] p-4 sm:p-5"><p className="text-sm font-black text-gray-900">Actualiza tu consentimiento</p><p className="mt-1 text-xs leading-5 text-gray-600">Como tu cuenta fue creada antes de este checkout, solo necesitamos que revises y aceptes las políticas actuales. No te pediremos una contraseña nueva.</p><label className="mt-4 flex items-start gap-3 text-sm leading-5 text-gray-700"><input type="checkbox" checked={termsAccepted} onChange={(e)=>handleSignedInTermsChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#D45387]" /><span>Acepto los <a href="/terminos" target="_blank" rel="noreferrer" className={legalLinkClass}>Términos de Servicio</a> y la <a href="/privacidad" target="_blank" rel="noreferrer" className={legalLinkClass}>Política de Privacidad</a> de CEO Rentable.</span></label><label className="mt-3 flex items-start gap-3 text-sm leading-5 text-gray-600"><input type="checkbox" checked={marketingAccepted} onChange={(e)=>handleSignedInMarketingChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#D45387]" /><span>Quiero recibir novedades y consejos de CEO Rentable. <strong className="font-medium">Opcional.</strong></span></label><p className="mt-3 pl-7 text-xs leading-5 text-gray-500">Consulta también nuestra <a href="/cookies" target="_blank" rel="noreferrer" className={legalLinkClass}>Política de Cookies</a>.</p>{!termsAccepted && <p className="mt-3 text-xs font-semibold text-amber-700">Al aceptar los términos se habilitará el método de pago de PayPal.</p>}</div>}
          {!user && <><div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4"><label className="text-sm font-semibold text-gray-700">Contraseña<input value={form.password} onChange={(e)=>updateField('password',e.target.value)} type="password" className={`${fieldClass} mt-1.5 sm:mt-2`} placeholder="Mínimo 8 caracteres" /></label><label className="text-sm font-semibold text-gray-700">Confirmar contraseña<input value={form.confirmPassword} onChange={(e)=>updateField('confirmPassword',e.target.value)} type="password" className={`${fieldClass} mt-1.5 sm:mt-2`} placeholder="Repite tu contraseña" /></label></div><label className="flex items-start gap-3 text-sm leading-5 text-gray-600"><input type="checkbox" checked={termsAccepted} onChange={(e)=>setTermsAccepted(e.target.checked)} required className="mt-1 h-4 w-4 accent-[#D45387]" /><span>Acepto los <a href="/terminos" target="_blank" rel="noreferrer" className={legalLinkClass}>Términos de Servicio</a> y la <a href="/privacidad" target="_blank" rel="noreferrer" className={legalLinkClass}>Política de Privacidad</a> de CEO Rentable.</span></label><label className="flex items-start gap-3 text-sm leading-5 text-gray-600"><input type="checkbox" checked={marketingAccepted} onChange={(e)=>setMarketingAccepted(e.target.checked)} className="mt-1 h-4 w-4 accent-[#D45387]" /><span>Quiero recibir novedades y consejos de CEO Rentable. <strong className="font-medium">Opcional.</strong></span></label><p className="pl-7 text-xs leading-5 text-gray-500">Consulta también nuestra <a href="/cookies" target="_blank" rel="noreferrer" className={legalLinkClass}>Política de Cookies</a>.</p></>}
          {!accountReady && <button type="submit" disabled={creatingAccount} className="w-full rounded-xl bg-[#D45387] px-5 py-3.5 text-sm font-black text-white disabled:opacity-60">{creatingAccount ? 'Creando cuenta…' : 'Crear cuenta y continuar con PayPal'}</button>}
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">{message}</div>}{error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{error}</div>}
        </form>
      </section>
      <aside className="border-t border-gray-200 bg-gray-50 p-5 sm:p-9 lg:border-l lg:border-t-0 lg:p-10"><div className="lg:sticky lg:top-8">
        <div className="mb-5 hidden lg:block"><p className="text-sm font-medium text-gray-500">Tu plan</p><h2 className="mt-1 text-xl font-black text-gray-900">Elige cómo continuar después de tu prueba</h2></div><div className="mb-6 hidden lg:block"><PlanSelector plan={plan} onSelect={selectPlan} disabled={planSelectionDisabled} /></div>
        <div className="mb-3 sm:mb-4"><p className="text-xs text-gray-500 sm:text-sm">Plan seleccionado</p><h3 className="text-xl font-black text-gray-900 sm:text-2xl">CEO Rentable {plan.name}</h3></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between border-b border-gray-100 pb-4"><span className="font-semibold text-gray-700">Prueba gratis</span><strong>{plan.trialDays} días</strong></div><div className="flex items-center justify-between py-4"><span className="font-semibold text-gray-700">Hoy pagas</span><strong className="text-2xl">US$0</strong></div><div className="border-t border-gray-100 pt-4"><p className="text-sm text-gray-500">Después de la prueba</p><p className="mt-1 text-2xl font-black">{plan.renewalLabel}</p><p className="mt-1 text-xs text-gray-500">Renovación automática. Cancela antes de finalizar la prueba para evitar el primer cobro.</p></div></div>
        {plan.code === 'annual' && <div className="mt-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" /><span><strong>Ahorras US${plan.savingsAmount} al año.</strong> Frente a 12 pagos mensuales.</span></div>}
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 sm:mt-6 sm:p-5"><div className="mb-4 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-gray-500" /><h3 className="font-bold">Método de pago</h3></div>{subscriptionConfirmed ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center text-sm text-emerald-800"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />PayPal confirmó tu suscripción.<button type="button" onClick={()=>navigate('/payment-success')} className="mt-3 block w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-bold text-white">Continuar</button></div> : <PayPalSubscriptionButton plan={plan} disabled={paymentDisabled} onApproved={handleSubscriptionApproved} onError={()=>setError('No pudimos abrir PayPal. Inténtalo nuevamente.')} />}</div>
        <div className="mt-4 flex items-start gap-3 text-xs leading-5 text-gray-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Tu método de pago se procesa con PayPal. CEO Rentable no almacena los datos de tu tarjeta.</p></div><p className="mt-5 text-center text-xs text-gray-400">¿Ya tienes cuenta? <Link to={`/login?plan=${plan.code}`} className="font-semibold text-[#D45387]">Inicia sesión</Link></p>
      </div></aside>
    </div>
  </div></main>;
}

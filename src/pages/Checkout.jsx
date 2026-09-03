import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getCheckoutPlan } from '@/lib/checkoutPlans';

const fieldClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#D45387] focus:ring-2 focus:ring-[#D45387]/15';

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const requestedPlan = searchParams.get('plan') || 'monthly';
  const plan = getCheckoutPlan(requestedPlan) || getCheckoutPlan('monthly');

  return (
    <main className="min-h-screen bg-[#F7F3EE] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-center gap-3 lg:justify-start">
          <img src="/brand/isotipo.png" alt="CEO Rentable OS" className="h-11 w-11" />
          <div>
            <p className="text-lg font-black text-gray-900">CEO Rentable OS</p>
            <p className="text-xs text-gray-500">Checkout seguro</p>
          </div>
        </header>

        <div className="grid overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl lg:grid-cols-[1.15fr_0.85fr]">
          <section className="p-6 sm:p-9 lg:p-12">
            <div className="mb-8">
              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[#D45387]">Crea tu cuenta</p>
              <h1 className="text-3xl font-black text-gray-900">Empieza tus 7 días gratis</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">Completa tus datos. No realizaremos ningún cobro hoy.</p>
            </div>

            <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-gray-700">Nombre<input className={`${fieldClass} mt-2`} autoComplete="given-name" placeholder="Tu nombre" /></label>
                <label className="text-sm font-semibold text-gray-700">Apellido<input className={`${fieldClass} mt-2`} autoComplete="family-name" placeholder="Tu apellido" /></label>
              </div>
              <label className="block text-sm font-semibold text-gray-700">Correo electrónico<input type="email" className={`${fieldClass} mt-2`} autoComplete="email" placeholder="nombre@empresa.com" /></label>
              <label className="block text-sm font-semibold text-gray-700">Nombre de la empresa o marca<input className={`${fieldClass} mt-2`} autoComplete="organization" placeholder="Ej. Dulce Studio" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-gray-700">WhatsApp<input type="tel" className={`${fieldClass} mt-2`} autoComplete="tel" placeholder="+1 809 000 0000" /></label>
                <label className="text-sm font-semibold text-gray-700">País<select className={`${fieldClass} mt-2`} defaultValue="DO"><option value="DO">República Dominicana</option><option value="US">Estados Unidos</option><option value="OTHER">Otro</option></select></label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-gray-700">Contraseña<input type="password" className={`${fieldClass} mt-2`} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
                <label className="text-sm font-semibold text-gray-700">Confirmar contraseña<input type="password" className={`${fieldClass} mt-2`} autoComplete="new-password" placeholder="Repite tu contraseña" /></label>
              </div>

              <label className="flex items-start gap-3 text-sm leading-5 text-gray-600"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#D45387]" /><span>Acepto los Términos de Servicio y la Política de Privacidad de CEO Rentable.</span></label>
              <label className="flex items-start gap-3 text-sm leading-5 text-gray-600"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#D45387]" /><span>Quiero recibir novedades y consejos de CEO Rentable. <strong className="font-medium">Opcional.</strong></span></label>
            </form>
          </section>

          <aside className="border-t border-gray-200 bg-gray-50 p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-10">
            <div className="lg:sticky lg:top-8">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div><p className="text-sm text-gray-500">Tu plan</p><h2 className="text-2xl font-black text-gray-900">CEO Rentable {plan.name}</h2></div>
                {plan.badge && <span className="rounded-full bg-[#D45387]/10 px-3 py-1 text-xs font-bold text-[#D45387]">{plan.badge}</span>}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4"><span className="font-semibold text-gray-700">Prueba gratis</span><strong className="text-gray-900">7 días</strong></div>
                <div className="flex items-center justify-between py-4"><span className="font-semibold text-gray-700">Hoy pagas</span><strong className="text-2xl text-gray-900">US$0</strong></div>
                <div className="border-t border-gray-100 pt-4"><p className="text-sm text-gray-500">Después de la prueba</p><p className="mt-1 text-2xl font-black text-gray-900">{plan.renewalLabel}</p><p className="mt-1 text-xs text-gray-500">Renovación automática. Cancela antes de finalizar la prueba para evitar el primer cobro.</p></div>
              </div>

              {plan.code === 'annual' && <div className="mt-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" /><span><strong>Ahorras US$42 al año.</strong> Equivale a 2 meses gratis frente al plan mensual.</span></div>}

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-gray-500" /><h3 className="font-bold text-gray-900">Método de pago</h3></div>
                <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center"><p className="font-bold text-[#003087]">PayPal</p><p className="mt-1 text-xs text-gray-500">El botón seguro de suscripción aparecerá aquí cuando conectemos los Billing Plan IDs de Sandbox.</p></div>
              </div>

              <div className="mt-5 flex items-start gap-3 text-xs leading-5 text-gray-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Tu método de pago se procesa con PayPal. CEO Rentable no almacena los datos de tu tarjeta.</p></div>
              <p className="mt-6 text-center text-xs text-gray-400">¿Ya tienes cuenta? <Link to="/login" className="font-semibold text-[#D45387]">Inicia sesión</Link></p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

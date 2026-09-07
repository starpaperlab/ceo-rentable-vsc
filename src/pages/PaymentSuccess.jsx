import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { capturePayPalOrder } from '@/lib/paypalService';
import { useAuth } from '@/lib/AuthContext';
import { CheckCircle, Loader2, ArrowRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { getLoginPath, normalizeCheckoutPlan } from '@/lib/pendingCheckout';
import { getCheckoutPlan } from '@/lib/checkoutPlans';
import { trackPurchase } from '@/lib/metaPixel';

const AUTH_SESSION_ERROR = 'No pudimos validar tu sesión. Inicia sesión nuevamente para continuar.';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const { refreshUserProfile } = useAuth();
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [planCode, setPlanCode] = useState(null);
  const [message, setMessage] = useState('Confirmando tu acceso...');
  const [isSubscriptionFlow, setIsSubscriptionFlow] = useState(false);
  const [trialDays, setTrialDays] = useState(21);
  const hasProcessedRef = useRef(false);
  const hasTrackedPurchaseRef = useRef(false);

  const checkoutPlan = planCode ? getCheckoutPlan(planCode) : null;
  const planLabel = checkoutPlan?.name || (planCode === 'founder_lifetime' ? 'Founder Lifetime' : 'seleccionado');

  useEffect(() => {
    const verifyAccess = async () => {
      if (hasProcessedRef.current) return;
      hasProcessedRef.current = true;

      const params = new URLSearchParams(window.location.search);
      const nextProvider = `${params.get('provider') || 'paypal'}`.trim().toLowerCase();
      const orderId = `${params.get('order_id') || params.get('orderId') || params.get('token') || ''}`.trim();
      const subscriptionId = `${params.get('subscription_id') || ''}`.trim();
      const nextPlanCode = normalizeCheckoutPlan(params.get('plan'));
      const requestedTrialDays = Number(params.get('trial_days'));

      setIsSubscriptionFlow(Boolean(subscriptionId));
      if (nextPlanCode) setPlanCode(nextPlanCode);
      if (Number.isFinite(requestedTrialDays) && requestedTrialDays > 0) setTrialDays(requestedTrialDays);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user;
      if (sessionError || !currentUser) throw new Error(AUTH_SESSION_ERROR);
      setUser(currentUser);

      if (nextProvider === 'paypal' && orderId) {
        setMessage('Procesando confirmación segura de PayPal...');
        const capture = await capturePayPalOrder(orderId);
        if (!capture.success) {
          setMessage(capture.error || 'No pudimos confirmar el pago con PayPal.');
          setStatus('error');
          return;
        }
        const normalizedCapturePlan = normalizeCheckoutPlan(capture.planCode);
        const resolvedPlanCode = normalizedCapturePlan || nextPlanCode || planCode || null;
        if (normalizedCapturePlan) setPlanCode(normalizedCapturePlan);

        if (!hasTrackedPurchaseRef.current && `${capture.status || ''}`.toLowerCase() === 'completed') {
          hasTrackedPurchaseRef.current = true;
          trackPurchase(resolvedPlanCode, capture.captureId || orderId || null, { value: capture.amount, currency: capture.currency });
        }

        setMessage('Actualizando tu acceso...');
        const refreshedProfile = await refreshUserProfile();
        if (!refreshedProfile?.has_access) {
          setMessage('El pago fue confirmado, pero tu acceso aún se está actualizando.');
          setStatus('pending');
          return;
        }
        setStatus('success');
        return;
      }

      setMessage(subscriptionId ? 'Verificando tu prueba gratuita...' : 'Verificando tu acceso...');
      const { data: profile } = await supabase.from('users').select('has_access, plan').eq('id', currentUser.id).maybeSingle();
      if (normalizeCheckoutPlan(profile?.plan)) setPlanCode(normalizeCheckoutPlan(profile.plan));

      const { data: subscription } = await supabase.from('subscriptions').select('status').eq('user_id', currentUser.id).in('status', ['active', 'trialing']).maybeSingle();
      if (profile?.has_access || subscription) {
        setStatus('success');
        return;
      }
      setStatus('pending');
    };

    verifyAccess().catch((error) => {
      setMessage(error?.message || 'No pudimos verificar tu acceso.');
      setStatus('error');
    });
  }, [refreshUserProfile]);

  const goToDashboard = () => navigate('/Dashboard', { replace: true });
  const goToLogin = () => navigate(getLoginPath(planCode, { mode: 'login' }), { replace: true });

  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4"><div className="text-center space-y-4"><Loader2 className="h-10 w-10 animate-spin text-[#D45387] mx-auto" /><p className="text-gray-600 text-sm">{message}</p></div></div>;
  if (status === 'error') return <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4"><Card className="p-8 max-w-md text-center space-y-4"><p className="text-lg font-bold">No pudimos terminar la verificación</p><p className="text-sm text-gray-600">{message}</p><Button variant="outline" onClick={goToLogin}>Ir a iniciar sesión</Button></Card></div>;
  if (status === 'pending') return <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4"><Card className="p-8 max-w-md text-center space-y-4"><Loader2 className="h-8 w-8 animate-spin text-[#D45387] mx-auto" /><p className="text-lg font-bold">Tu acceso se está terminando de activar</p><p className="text-sm text-gray-600">PayPal ya confirmó la operación. Estamos terminando de activar tu acceso a CEO Rentable.</p><Button variant="outline" onClick={goToLogin}>Ir a iniciar sesión</Button></Card></div>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-4 py-8">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }} className="max-w-md w-full">
        <Card className="overflow-hidden border-[#F0D4DF] shadow-xl">
          <div className="bg-[#FFF8FB] px-8 py-10 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 200 }} className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </motion.div>
            <p className="text-xs font-black uppercase tracking-widest text-[#D45387]">¡Gracias por confiar en CEO Rentable!</p>
            <h1 className="mt-2 text-3xl font-black text-gray-900">{isSubscriptionFlow ? `Tu prueba de ${trialDays} días está lista` : 'Tu acceso está listo'}</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">{isSubscriptionFlow ? `Tu plan ${planLabel} fue verificado correctamente. Hoy pagaste US$0.` : `Tu plan ${planLabel} fue verificado correctamente.`}</p>
          </div>

          <div className="space-y-5 px-8 py-8">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-left">
              <div className="flex gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#D45387]" />
                <div>
                  <p className="font-bold text-gray-900">¿Cómo entro ahora?</p>
                  <p className="mt-1 text-sm leading-6 text-gray-600">Entra con el mismo correo y contraseña de tu cuenta de CEO Rentable.</p>
                  {user?.email && <p className="mt-2 break-all text-xs font-semibold text-gray-500">Correo de acceso: {user.email}</p>}
                </div>
              </div>
            </div>

            <Button size="lg" className="w-full bg-[#D45387] hover:bg-[#C2477B] text-white font-bold" onClick={goToLogin}>Entrar a CEO Rentable<ArrowRight className="h-5 w-5 ml-2" /></Button>
            <button type="button" onClick={goToDashboard} className="w-full text-sm font-semibold text-gray-500 hover:text-gray-800">Ya inicié sesión, ir al dashboard</button>
            <p className="text-center text-xs leading-5 text-gray-400">¿No recuerdas tu contraseña? Puedes restablecerla desde la pantalla de inicio de sesión.</p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

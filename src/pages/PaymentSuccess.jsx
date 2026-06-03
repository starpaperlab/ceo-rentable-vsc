import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { capturePayPalOrder } from '@/lib/paypalService';
import { useAuth } from '@/lib/AuthContext';
import { CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const { refreshUserProfile } = useAuth();
  const [status, setStatus] = useState('loading'); // loading | success | pending | error
  const [user, setUser] = useState(null);
  const [provider, setProvider] = useState('paypal');
  const [planCode, setPlanCode] = useState(null);
  const [message, setMessage] = useState('Confirmando tu pago...');
  const hasProcessedRef = useRef(false);

  const planLabel =
    planCode === 'founder_lifetime'
      ? 'Founder Lifetime'
      : planCode === 'monthly'
        ? 'Mensual'
        : 'suscripción';

  useEffect(() => {
    const verifyAccess = async () => {
      if (hasProcessedRef.current) return;
      hasProcessedRef.current = true;

      const params = new URLSearchParams(window.location.search);
      const nextProvider = `${params.get('provider') || 'paypal'}`.trim().toLowerCase();
      const orderId = `${params.get('order_id') || params.get('orderId') || params.get('token') || ''}`.trim();
      const nextPlanCode = `${params.get('plan') || ''}`.trim().toLowerCase();
      setProvider(nextProvider || 'paypal');
      if (['founder_lifetime', 'monthly'].includes(nextPlanCode)) {
        setPlanCode(nextPlanCode);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user;
      if (sessionError || !currentUser) {
        throw new Error('No se pudo obtener sesión')
      }

      setUser(currentUser);

      if (nextProvider === 'paypal' && orderId) {
        setStatus('loading');
        setMessage('Procesando confirmación segura de PayPal...');
        const capture = await capturePayPalOrder(orderId);
        if (!capture.success) {
          setMessage(capture.error || 'No pudimos confirmar el pago con PayPal.');
          setStatus('error');
          return;
        }
        if (['founder_lifetime', 'monthly'].includes(capture.planCode)) {
          setPlanCode(capture.planCode);
        }

        setMessage('Actualizando tu acceso...');
        const refreshedProfile = await refreshUserProfile();
        if (!refreshedProfile?.has_access) {
          setMessage('El pago fue confirmado, pero tu acceso aún no aparece actualizado. Intenta entrar al dashboard en unos segundos.');
          setStatus('pending');
          return;
        }

        setStatus('success');
        return;
      }

      setMessage('Verificando tu acceso...');
      const { data: profile } = await supabase
        .from('users')
        .select('has_access, plan')
        .eq('id', currentUser.id)
        .maybeSingle();
      if (['founder_lifetime', 'monthly'].includes(profile?.plan)) {
        setPlanCode(profile.plan);
      }

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', currentUser.id)
        .in('status', ['active', 'trialing'])
        .maybeSingle();

      if (profile?.has_access || subscription) {
        setStatus('success');
        return;
      }

      setStatus('pending');
    };

    verifyAccess().catch((error) => {
      setMessage(error?.message || 'No pudimos verificar tu pago.');
      setStatus('error');
    });
  }, [refreshUserProfile]);

  const goToDashboard = () => {
    navigate('/Dashboard', { replace: true });
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="p-8 max-w-md text-center space-y-4">
          <p className="text-lg font-bold text-foreground">Algo salió mal</p>
          <p className="text-sm text-muted-foreground">{message || 'No pudimos verificar tu acceso automáticamente. Contacta soporte con tu recibo de pago.'}</p>
          <Button variant="outline" onClick={goToDashboard}>Ir al dashboard</Button>
        </Card>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-4">
        <Card className="p-8 max-w-md text-center space-y-4">
          <p className="text-lg font-bold text-foreground">Pago en verificación</p>
          <p className="text-sm text-muted-foreground">
            Estamos esperando confirmación segura de {provider === 'paypal' ? 'PayPal' : 'la pasarela de pago'}. Tu acceso se activará cuando el backend confirme la transacción.
          </p>
          <Button variant="outline" onClick={goToDashboard}>Ir al dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full"
      >
        <Card className="p-10 text-center space-y-6 border-green-300 dark:border-green-700 shadow-xl">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto"
          >
            <CheckCircle className="h-10 w-10 text-green-600" />
          </motion.div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">¡Pago exitoso!</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Bienvenida, <strong>{user?.full_name || user?.email}</strong>. Tu acceso a <strong>CEO Rentable OS™</strong> ya fue activado con tu plan <strong>{planLabel}</strong>.
            </p>
          </div>

          <div className="bg-muted/50 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tu acceso incluye</p>
            {['Dashboard financiero completo', 'Módulo de Facturación & Cotizaciones', 'Control de Inventario', 'Análisis de Rentabilidad', 'Reportes exportables'].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>

          <Button
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            onClick={goToDashboard}
          >
            Entrar al Dashboard
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function PaymentSuccess() {
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [user, setUser] = useState(null);

  useEffect(() => {
    const activate = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user;
      if (sessionError || !currentUser) {
        throw new Error('No se pudo obtener sesión')
      }

      setUser(currentUser);

      const { error: profileError } = await supabase
        .from('users')
        .update({
          has_access: true,
          plan: 'founder',
          stripe_session_id: sessionId || null,
        })
        .eq('id', currentUser.id)

      if (profileError) {
        throw profileError
      }

      setStatus('success');
    };

    activate().catch(() => setStatus('error'));
  }, []);

  const goToDashboard = () => {
    window.location.href = '/Dashboard';
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Activando tu acceso...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="p-8 max-w-md text-center space-y-4">
          <p className="text-lg font-bold text-foreground">Algo salió mal</p>
          <p className="text-sm text-muted-foreground">No pudimos activar tu acceso automáticamente. Contacta soporte con tu recibo de Stripe.</p>
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
              Bienvenida, <strong>{user?.full_name || user?.email}</strong>. Tu acceso a <strong>CEO Rentable OS™</strong> ha sido activado con plan <span className="text-primary font-semibold">Lifetime</span>.
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
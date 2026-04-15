import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, ArrowLeft, Loader2 } from 'lucide-react';

export default function ManualPaymentConfirmation() {
  const navigate = useNavigate();
  const [step, setStep] = useState('form'); // 'form' | 'success'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !name) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .upsert({
          email: email.trim(),
          full_name: name.trim(),
          role: 'user',
          plan: 'subscription',
          has_access: true,
          created_at: new Date()
        }, { onConflict: 'email' })

      if (error) throw error

      setStep('success');
      setTimeout(() => navigate('/'), 3000);
    } catch (error) {
      toast.error('Error: ' + (error.message || 'No se pudo procesar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full"
      >
        <Card className="overflow-hidden shadow-xl border-border">
          {/* Top accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-primary via-secondary to-accent" />

          <div className="p-8 space-y-6">
            {step === 'form' && (
              <>
                {/* Header */}
                <div className="text-center space-y-2">
                  <img
                    src="/brand/isotipo.png"
                    alt="CEO Rentable OS"
                    className="w-12 h-12 object-contain mx-auto"
                  />
                  <h1 className="text-xl font-bold text-foreground">
                    Confirmar Pago Manual
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Proporciona tus datos y activaremos tu acceso
                  </p>
                </div>

                {/* Info box */}
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Hemos recibido tu transferencia. Completa este formulario para verificar tu identidad y activar el acceso inmediato.
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-xs font-semibold">
                      Nombre completo
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Juan Pérez García"
                      className="mt-1"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-xs font-semibold">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="juan@ejemplo.com"
                      className="mt-1"
                      disabled={loading}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10"
                    disabled={loading || !name || !email}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {loading ? 'Procesando...' : 'Confirmar y activar acceso'}
                  </Button>
                </form>

                {/* Back button */}
                <button
                  onClick={() => navigate('/')}
                  className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </button>
              </>
            )}

            {step === 'success' && (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <div className="space-y-2">
                  <h2 className="font-bold text-lg">¡Acceso activado!</h2>
                  <p className="text-sm text-muted-foreground">
                    Hemos enviado un email a <strong>{email}</strong> con los detalles de tu acceso.
                  </p>
                  <p className="text-xs text-muted-foreground pt-2">
                    Serás redirigido en 3 segundos...
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Acceso seguro · Verificación inmediata
        </p>
      </motion.div>
    </div>
  );
}
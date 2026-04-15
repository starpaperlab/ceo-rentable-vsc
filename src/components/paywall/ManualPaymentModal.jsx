import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Loader2, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function ManualPaymentModal({ onClose }) {
  const [step, setStep] = useState('confirm'); // 'confirm' | 'success'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const authUser = data?.session?.user || null;
      setCurrentUser(authUser);
      setEmail(authUser?.email || '');
      setName(authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || '');
    };

    loadSession();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (!email || !name) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (!currentUser?.id) {
      toast.error('Debes iniciar sesión para confirmar el pago.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sessionEmail = `${currentUser.email || ''}`.trim().toLowerCase();
    if (!sessionEmail || normalizedEmail !== sessionEmail) {
      toast.error('El correo debe coincidir con tu sesión activa.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('leads').insert({
        name: name.trim(),
        email: normalizedEmail,
        source: 'manual_payment',
        status: 'new',
      });

      if (error) throw error;
      setStep('success');
      setTimeout(() => onClose(), 3000);
    } catch (error) {
      toast.error('Error: ' + (error.message || 'No se pudo procesar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="w-full max-w-md p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Verificar pago manual</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {step === 'confirm' && (
            <>
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  Proporciona tus datos y registraremos la solicitud de validación manual del pago.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold">Nombre completo</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Juan Pérez"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan@ejemplo.com"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Enviar validación
                </Button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-bold text-lg">Solicitud enviada</h3>
              <p className="text-sm text-muted-foreground">
                Registramos la solicitud de validación manual para <strong>{email}</strong>. Te notificaremos cuando el acceso esté activo.
              </p>
              <p className="text-xs text-muted-foreground">Cerrando en 3 segundos...</p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

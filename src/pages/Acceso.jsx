import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Acceso() {
  const navigate = useNavigate();
  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full"
      >
        <Card className="overflow-hidden shadow-xl border-border">
          <div className="h-1.5 w-full bg-gradient-to-r from-primary via-secondary to-accent" />

          <div className="p-8 space-y-7 text-center">
            {/* Logo */}
            <div className="flex flex-col items-center gap-3">
              <img
                src="/brand/isotipo.png"
                alt="CEO Rentable OS"
                className="w-12 h-12 object-contain"
              />
              <p className="text-xs font-bold tracking-widest text-primary uppercase">CEO Rentable OS™</p>
            </div>

            {/* Icon + Title */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Pago recibido correctamente</h1>
                <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                  Ya puedes acceder a tu plataforma.
                </p>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-muted/50 rounded-xl px-5 py-4 text-sm text-muted-foreground leading-relaxed">
              Usa el correo con el que realizaste la compra para iniciar sesión.
            </div>

            {/* CTA */}
            <Button
              size="lg"
              onClick={handleLogin}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base h-12 shadow-md shadow-primary/20"
            >
              <LogIn className="h-5 w-5 mr-2" />
              Iniciar sesión
            </Button>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          ¿Tienes dudas? Escríbenos a{' '}
          <a href="mailto:hola@ceorentable.com" className="text-primary hover:underline">
            hola@ceorentable.com
          </a>
        </p>
      </motion.div>
    </div>
  );
}
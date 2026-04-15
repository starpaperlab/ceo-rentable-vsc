import React from 'react';
import { XCircle, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import BuyButton from '@/components/shared/BuyButton';

export default function PaymentCancel() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <Card className="p-10 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Tu acceso está a un paso</h1>
            <p className="text-muted-foreground text-sm mt-2">No se completó el pago, pero puedes finalizarlo ahora mismo y empezar a organizar tu negocio en minutos.</p>
          </div>
          <div className="space-y-3">
            <BuyButton label="Intentar de nuevo" className="w-full" />
            <Button variant="ghost" className="w-full" onClick={() => window.location.href = '/'}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Volver al inicio
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
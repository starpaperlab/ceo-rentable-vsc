import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, MessageCircle, LogOut, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

const WHATSAPP_URL =
  'https://wa.me/18092517070?text=Hola%2C%20quiero%20activar%20mi%20acceso%20a%20CEO%20Rentable%20OS';

export default function AccessBlocked() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-[#F7F3EE] via-white to-[#F7D8E5] px-4">
      <div className="max-w-md w-full p-8 bg-white rounded-3xl shadow-xl border border-[#EBC7D7]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-[#D45387]/10">
            <Lock className="w-8 h-8 text-[#D45387]" />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-4">Tu acceso aún no está activo</h1>
          <p className="text-slate-600 mb-8">
            Tu cuenta está creada, pero para continuar usando CEO Rentable OS necesitas activar un plan.
          </p>

          <div className="space-y-3">
            <Button
              className="w-full bg-[#D45387] hover:bg-[#bf477a] text-white"
              onClick={() => navigate('/paywall')}
            >
              Ver planes y activar acceso
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(WHATSAPP_URL, '_blank', 'noopener,noreferrer')}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Contactar por WhatsApp
            </Button>

            <Button variant="ghost" className="w-full text-slate-500" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

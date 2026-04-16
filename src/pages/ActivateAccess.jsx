import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CheckCircle2 } from 'lucide-react';

const BRAND_PRIMARY = '#D45387';
const BRAND_BG = '#F7F3EE';

function getInviteParams() {
  if (typeof window === 'undefined') {
    return { token: '', email: '' };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    token: `${params.get('invite') || ''}`.trim(),
    email: `${params.get('email') || ''}`.trim().toLowerCase(),
  };
}

export default function ActivateAccess() {
  const navigate = useNavigate();
  const invite = useMemo(() => getInviteParams(), []);

  const [form, setForm] = useState({
    fullName: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [activationDone, setActivationDone] = useState(false);

  const hasInvite = Boolean(invite.token && invite.email);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');

    if (!hasInvite) {
      setError('Este enlace no es valido. Solicita una nueva invitacion.');
      return;
    }

    if (form.password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/activate-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: invite.token,
          email: invite.email,
          fullName: form.fullName.trim() || null,
          password: form.password,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'No se pudo activar tu acceso.');
      }

      const signInResult = await supabase.auth.signInWithPassword({
        email: invite.email,
        password: form.password,
      });

      if (signInResult.error) {
        setInfo('Tu acceso fue activado. Te llevamos al login para entrar con tu nueva contrasena.');
        navigate(`/login?email=${encodeURIComponent(invite.email)}`, { replace: true });
        return;
      }

      setActivationDone(true);
    } catch (submitError) {
      setError(submitError?.message || 'No se pudo activar tu acceso.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoDashboard = () => {
    navigate('/', { replace: true });
  };

  useEffect(() => {
    if (!activationDone) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      navigate('/', { replace: true });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [activationDone, navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background: `radial-gradient(circle at top left, rgba(212, 83, 135, 0.12), transparent 30%), linear-gradient(135deg, ${BRAND_BG} 0%, #ffffff 52%, #f8dbe6 100%)`,
      }}
    >
      <div className="w-full max-w-md rounded-[24px] border border-white/70 bg-white/95 p-7 shadow-[0_24px_80px_rgba(212,83,135,0.16)]">
        <div className="text-center mb-6">
          <img
            src="/brand/isotipo.png"
            alt="CEO Rentable OS"
            className="w-14 h-14 mx-auto object-contain mb-3"
          />
          <h1 className="text-2xl font-bold text-slate-900">
            Activar Acceso
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Crea tu contrasena para activar tu cuenta en CEO Rentable OS.
          </p>
        </div>

        {activationDone ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Acceso activado correctamente</h2>
            <p className="mt-2 text-sm text-slate-600">
              Tu cuenta ya esta lista. Te estamos redirigiendo al dashboard.
            </p>
            <button
              type="button"
              onClick={handleGoDashboard}
              className="mt-6 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition"
              style={{ backgroundColor: BRAND_PRIMARY }}
            >
              Entrar al Dashboard
            </button>
          </div>
        ) : !hasInvite ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            El enlace de invitacion no es valido o esta incompleto.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Correo</label>
              <input
                type="email"
                value={invite.email}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre (opcional)</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(event) => updateField('fullName', event.target.value)}
                placeholder="Tu nombre completo"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contrasena</label>
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder="Minimo 6 caracteres"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar contrasena</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                placeholder="Repite tu contrasena"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {info ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {info}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-70"
              style={{ backgroundColor: BRAND_PRIMARY }}
            >
              {loading ? 'Activando...' : 'Activar mi acceso'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

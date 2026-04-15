import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

const BRAND_PRIMARY = '#D45387';
const BRAND_BG = '#F7F3EE';
const RESET_COOLDOWN_STORAGE_KEY = 'ceo_os_reset_cooldown_until';
const RESET_REQUEST_COOLDOWN_MS = 90 * 1000;

const INITIAL_FORM = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

export default function Login() {
  const navigate = useNavigate();
  const {
    session,
    user,
    userProfile,
    isLoadingAuth,
    isPasswordRecovery,
    login,
    register,
    logout,
    requestPasswordReset,
    updatePassword,
    clearAuthIntent,
    getRedirectPathForRole,
  } = useAuth();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [recoverCooldownUntil, setRecoverCooldownUntil] = useState(() => {
    if (typeof window === 'undefined') {
      return 0;
    }

    return Number(window.localStorage.getItem(RESET_COOLDOWN_STORAGE_KEY) || 0);
  });

  const hasRecoveryInUrl = () => {
    const locationPayload = `${window.location.search} ${window.location.hash}`.toLowerCase();
    return locationPayload.includes('type=recovery') || locationPayload.includes('mode=reset');
  };

  const recoverSecondsLeft = Math.max(0, Math.ceil((recoverCooldownUntil - nowMs) / 1000));

  const clearRecoveryUrl = () => {
    if (window.location.pathname !== '/login' || window.location.search || window.location.hash) {
      window.history.replaceState({}, '', '/login');
    }
  };

  useEffect(() => {
    if (!isLoadingAuth && user && userProfile && !isPasswordRecovery && mode !== 'reset') {
      navigate(getRedirectPathForRole(userProfile), { replace: true });
    }
  }, [getRedirectPathForRole, isLoadingAuth, isPasswordRecovery, mode, navigate, user, userProfile]);

  useEffect(() => {
    if (isPasswordRecovery || hasRecoveryInUrl()) {
      setMode('reset');
      resetMessages();
    }
  }, [isPasswordRecovery]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const inviteToken = `${params.get('invite') || ''}`.trim();
    if (inviteToken) {
      navigate(`/activar-acceso${window.location.search}`, { replace: true });
      return;
    }

    const invitedEmail = `${params.get('email') || ''}`.trim().toLowerCase();
    if (!invitedEmail) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      email: prev.email || invitedEmail,
    }));
  }, [navigate]);

  useEffect(() => {
    if (mode === 'reset' && session) {
      clearRecoveryUrl();
    }
  }, [mode, session]);

  useEffect(() => {
    if (mode !== 'recover' || recoverCooldownUntil <= Date.now()) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [mode, recoverCooldownUntil]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetMessages = () => {
    setError('');
    setInfo('');
  };

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setLoading(false);
    resetMessages();
    if (nextMode !== 'reset') {
      clearAuthIntent();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      if (mode === 'recover') {
        if (recoverSecondsLeft > 0) {
          throw new Error(`Espera ${recoverSecondsLeft}s antes de pedir otro correo de recuperacion.`);
        }

        if (!form.email.trim()) {
          throw new Error('Escribe el correo con el que entras a CEO Rentable.');
        }

        await requestPasswordReset(form.email, `${window.location.origin}/login`);
        const cooldownUntil = Date.now() + RESET_REQUEST_COOLDOWN_MS;
        setRecoverCooldownUntil(cooldownUntil);
        setNowMs(Date.now());
        window.localStorage.setItem(RESET_COOLDOWN_STORAGE_KEY, String(cooldownUntil));
        setInfo('Te enviamos un enlace para restablecer tu contrasena. Revisa tu bandeja y spam.');
        setMode('login');
        return;
      }

      if (mode === 'reset') {
        if (!session) {
          throw new Error('El enlace de recuperacion expiro o ya fue usado. Solicita uno nuevo.');
        }

        if (form.password.length < 6) {
          throw new Error('La contrasena debe tener al menos 6 caracteres.');
        }

        if (form.password !== form.confirmPassword) {
          throw new Error('Las contrasenas no coinciden.');
        }

        await updatePassword(form.password);
        await logout();
        clearAuthIntent();
        clearRecoveryUrl();
        setMode('login');
        setInfo('Contrasena actualizada con exito. Ya puedes iniciar sesion con tu nueva clave.');
        setForm((prev) => ({
          ...INITIAL_FORM,
          email: user?.email || prev.email,
        }));
        return;
      }

      if (mode === 'register') {
        if (!form.fullName.trim()) {
          throw new Error('Escribe tu nombre completo.');
        }

        if (form.password.length < 6) {
          throw new Error('La contrasena debe tener al menos 6 caracteres.');
        }

        if (form.password !== form.confirmPassword) {
          throw new Error('Las contrasenas no coinciden.');
        }

        const result = await register({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          phone: form.phone,
        });

        if (result.needsEmailConfirmation) {
          setInfo('Tu cuenta fue creada. Revisa tu correo para confirmar el acceso antes de iniciar sesion.');
          setMode('login');
          setForm((prev) => ({
            ...INITIAL_FORM,
            email: prev.email,
          }));
          return;
        }

        navigate(result.redirectTo, { replace: true });
        return;
      }

      const result = await login(form.email, form.password);
      navigate(result.redirectTo, { replace: true });
    } catch (authError) {
      setError(authError.message || 'No pudimos completar la autenticacion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background: `radial-gradient(circle at top left, rgba(212, 83, 135, 0.12), transparent 30%), linear-gradient(135deg, ${BRAND_BG} 0%, #ffffff 52%, #f8dbe6 100%)`,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/95 p-8 shadow-[0_24px_80px_rgba(212,83,135,0.16)] backdrop-blur-sm"
      >
        <div className="text-center mb-8">
          <img
            src="/brand/isotipo.png"
            alt="CEO Rentable OS"
            className="w-16 h-16 mx-auto object-contain mb-4"
          />

          <h1 className="text-2xl font-bold text-slate-900">
            CEO <span style={{ color: BRAND_PRIMARY }}>Rentable</span> OS
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {mode === 'login' && 'Entra a tu panel financiero'}
            {mode === 'register' && 'Crea tu cuenta y comienza con tu setup'}
            {mode === 'recover' && 'Te enviamos un enlace para recuperar tu acceso'}
            {mode === 'reset' && 'Define tu nueva contrasena para volver a entrar'}
          </p>
        </div>

        {(mode === 'login' || mode === 'register') && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#F7F3EE] p-1 mb-6">
            <button
              type="button"
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              onClick={() => handleModeChange('login')}
            >
              Iniciar sesion
            </button>
            <button
              type="button"
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              onClick={() => handleModeChange('register')}
            >
              Crear cuenta
            </button>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div>
              <Label className="text-xs font-semibold text-slate-600">Nombre completo</Label>
              <Input
                value={form.fullName}
                onChange={(event) => updateField('fullName', event.target.value)}
                placeholder="Tu nombre y apellido"
                className="mt-1 h-11 rounded-xl border-slate-200"
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'recover') && (
            <div>
              <Label className="text-xs font-semibold text-slate-600">Correo electronico</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="tu@correo.com"
                className="mt-1 h-11 rounded-xl border-slate-200"
                autoComplete="email"
              />
            </div>
          )}

          {mode === 'register' && (
            <div>
              <Label className="text-xs font-semibold text-slate-600">Telefono</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="+1 809 000 0000"
                className="mt-1 h-11 rounded-xl border-slate-200"
                autoComplete="tel"
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <Label className="text-xs font-semibold text-slate-600">
                {mode === 'reset' ? 'Nueva contrasena' : 'Contrasena'}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder="Minimo 6 caracteres"
                className="mt-1 h-11 rounded-xl border-slate-200"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          {(mode === 'register' || mode === 'reset') && (
            <div>
              <Label className="text-xs font-semibold text-slate-600">Confirmar contrasena</Label>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                placeholder="Repite tu contrasena"
                className="mt-1 h-11 rounded-xl border-slate-200"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {info && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {info}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || (mode === 'recover' && recoverSecondsLeft > 0)}
            className="w-full h-12 rounded-xl font-semibold text-white border-0"
            style={{ backgroundColor: BRAND_PRIMARY }}
          >
            {loading
              ? mode === 'login'
                ? 'Entrando...'
                : mode === 'recover'
                  ? 'Enviando enlace...'
                  : mode === 'reset'
                    ? 'Actualizando...'
                : 'Creando cuenta...'
              : mode === 'login'
                ? 'Entrar'
                : mode === 'register'
                  ? 'Crear cuenta'
                  : mode === 'recover'
                    ? recoverSecondsLeft > 0
                      ? `Reintentar en ${recoverSecondsLeft}s`
                      : 'Enviar enlace de recuperacion'
                    : 'Guardar nueva contrasena'}
          </Button>
        </form>

        {mode === 'login' && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={() => handleModeChange('recover')}
              className="font-medium text-[#D45387] hover:underline"
            >
              Olvide mi contrasena
            </button>
            <span className="text-slate-400">Recupera tu acceso por correo</span>
          </div>
        )}

        {(mode === 'recover' || mode === 'reset') && (
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => handleModeChange('login')}
              className="font-medium text-[#D45387] hover:underline"
            >
              Volver al login
            </button>
          </div>
        )}

        {mode === 'reset' && session && (
          <div className="mt-4 rounded-2xl border border-[#EBC7D7] bg-[#FDF6F9] px-4 py-3 text-sm text-slate-600">
            Estas actualizando la contrasena de <strong>{user?.email || form.email}</strong>.
          </div>
        )}

        {mode === 'reset' && !session && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Este enlace de recuperacion no esta activo. Vuelve al login y solicita un nuevo correo.
          </div>
        )}

        <p className="text-xs text-center text-slate-400 mt-5">
          {mode === 'login' && 'Tu sesion queda guardada de forma segura en este dispositivo.'}
          {mode === 'register' && 'Al registrarte creamos tu perfil y luego podras continuar con tu onboarding.'}
          {mode === 'recover' && 'Si la cuenta existe, el correo de recuperacion llegara en unos minutos.'}
          {mode === 'reset' && 'Usa una contrasena segura que no repitas en otros servicios.'}
        </p>
      </motion.div>
    </div>
  );
}

import { supabase } from '@/lib/supabase';
export async function whopRequest(path, body, { signal } = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('No pudimos validar tu sesión. Inicia sesión nuevamente para continuar.');
  const result = await fetch(`/api/whop/${path}`, {
    method: body ? 'POST' : 'GET', signal,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await result.json();
  if (!result.ok) throw new Error(payload.error || 'No pudimos conectar con Whop. Inténtalo nuevamente.');
  return payload;
}

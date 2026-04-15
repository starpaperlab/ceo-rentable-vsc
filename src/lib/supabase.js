import { createClient } from '@supabase/supabase-js';
import { ENV_CONFIG } from '@/config/env';

const { url, anonKey } = ENV_CONFIG.supabase;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ceo-rentable-os-auth',
  },
});

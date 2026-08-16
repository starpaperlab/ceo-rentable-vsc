import { readFile } from 'node:fs/promises';

export async function loadServerModuleWithoutInstalledSupabase(relativeUrl) {
  const source = await readFile(relativeUrl, 'utf8');
  const transformed = source.replace(
    /^import \{ createClient \} from '@supabase\/supabase-js';$/m,
    "const createClient = () => { throw new Error('Unexpected non-injected Supabase client in security test.'); };"
  );

  if (transformed === source) {
    throw new Error(`Supabase import was not found in ${relativeUrl.pathname}`);
  }

  const encoded = Buffer.from(transformed, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`);
}

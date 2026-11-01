import { createWhopCheckout } from './server/whopCheckout.js'
import { whopStatus } from './server/whopStatus.js'
import { handleWhopWebhook } from './server/whopWebhook.js'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { handleSendEmailPayload } from './server/sendEmailHandler.js'
import { handleAcceptInvitationPayload } from './server/acceptInvitationHandler.js'
import { handleActivateInvitationPayload } from './server/activateInvitationHandler.js'
import { handleWorkspaceInvitation, handleWorkspaceInvitationList } from './server/workspaceInvitationHandler.js'

function devEmailApiPlugin() {
  const parseJsonBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('error', () => reject(new Error('Body inválido')));
      req.on('end', () => {
        if (!raw.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          reject(new Error('JSON inválido'));
        }
      });
    });

  const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  return {
    name: 'dev-email-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (['/api/whop/create-checkout', '/api/whop/status', '/api/whop/webhook'].includes(pathname)) {
          res.setHeader('Cache-Control', 'no-store');
          const expectedMethod = pathname.endsWith('/status') ? 'GET' : 'POST';
          if (req.method !== expectedMethod) { res.setHeader('Allow', expectedMethod); sendJson(res, 405, { error: 'Método no permitido' }); return; }
          try {
            let result;
            if (pathname.endsWith('/webhook')) {
              const chunks = []; let size = 0;
              for await (const chunk of req) {
                size += Buffer.byteLength(chunk);
                if (size > 1_048_576) { sendJson(res, 413, { code: 'PAYLOAD_TOO_LARGE' }); return; }
                chunks.push(Buffer.from(chunk));
              }
              result = await handleWhopWebhook(Buffer.concat(chunks).toString('utf8'), { headers: req.headers });
            } else if (pathname.endsWith('/status')) result = await whopStatus({ headers: req.headers });
            else result = await createWhopCheckout(await parseJsonBody(req), { headers: req.headers });
            sendJson(res, result.status, result.body);
          } catch { sendJson(res, 400, { error: 'Solicitud inválida' }); }
          return;
        }

        if (
          pathname !== '/api/send-email' &&
          pathname !== '/api/accept-invitation' &&
          pathname !== '/api/activate-invitation' &&
          pathname !== '/api/workspace-invitations'
        ) return next();

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (pathname === '/api/workspace-invitations') {
          if (!['GET', 'POST'].includes(req.method || '')) {
            sendJson(res, 405, { success: false, error: 'Método no permitido' });
            return;
          }
          let payload = {};
          if (req.method === 'GET') {
            const url = new URL(req.url || '', 'http://localhost');
            payload.workspaceId = `${url.searchParams.get('workspaceId') || ''}`.trim();
          } else {
            try {
              payload = await parseJsonBody(req);
            } catch (error) {
              sendJson(res, 400, { success: false, error: error.message || 'Body inválido' });
              return;
            }
          }
          const result = req.method === 'GET'
            ? await handleWorkspaceInvitationList(payload, { env: process.env, headers: req.headers || {} })
            : await handleWorkspaceInvitation(payload, { env: process.env, headers: req.headers || {} });
          sendJson(res, result.status, result.body);
          return;
        }

        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, error: 'Método no permitido' });
          return;
        }

        let payload = {};
        try {
          payload = await parseJsonBody(req);
        } catch (error) {
          sendJson(res, 400, { success: false, error: error.message || 'Body inválido' });
          return;
        }

        const handler =
          pathname === '/api/accept-invitation'
            ? handleAcceptInvitationPayload
            : pathname === '/api/activate-invitation'
              ? handleActivateInvitationPayload
              : handleSendEmailPayload;

        const result = await handler(payload, {
          env: process.env,
          headers: req.headers || {},
        });

        sendJson(res, result.status, result.body);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  const appBuildId =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    `local-${Date.now()}`;

  return {
    plugins: [react(), devEmailApiPlugin()],
    define: {
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      port: 5173,
      host: true
    }
  };
});

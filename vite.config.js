import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { handleSendEmailPayload } from './server/sendEmailHandler.js'
import { handleAcceptInvitationPayload } from './server/acceptInvitationHandler.js'
import { handleActivateInvitationPayload } from './server/activateInvitationHandler.js'

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
        if (
          pathname !== '/api/send-email' &&
          pathname !== '/api/accept-invitation' &&
          pathname !== '/api/activate-invitation'
        ) return next();

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
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

  return {
    plugins: [react(), devEmailApiPlugin()],
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

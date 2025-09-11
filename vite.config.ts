import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import { pathToFileURL } from 'url';

function localApiPlugin() {
  return {
    name: 'local-api-middleware',
    apply: 'serve' as const,
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        try {
          const url = req.url || '';
          if (!url.startsWith('/api/')) return next();

          const pathname = new URL(url, 'http://localhost').pathname;
          const route = pathname.replace(/^\/api\//, '');
          const filePath = path.resolve(__dirname, 'api', `${route}.js`);

          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            return res.end('Not Found');
          }

          // Parse JSON body if present
          const method = (req.method || 'GET').toUpperCase();
          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              req.on('data', (c: Buffer) => chunks.push(c));
              req.on('end', () => resolve());
              req.on('error', reject);
            });
            const raw = Buffer.concat(chunks).toString('utf8');
            const ct = (req.headers['content-type'] || '').toString();
            if (ct.includes('application/json') && raw) {
              try { req.body = JSON.parse(raw); } catch { req.body = undefined; }
            } else {
              req.body = undefined;
            }
          }

          // Express-like response shim
          const resShim = (() => {
            const shim: any = {
              status(code: number) { res.statusCode = code; return shim; },
              json(obj: any) {
                if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(obj));
              },
              send(data: any) {
                if (typeof data === 'object') {
                  res.setHeader('content-type', 'application/json');
                  res.end(JSON.stringify(data));
                } else {
                  res.end(String(data));
                }
              },
              setHeader: res.setHeader.bind(res),
              getHeader: res.getHeader.bind(res),
              end: res.end.bind(res),
            };
            return shim;
          })();

          const fileUrl = pathToFileURL(filePath);
          const mod = await import(fileUrl.href);
          const handler = (mod && (mod.default || (mod as any).handler)) as Function;
          if (typeof handler !== 'function') {
            res.statusCode = 500;
            return res.end('Invalid API handler');
          }
          await handler(req, resShim);
        } catch (e) {
          console.error('Local API middleware error:', e);
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Expose .env variables to process.env in dev so API handlers can access them
  // (Vite exposes them to import.meta.env for client, but server handlers need process.env)
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
  process.env.VITE_GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
  process.env.UNSPLASH_API_KEY = process.env.UNSPLASH_API_KEY || env.UNSPLASH_API_KEY || env.VITE_UNSPLASH_API_KEY;

  return {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      plugins: [localApiPlugin()]
    };
});

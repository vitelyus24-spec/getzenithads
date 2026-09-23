import { createServer } from 'node:http';
import { createServer as createVite } from 'vite';
import { createRuntime } from './runtime.js';
import { handler } from './http.js';
const env = {
  APP_MODE: 'local',
  STORE: 'file',
  APP_ORIGIN: 'http://localhost:5173',
  ...process.env,
};
let promise;
const api = handler(() => (promise ??= createRuntime(env)));
const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) await api(req, res);
  else vite.middlewares(req, res);
}).listen(Number(env.PORT || 5173), '127.0.0.1', () =>
  console.log(`Zenit Ads local: http://localhost:${env.PORT || 5173} · production unchanged`),
);

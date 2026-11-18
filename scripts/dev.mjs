import { createServer, loadEnv } from 'vite';
import quizHandler from '../api/quiz.js';
import botHandler from '../api/bot.js';

const environment = loadEnv('development', process.cwd(), '');
for (const name of [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  'ADMIN_PASSWORD',
  'ALLOW_GUEST_PLAY',
  'BOT_TOKEN',
  'WEB_APP_URL',
  'TELEGRAM_WEBHOOK_SECRET',
]) {
  if (!process.env[name] && environment[name]) process.env[name] = environment[name];
}
process.env.WEB_APP_URL ||= 'http://localhost:5173';

const server = await createServer({
  plugins: [
    {
      name: 'local-quiz-api',
      configureServer(viteServer) {
        viteServer.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url || '/', 'http://localhost');
          const handler =
            url.pathname === '/api/quiz'
              ? quizHandler
              : url.pathname === '/api/bot'
                ? botHandler
                : null;
          if (!handler) return next();
          let length = 0;
          const chunks = [];
          try {
            for await (const chunk of request) {
              length += chunk.length;
              if (length > 20000) {
                response.statusCode = 413;
                response.end();
                return;
              }
              chunks.push(chunk);
            }
            request.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
          } catch {
            response.statusCode = 400;
            response.end();
            return;
          }
          request.query = Object.fromEntries(url.searchParams);
          response.status = (status) => {
            response.statusCode = status;
            return response;
          };
          response.json = (value) => {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(value));
            return response;
          };
          response.send = (value) => {
            response.end(value);
            return response;
          };
          await handler(request, response);
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
await server.listen();
server.printUrls();

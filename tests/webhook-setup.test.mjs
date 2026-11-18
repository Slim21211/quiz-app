import test from 'node:test';
import assert from 'node:assert/strict';
import { configureWebhook } from '../scripts/configure-webhook.mjs';

const environment = {
  BOT_TOKEN: 'test-only-token',
  TELEGRAM_WEBHOOK_SECRET: 'test-only-webhook-secret',
  WEB_APP_URL: 'https://quiz.example.test',
};
function mockRequests(context, probeStatus = 400) {
  const registrations = [];
  const output = [];
  context.mock.method(console, 'log', (...values) => output.push(values.join(' ')));
  context.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'quiz.example.test') {
      assert.equal(
        options.headers['X-Telegram-Bot-Api-Secret-Token'],
        environment.TELEGRAM_WEBHOOK_SECRET,
      );
      assert.equal(options.body, '{}', 'Preflight must contain no message or update_id');
      return new Response(null, { status: probeStatus });
    }
    assert.equal(url.hostname, 'api.telegram.org');
    const method = url.pathname.split('/').at(-1);
    let result;
    if (method === 'getMe') result = { username: 'TestQuizBot' };
    else if (method === 'getWebhookInfo')
      result = {
        url: 'https://quiz.example.test/api/bot',
        pending_update_count: 10,
        max_connections: 40,
      };
    else {
      assert.equal(method, 'setWebhook', 'No command, message or other mutation is allowed');
      registrations.push(JSON.parse(options.body));
      result = true;
    }
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { registrations, output };
}

test('webhook check is read only and does not expose secrets', async (context) => {
  const { registrations, output } = mockRequests(context);
  await configureWebhook(environment);
  assert.equal(registrations.length, 0);
  for (const secret of [environment.BOT_TOKEN, environment.TELEGRAM_WEBHOOK_SECRET])
    assert.equal(output.join('\n').includes(secret), false);
});

test('webhook setup registers the matching secret while preserving pending updates', async (context) => {
  const { registrations, output } = mockRequests(context);
  await configureWebhook(environment, true);
  assert.deepEqual(registrations, [
    {
      url: 'https://quiz.example.test/api/bot',
      secret_token: environment.TELEGRAM_WEBHOOK_SECRET,
      drop_pending_updates: false,
      max_connections: 40,
    },
  ]);
  assert.equal(output.join('\n').includes(environment.TELEGRAM_WEBHOOK_SECRET), false);
});

test('webhook setup refuses a mismatch before changing Telegram settings', async (context) => {
  const { registrations } = mockRequests(context, 403);
  await assert.rejects(configureWebhook(environment, true), /preflight returned HTTP 403/);
  assert.equal(registrations.length, 0);
});

test('webhook setup validates configuration and redacts network failures', async (context) => {
  await assert.rejects(
    configureWebhook({ ...environment, WEB_APP_URL: 'http://quiz.example.test' }),
    /public HTTPS/,
  );
  await assert.rejects(
    configureWebhook({ ...environment, TELEGRAM_WEBHOOK_SECRET: 'invalid secret' }),
    /1–256/,
  );
  context.mock.method(globalThis, 'fetch', async () => {
    throw new Error(`Network failure containing ${environment.BOT_TOKEN}`);
  });
  await assert.rejects(
    configureWebhook(environment),
    (error) =>
      !error.message.includes(environment.BOT_TOKEN) && error.message.includes('request failed'),
  );
});

test('webhook registration uses the API host when the frontend is on Pages', async (context) => {
  context.mock.method(console, 'log', () => {});
  context.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    assert.notEqual(url.hostname, 'pages.example.test');
    if (url.hostname === 'api.example.test') return new Response(null, { status: 400 });
    const method = url.pathname.split('/').at(-1);
    if (method === 'getMe')
      return new Response(JSON.stringify({ ok: true, result: { username: 'TestQuizBot' } }));
    if (method === 'getWebhookInfo')
      return new Response(
        JSON.stringify({
          ok: true,
          result: { url: 'https://api.example.test/api/bot', pending_update_count: 0 },
        }),
      );
    assert.equal(JSON.parse(options.body).url, 'https://api.example.test/api/bot');
    return new Response(JSON.stringify({ ok: true, result: true }));
  });
  await configureWebhook(
    {
      ...environment,
      WEB_APP_URL: 'https://pages.example.test',
      API_BASE_URL: 'https://api.example.test',
    },
    true,
  );
});

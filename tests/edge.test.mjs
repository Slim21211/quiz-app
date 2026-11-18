import test from 'node:test';
import assert from 'node:assert/strict';
import { serveQuizRequest } from '../server/edge.js';
import { signSession, adminVersion, findPlayer, getPlayer } from '../server/security.js';
import { getApiBaseUrl } from '../src/lib/apiUrl.ts';
import { createApiSessions, usesHeaderSessions } from '../src/lib/apiSession.ts';

process.env.SESSION_SECRET = 'test-only-session-secret-with-at-least-32-characters';
process.env.ADMIN_PASSWORD = 'test-only-long-admin-password';
process.env.WEB_APP_URL = 'https://quiz.elvada.ru';
process.env.SUPABASE_URL = 'https://database.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-server-key';

const endpoint = 'https://project.example.test/functions/v1/quiz';
function request(action, method = 'GET', body, headers = {}) {
  return new Request(`${endpoint}?action=${action}`, {
    method,
    headers: { Origin: process.env.WEB_APP_URL, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function mockDatabase(context, respond) {
  context.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.hostname, 'database.example.test');
    return new Response(JSON.stringify(respond(url, options)), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

test('Edge login uses signed headers without third-party cookies and clears them on logout', async (context) => {
  const rateKeys = [];
  mockDatabase(context, (url, options) => {
    assert.ok(url.pathname.endsWith('/rpc/consume_rate_limit'));
    rateKeys.push(JSON.parse(options.body).p_key);
    return true;
  });
  const login = await serveQuizRequest(
    request('login', 'POST', { password: process.env.ADMIN_PASSWORD }),
  );
  assert.equal(login.status, 200);
  assert.equal(login.headers.has('Set-Cookie'), false);
  const token = login.headers.get('X-Quiz-Admin-Session');
  assert.ok(token);
  assert.match(login.headers.get('Access-Control-Expose-Headers'), /X-Quiz-Admin-Session/);
  const session = await serveQuizRequest(
    request('session', 'GET', undefined, { 'X-Quiz-Admin-Session': token }),
  );
  assert.deepEqual(await session.json(), { admin: true });
  const forged = await serveQuizRequest(
    request('session', 'GET', undefined, { 'X-Quiz-Admin-Session': `${token}forged` }),
  );
  assert.deepEqual(await forged.json(), { admin: false });
  const logout = await serveQuizRequest(request('logout', 'POST', {}));
  assert.equal(logout.headers.get('X-Quiz-Admin-Session'), '');
  await serveQuizRequest(
    request(
      'login',
      'POST',
      { password: process.env.ADMIN_PASSWORD },
      { 'X-Forwarded-For': 'forged-client' },
    ),
  );
  assert.equal(
    rateKeys[0],
    rateKeys[1],
    'Caller-controlled proxy headers cannot bypass Edge login throttling',
  );
});

test('Edge limits login attempts before issuing a session', async (context) => {
  mockDatabase(context, () => false);
  const response = await serveQuizRequest(
    request('login', 'POST', { password: process.env.ADMIN_PASSWORD }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.has('X-Quiz-Admin-Session'), false);
});

test('Edge public catalog filters drafts and rejects unauthenticated administration', async (context) => {
  let calls = 0;
  mockDatabase(context, (url) => {
    calls += 1;
    assert.equal(url.searchParams.get('is_active'), 'eq.true');
    return [{ id: 'quiz-one', name: 'Cinema', questions: [{ count: 10 }] }];
  });
  const response = await serveQuizRequest(request('quizzes'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: 'quiz-one', name: 'Cinema', question_count: 10 }]);
  const privateResponse = await serveQuizRequest(request('questions'));
  assert.equal(privateResponse.status, 401);
  assert.equal(calls, 1);
});

test('Edge supports token preflight and rejects foreign origins, malformed JSON and streamed oversized bodies', async () => {
  const preflight = await serveQuizRequest(
    request('login', 'OPTIONS', undefined, {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-quiz-admin-session,x-telegram-init-data',
    }),
  );
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /x-quiz-admin-session/);
  const foreign = await serveQuizRequest(
    request('session', 'GET', undefined, { Origin: 'https://attacker.test' }),
  );
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.has('Access-Control-Allow-Origin'), false);
  for (const [body, expected] of [
    ['{bad-json', 400],
    ['a'.repeat(21000), 413],
  ]) {
    const response = await serveQuizRequest(
      new Request(`${endpoint}?action=login`, {
        method: 'POST',
        headers: { Origin: process.env.WEB_APP_URL },
        body,
      }),
    );
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), process.env.WEB_APP_URL);
  }
});

test('Edge accepts only current signed admin tokens and does not reuse browser cookies', async () => {
  const expired = signSession({
    role: 'admin',
    version: adminVersion(),
    expires: Date.now() - 1000,
  });
  const current = signSession({
    role: 'admin',
    version: adminVersion(),
    expires: Date.now() + 10000,
  });
  for (const headers of [
    { 'X-Quiz-Admin-Session': expired },
    { Cookie: `quiz_admin=${current}` },
  ]) {
    const response = await serveQuizRequest(request('session', 'GET', undefined, headers));
    assert.deepEqual(await response.json(), { admin: false });
  }
});

test('guest tokens remain signed and Telegram authentication takes priority over guest headers', () => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  let token;
  const headers = {};
  const adapted = { sessionTransport: 'header', headers };
  const player = getPlayer(adapted, {
    setHeader(_name, value) {
      token = value;
    },
  });
  headers['x-quiz-player-session'] = token;
  assert.deepEqual(findPlayer(adapted), player);
  process.env.BOT_TOKEN = 'test-only-telegram-token';
  headers['x-telegram-init-data'] = 'forged';
  assert.throws(() => findPlayer(adapted), { status: 401 });
  delete headers['x-telegram-init-data'];
  delete process.env.ALLOW_GUEST_PLAY;
  assert.equal(findPlayer(adapted), null);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('client session storage separates roles and endpoints, restores reloads and clears logout', () => {
  const admin = memoryStorage();
  const player = memoryStorage();
  const sessions = createApiSessions(endpoint, admin, player);
  sessions.capture(
    new Headers({
      'X-Quiz-Admin-Session': 'signed-admin',
      'X-Quiz-Player-Session': 'signed-player',
    }),
  );
  const reload = createApiSessions(endpoint, admin, player);
  const headers = new Headers();
  reload.prepare(headers);
  assert.equal(headers.get('X-Quiz-Admin-Session'), 'signed-admin');
  assert.equal(headers.get('X-Quiz-Player-Session'), 'signed-player');
  const anotherEndpoint = createApiSessions(
    'https://another.example.test/functions/v1/quiz',
    admin,
    player,
  );
  const isolated = new Headers();
  anotherEndpoint.prepare(isolated);
  assert.equal([...isolated].length, 0);
  reload.capture(new Headers({ 'X-Quiz-Admin-Session': '' }));
  const loggedOut = new Headers();
  createApiSessions(endpoint, admin, player).prepare(loggedOut);
  assert.equal(loggedOut.has('X-Quiz-Admin-Session'), false);
  assert.equal(loggedOut.get('X-Quiz-Player-Session'), 'signed-player');
});

test('blocked storage keeps an in-memory session and endpoint validation preserves old hosting', () => {
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  const sessions = createApiSessions(endpoint, blocked, blocked);
  sessions.capture(new Headers({ 'X-Quiz-Admin-Session': 'signed' }));
  const headers = new Headers();
  sessions.prepare(headers);
  assert.equal(headers.get('X-Quiz-Admin-Session'), 'signed');
  assert.equal(getApiBaseUrl(endpoint), endpoint);
  assert.equal(getApiBaseUrl('https://api.quiz.elvada.ru'), 'https://api.quiz.elvada.ru/api/quiz');
  assert.equal(usesHeaderSessions(endpoint), true);
  assert.equal(usesHeaderSessions('/api/quiz'), false);
});

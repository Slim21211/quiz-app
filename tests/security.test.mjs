import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  validateTelegram,
  signSession,
  readSession,
  getPlayer,
  requireSameOrigin,
  textField,
  uuidField,
  isAdmin,
  adminVersion,
} from '../server/security.js';
import { normalizeAnswer, answerHint } from '../src/lib/answerComparison.ts';
import { questionCountLabel } from '../src/lib/text.ts';
import { remainingSeconds } from '../src/hooks/useTimer.ts';

const secret = 'test-only-session-secret-with-at-least-32-characters';
const token = 'test-only-telegram-token';
process.env.SESSION_SECRET = secret;
process.env.WEB_APP_URL = 'https://quiz.example.test';
process.env.ADMIN_PASSWORD = 'test-only-long-admin-password';

function telegramData(user, authDate = Date.now()) {
  const params = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(authDate / 1000)),
    query_id: 'test-query',
    signature: 'test-signature',
  });
  const checkString = [...params.entries()]
    .sort()
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', key).update(checkString).digest('hex'));
  return params.toString();
}

test('accepts Telegram HMAC including the signature field', () => {
  assert.deepEqual(validateTelegram(telegramData({ id: 12345, first_name: 'Test' }), token), {
    id: 12345,
    first_name: 'Test',
    username: null,
  });
});
test('rejects forged, expired, future and duplicated Telegram payloads', () => {
  const valid = telegramData({ id: 12345, first_name: 'Test' });
  assert.throws(() => validateTelegram(valid.replace('Test', 'Forged'), token), { status: 401 });
  assert.throws(
    () =>
      validateTelegram(
        telegramData({ id: 12345, first_name: 'Test' }, Date.now() - 86401000),
        token,
      ),
    { status: 401 },
  );
  assert.throws(
    () =>
      validateTelegram(telegramData({ id: 12345, first_name: 'Test' }, Date.now() + 60000), token),
    { status: 401 },
  );
  assert.throws(() => validateTelegram(`${valid}&user={}`, token), { status: 401 });
});
test('rejects unsafe Telegram identities and malformed payloads', () => {
  for (const identity of [-123, '123', null, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => validateTelegram(telegramData({ id: identity, first_name: 'Test' }), token),
      { status: 401 },
    );
  }
  assert.throws(() => validateTelegram([], token), { status: 401 });
});
test('signed sessions expire and cannot be changed or signed with another key', () => {
  const value = signSession({ role: 'player', id: -1, expires: 2000 }, secret);
  assert.equal(readSession(value, secret, 1000)?.id, -1);
  assert.equal(readSession(value, secret, 2000), null);
  assert.equal(readSession(`${value}x`, secret, 1000), null);
  assert.equal(readSession(value, `${secret}other`, 1000), null);
  assert.equal(readSession('invalid', secret), null);
});
test('changing the administrator password invalidates an existing session', () => {
  const value = signSession({
    role: 'admin',
    expires: Date.now() + 10000,
    version: adminVersion(),
  });
  const request = { headers: { cookie: `quiz_admin=${value}` } };
  assert.equal(isAdmin(request), true);
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'a-different-admin-password';
  assert.equal(isAdmin(request), false);
  process.env.ADMIN_PASSWORD = previous;
});
test('guest play is disabled by default; enabled guests receive signed HttpOnly identities', () => {
  delete process.env.ALLOW_GUEST_PLAY;
  assert.throws(() => getPlayer({ headers: {} }, {}), { status: 401 });
  process.env.ALLOW_GUEST_PLAY = 'true';
  let cookie;
  const player = getPlayer(
    { headers: {} },
    {
      setHeader: (_name, value) => {
        cookie = value;
      },
    },
  );
  assert.ok(player.id < 0 && Number.isSafeInteger(player.id));
  assert.ok(cookie.includes('HttpOnly; SameSite=Strict'));
  assert.equal(getPlayer({ headers: { cookie } }, {}).id, player.id);
  delete process.env.ALLOW_GUEST_PLAY;
});
test('state changes require the exact configured Origin', () => {
  assert.doesNotThrow(() =>
    requireSameOrigin({ headers: { origin: 'https://quiz.example.test' } }),
  );
  for (const origin of [
    undefined,
    'null',
    'https://attacker.test',
    'https://quiz.example.test.attacker.test',
  ]) {
    assert.throws(() => requireSameOrigin({ headers: { origin } }), { status: 403 });
  }
});
test('validates input length and UUID syntax', () => {
  assert.equal(textField(' answer ', 'Answer', 20), 'answer');
  for (const value of ['', '   ', 1, '123456'])
    assert.throws(() => textField(value, 'Answer', 5), { status: 400 });
  assert.throws(() => uuidField('not-a-uuid'), { status: 400 });
  assert.equal(
    uuidField('00000000-0000-4000-8000-000000000001'),
    '00000000-0000-4000-8000-000000000001',
  );
});
test('comparison normalizes punctuation, spaces and е/ё without deciding synonyms', () => {
  assert.equal(normalizeAnswer('  Ёлочные, ШАРЫ! '), 'елочные шары');
  assert.match(answerHint('ёлочные ШАРЫ', 'Елочные шары'), /Совпадает/);
  assert.match(answerHint('шары ёлочные', 'Ёлочные шары'), /другом порядке/);
  assert.equal(answerHint('Новогодняя игрушка на елку', 'Елочные шары'), null);
  assert.equal(answerHint('', ''), null);
  assert.equal(answerHint('15', '1.5'), null);
});
test('deadline calculation handles throttled clocks and never returns negative seconds', () => {
  assert.equal(remainingSeconds(60000, 0), 60);
  assert.equal(remainingSeconds(60000, 59001), 1);
  assert.equal(remainingSeconds(60000, 60000), 0);
  assert.equal(remainingSeconds(60000, 90000), 0);
});

test('question counts use Russian plural forms', () => {
  assert.equal(questionCountLabel(1), '1 вопрос');
  assert.equal(questionCountLabel(2), '2 вопроса');
  assert.equal(questionCountLabel(5), '5 вопросов');
  assert.equal(questionCountLabel(11), '11 вопросов');
  assert.equal(questionCountLabel(21), '21 вопрос');
});

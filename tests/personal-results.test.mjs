import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../api/quiz.js';
import { signSession, adminVersion } from '../server/security.js';

process.env.SESSION_SECRET = 'test-only-session-secret-with-at-least-32-characters';
process.env.ADMIN_PASSWORD = 'test-only-long-admin-password';
process.env.BOT_TOKEN = 'test-only-telegram-token';
process.env.WEB_APP_URL = 'https://quiz.example.test';
process.env.SUPABASE_URL = 'https://database.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-server-key';
const quizId = '00000000-0000-4000-8000-000000000001';

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
function signedTelegram(userId) {
  const params = new URLSearchParams({
    user: JSON.stringify({ id: userId, first_name: 'Test player' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });
  const check = [...params.entries()]
    .sort()
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
function request(action, userId) {
  return {
    method: 'GET',
    query: { action, quizId, participantId: 'forged-participant', telegram_id: '99999' },
    headers: {
      origin: process.env.WEB_APP_URL,
      ...(userId ? { 'x-telegram-init-data': signedTelegram(userId) } : {}),
    },
  };
}
function answer(order, verdict, text = 'Own answer') {
  return {
    id: `answer-${order}`,
    answer_text: text,
    is_correct: verdict,
    question: {
      id: `question-${order}`,
      question_text: `Question ${order}`,
      correct_answer: `Reference ${order}`,
      order_number: order,
    },
  };
}
function snapshot(answers, total = 2) {
  return { answers, quiz: { is_active: true, questions: [{ count: total }] } };
}
function mockDatabase(context, respond) {
  context.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.hostname, 'database.example.test');
    return respond(url, options);
  });
}
function jsonResponse(body) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

test('personal review requires a signed player identity even for an administrator', async (context) => {
  mockDatabase(context, () => {
    throw new Error('Unauthenticated request reached the database');
  });
  const admin = signSession({
    role: 'admin',
    version: adminVersion(),
    expires: Date.now() + 10000,
  });
  for (const headers of [
    {},
    { cookie: `quiz_admin=${admin}` },
    { 'x-telegram-init-data': 'forged' },
  ]) {
    const incoming = request('my-review');
    Object.assign(incoming.headers, headers);
    const response = responseMock();
    await handler(incoming, response);
    assert.equal(response.statusCode, 401);
  }
});

test('personal review derives identity from Telegram, ignores forged IDs and returns only that player answers', async (context) => {
  mockDatabase(context, (url) => {
    assert.ok(url.pathname.endsWith('/participants'));
    assert.equal(url.searchParams.get('quiz_id'), `eq.${quizId}`);
    assert.equal(url.searchParams.get('quiz.is_active'), 'eq.true');
    const identity = url.searchParams.get('telegram_id');
    assert.ok(['eq.12345', 'eq.67890'].includes(identity));
    return jsonResponse(
      snapshot([answer(2, false, `Personal ${identity}`), answer(1, true, `Personal ${identity}`)]),
    );
  });
  for (const identity of [12345, 67890]) {
    const response = responseMock();
    await handler(request('my-review', identity), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'ready');
    assert.equal(response.body.correct_count, 1);
    assert.equal(response.body.total_count, 2);
    assert.deepEqual(
      response.body.answers.map((item) => item.question.order_number),
      [1, 2],
    );
    assert.ok(
      response.body.answers.every((item) => item.answer_text === `Personal eq.${identity}`),
    );
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
});

test('personal review never exposes reference answers before completion, full grading or after a verdict is cleared', async (context) => {
  let current;
  mockDatabase(context, (url) => {
    assert.equal(url.searchParams.get('quiz.is_active'), 'eq.true');
    return jsonResponse(current);
  });
  for (const [record, status] of [
    [null, 'not_started'],
    [snapshot([answer(1, true)]), 'in_progress'],
    [snapshot([answer(1, true), answer(2, null)]), 'pending'],
    [snapshot([answer(1, true), answer(2, false)]), 'ready'],
    [snapshot([answer(1, null), answer(2, false)]), 'pending'],
  ]) {
    current = record;
    const response = responseMock();
    await handler(request('my-review', 12345), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, status);
    if (status !== 'ready') assert.deepEqual(response.body, { status });
  }
});

test('signed guest identities can read only their existing personal attempt when guest play is enabled', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  try {
    mockDatabase(context, (url) => {
      assert.equal(url.searchParams.get('telegram_id'), 'eq.-123');
      return jsonResponse(snapshot([answer(1, true)], 1));
    });
    const incoming = request('my-review');
    incoming.headers.cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
    const response = responseMock();
    await handler(incoming, response);
    assert.equal(response.body.status, 'ready');
  } finally {
    delete process.env.ALLOW_GUEST_PLAY;
  }
});

test('ungraded count is restricted to administrators and uses an exact HEAD count across all quizzes', async (context) => {
  let queries = 0;
  mockDatabase(context, (url, options) => {
    queries += 1;
    assert.ok(url.pathname.endsWith('/answers'));
    assert.equal(url.searchParams.get('is_correct'), 'is.null');
    assert.equal(options.method, 'HEAD');
    assert.equal(url.searchParams.has('quiz_id'), false);
    return new Response(null, { headers: { 'Content-Range': '0-0/1234' } });
  });
  for (const incoming of [request('review-count'), request('review-count', 12345)]) {
    const response = responseMock();
    await handler(incoming, response);
    assert.equal(response.statusCode, 401);
  }
  assert.equal(queries, 0);
  const incoming = request('review-count');
  incoming.headers.cookie = `quiz_admin=${signSession({ role: 'admin', version: adminVersion(), expires: Date.now() + 10000 })}`;
  const response = responseMock();
  await handler(incoming, response);
  assert.deepEqual(response.body, { count: 1234 });
  assert.equal(queries, 1);
});

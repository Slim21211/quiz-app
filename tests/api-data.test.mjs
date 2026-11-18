import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/quiz.js';
import { signSession, adminVersion } from '../server/security.js';

process.env.SESSION_SECRET = 'test-only-session-secret-with-at-least-32-characters';
process.env.ADMIN_PASSWORD = 'test-only-long-admin-password';
process.env.WEB_APP_URL = 'https://quiz.example.test';
process.env.SUPABASE_URL = 'https://database.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-server-key';

const quizId = '00000000-0000-4000-8000-000000000001';
const participantId = '00000000-0000-4000-8000-000000000002';
const questionId = '00000000-0000-4000-8000-000000000003';
function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
function jsonResponse(body, extraHeaders = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
function mockDatabase(context, respond) {
  context.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.hostname, 'database.example.test', 'Only the mocked database can be called');
    return respond(url, options);
  });
}
function request(action, method = 'GET', body, cookie = '') {
  return {
    method,
    query: { action, quizId },
    body,
    headers: { origin: process.env.WEB_APP_URL, cookie },
    socket: { remoteAddress: '127.0.0.1' },
  };
}
function adminCookie() {
  return `quiz_admin=${signSession({ role: 'admin', version: adminVersion(), expires: Date.now() + 10000 })}`;
}

test('catalog paginates beyond the Supabase page cap and only exposes active quizzes', async (context) => {
  const offsets = [];
  mockDatabase(context, (url) => {
    assert.equal(url.searchParams.get('is_active'), 'eq.true');
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    const quizzes = Array.from({ length: offset === 0 ? 500 : 1 }, (_item, index) => ({
      id: `${offset + index}`,
      name: 'Test quiz',
      slug: `test-${offset + index}`,
      is_active: true,
      questions: [{ count: 3 }],
    }));
    return jsonResponse(quizzes);
  });
  const response = responseMock();
  await handler(request('quizzes'), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.length, 501);
  assert.equal(response.body[0].question_count, 3);
  assert.equal('questions' in response.body[0], false);
  assert.deepEqual(offsets, [0, 500]);
});
test('login checks the shared rate limit and issues an HttpOnly session', async (context) => {
  mockDatabase(context, (url) => {
    assert.ok(url.pathname.endsWith('/rpc/consume_rate_limit'));
    return jsonResponse(true);
  });
  const response = responseMock();
  await handler(request('login', 'POST', { password: process.env.ADMIN_PASSWORD }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.admin, true);
  assert.match(response.headers['Set-Cookie'], /quiz_admin=.*HttpOnly; SameSite=Strict/);
});
test('distributed login rate limit returns 429 before checking the password', async (context) => {
  mockDatabase(context, () => jsonResponse(false));
  const response = responseMock();
  await handler(request('login', 'POST', { password: process.env.ADMIN_PASSWORD }), response);
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['Retry-After'], '900');
});
test('new quizzes are drafts and invalid slugs never reach the database', async (context) => {
  let inserts = 0;
  mockDatabase(context, (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.is_active, false);
    inserts += 1;
    return jsonResponse({ ...body, id: quizId });
  });
  const response = responseMock();
  await handler(
    request('quiz', 'POST', { name: 'Cinema', slug: 'cinema' }, adminCookie()),
    response,
  );
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.question_count, 0);
  for (const slug of ['main', '../admin', '//attacker', 'quiz with spaces']) {
    const rejected = responseMock();
    await handler(request('quiz', 'POST', { name: 'Cinema', slug }, adminCookie()), rejected);
    assert.equal(rejected.statusCode, 400);
  }
  assert.equal(inserts, 1);
});
test('play uses the server-derived participant and ignores client score and participant fields', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  mockDatabase(context, (url, options) => {
    if (url.pathname.endsWith('/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/quizzes')) return jsonResponse({ id: quizId });
    if (url.pathname.endsWith('/participants')) {
      assert.equal(url.searchParams.get('telegram_id'), 'eq.-123');
      return jsonResponse({ id: participantId });
    }
    assert.ok(url.pathname.endsWith('/rpc/quiz_turn'));
    assert.deepEqual(JSON.parse(options.body), {
      p_participant_id: participantId,
      p_question_id: questionId,
      p_answer_text: 'My answer',
    });
    return jsonResponse({ completed: true, question: null });
  });
  const response = responseMock();
  await handler(
    request(
      'play',
      'POST',
      {
        quiz_id: quizId,
        question_id: questionId,
        answer_text: 'My answer',
        participant_id: 'forged-id',
        is_correct: true,
      },
      cookie,
    ),
    response,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.completed, true);
  delete process.env.ALLOW_GUEST_PLAY;
});
test('pending results expose public names without scores or Telegram identity fields', async (context) => {
  mockDatabase(context, (url, options) => {
    if (url.pathname.endsWith('/quizzes')) return jsonResponse({ id: quizId, is_active: true });
    if (url.pathname.endsWith('/questions')) {
      assert.equal(options.method, 'HEAD');
      return jsonResponse(null, { 'Content-Range': '*/3' });
    }
    return jsonResponse([
      {
        id: participantId,
        participant_number: 'Public name',
        telegram_id: 12345,
        telegram_username: 'private-username',
        answers: [{ is_correct: true }, { is_correct: false }, { is_correct: null }],
      },
    ]);
  });
  const response = responseMock();
  await handler(request('results'), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ranked: [],
    playing: [],
    pending: [{ id: participantId, name: 'Public name', checked_count: 2, total_count: 3 }],
  });
});

test('personal progress is read only and restricted to the signed player identity', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  mockDatabase(context, (url, options) => {
    assert.ok(url.pathname.endsWith('/participants'));
    assert.equal(options.method, 'GET');
    assert.equal(url.searchParams.get('telegram_id'), 'eq.-123');
    assert.equal(url.searchParams.get('quiz.is_active'), 'eq.true');
    return jsonResponse([
      {
        quiz_id: quizId,
        answers: [{ is_correct: true }, { is_correct: null }],
        quiz: { questions: [{ count: 2 }] },
      },
    ]);
  });
  const response = responseMock();
  const forged = request('my-progress', 'GET', undefined, cookie);
  forged.query.telegram_id = '99999';
  await handler(forged, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, [
    {
      quiz_id: quizId,
      resume_question_id: null,
      correct_count: null,
      answered_count: 2,
      pending_count: 1,
      total_count: 2,
      completed: true,
    },
  ]);
  assert.equal(response.headers['Set-Cookie'], undefined);
  delete process.env.ALLOW_GUEST_PLAY;
});

test('anonymous progress lookup never registers a guest or queries participant data', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  mockDatabase(context, () => {
    assert.fail('No database request should be made');
  });
  const response = responseMock();
  await handler(request('my-progress'), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, []);
  assert.equal(response.headers['Set-Cookie'], undefined);
  delete process.env.ALLOW_GUEST_PLAY;
});

test('resume uses the existing participant without requesting a name', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  mockDatabase(context, (url, options) => {
    if (url.pathname.endsWith('/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/quizzes')) return jsonResponse({ id: quizId });
    if (url.pathname.endsWith('/participants')) {
      assert.equal(options.method, 'GET');
      return jsonResponse({ id: participantId });
    }
    if (url.pathname.endsWith('/shown_questions'))
      return jsonResponse([{ question_id: questionId, question: { order_number: 1 } }]);
    if (url.pathname.endsWith('/answers')) return jsonResponse([]);
    assert.ok(url.pathname.endsWith('/rpc/quiz_turn'));
    assert.deepEqual(JSON.parse(options.body), {
      p_participant_id: participantId,
      p_question_id: questionId,
      p_answer_text: '',
    });
    return jsonResponse({ completed: false, answered: 1 });
  });
  const response = responseMock();
  await handler(request('play', 'POST', { quiz_id: quizId, resume_only: true }, cookie), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.answered, 1);
  delete process.env.ALLOW_GUEST_PLAY;
});

test('resume of a deleted attempt never registers a new participant', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  mockDatabase(context, (url, options) => {
    if (url.pathname.endsWith('/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/quizzes')) return jsonResponse({ id: quizId });
    assert.ok(url.pathname.endsWith('/participants'));
    assert.equal(options.method, 'GET');
    return jsonResponse(null);
  });
  const response = responseMock();
  await handler(
    request(
      'play',
      'POST',
      { quiz_id: quizId, resume_only: true, name: 'Must not register' },
      cookie,
    ),
    response,
  );
  assert.equal(response.statusCode, 409);
  delete process.env.ALLOW_GUEST_PLAY;
});

test('multiline answers are rejected before the progression RPC', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  mockDatabase(context, (url) => {
    if (url.pathname.endsWith('/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/quizzes')) return jsonResponse({ id: quizId });
    assert.ok(url.pathname.endsWith('/participants'));
    return jsonResponse({ id: participantId });
  });
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    const response = responseMock();
    await handler(
      request(
        'play',
        'POST',
        { quiz_id: quizId, question_id: questionId, answer_text: `first${separator}second` },
        cookie,
      ),
      response,
    );
    assert.equal(response.statusCode, 400);
  }
  delete process.env.ALLOW_GUEST_PLAY;
});

test('forfeit records a blank answer only for the signed player and never starts the next question', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  let writes = 0;
  mockDatabase(context, (url, options) => {
    if (url.pathname.endsWith('/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/participants')) {
      assert.equal(url.searchParams.get('telegram_id'), 'eq.-123');
      return jsonResponse({ id: participantId });
    }
    if (url.pathname.endsWith('/shown_questions')) {
      assert.equal(url.searchParams.get('participant_id'), `eq.${participantId}`);
      assert.equal(url.searchParams.get('question_id'), `eq.${questionId}`);
      assert.equal(url.searchParams.get('question.quiz_id'), `eq.${quizId}`);
      return jsonResponse({ id: 'shown' });
    }
    assert.ok(url.pathname.endsWith('/answers'), 'No progression RPC on forfeit');
    assert.equal(options.method, 'POST');
    assert.match(new Headers(options.headers).get('Prefer'), /resolution=ignore-duplicates/);
    assert.deepEqual(JSON.parse(options.body), {
      participant_id: participantId,
      question_id: questionId,
      answer_text: '',
      is_correct: null,
    });
    writes += 1;
    return jsonResponse(null);
  });
  for (const repetition of [1, 2]) {
    const response = responseMock();
    await handler(
      request(
        'abandon',
        'POST',
        { quiz_id: quizId, question_id: questionId, participant_id: 'forged' },
        cookie,
      ),
      response,
    );
    assert.equal(response.statusCode, 200);
  }
  assert.equal(writes, 2);
  delete process.env.ALLOW_GUEST_PLAY;
});

test('forfeit cannot close an unseen question', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  mockDatabase(context, (url) => {
    if (url.pathname.endsWith('/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/participants')) return jsonResponse({ id: participantId });
    assert.ok(url.pathname.endsWith('/shown_questions'));
    return jsonResponse(null);
  });
  const response = responseMock();
  await handler(
    request('abandon', 'POST', { quiz_id: quizId, question_id: questionId }, cookie),
    response,
  );
  assert.equal(response.statusCode, 409);
  delete process.env.ALLOW_GUEST_PLAY;
});

test('repeated resume requests reuse their original question snapshot', async (context) => {
  process.env.ALLOW_GUEST_PLAY = 'true';
  const cookie = `quiz_player=${signSession({ role: 'player', id: -123, expires: Date.now() + 10000 })}`;
  mockDatabase(context, (url, options) => {
    if (url.pathname.endsWith('/rpc/consume_rate_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/quizzes')) return jsonResponse({ id: quizId });
    if (url.pathname.endsWith('/participants')) return jsonResponse({ id: participantId });
    assert.ok(url.pathname.endsWith('/rpc/quiz_turn'));
    assert.deepEqual(JSON.parse(options.body), {
      p_participant_id: participantId,
      p_question_id: questionId,
      p_answer_text: '',
    });
    return jsonResponse({ completed: false, question: { id: 'next-question' } });
  });
  for (const repetition of [1, 2]) {
    const response = responseMock();
    await handler(
      request(
        'play',
        'POST',
        { quiz_id: quizId, resume_only: true, resume_question_id: questionId },
        cookie,
      ),
      response,
    );
    assert.equal(response.statusCode, 200);
  }
  delete process.env.ALLOW_GUEST_PLAY;
});

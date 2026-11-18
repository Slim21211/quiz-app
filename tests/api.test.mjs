import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/quiz.js';
import botHandler from '../api/bot.js';

process.env.SESSION_SECRET = 'test-only-session-secret-with-at-least-32-characters';
process.env.WEB_APP_URL = 'https://quiz.example.test';

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
    end() {
      return this;
    },
  };
}

test('private endpoints reject unauthenticated calls before querying the database', async () => {
  for (const [action, method] of [
    ['questions', 'GET'],
    ['question', 'POST'],
    ['quiz', 'POST'],
    ['review', 'GET'],
    ['review', 'PATCH'],
  ]) {
    const response = responseMock();
    await handler(
      { method, query: { action }, headers: { origin: process.env.WEB_APP_URL }, body: {} },
      response,
    );
    assert.equal(response.statusCode, 401, action);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
});
test('unknown endpoints and unsupported methods fail explicitly', async () => {
  for (const action of ['unknown', 'toString', ['quiz']]) {
    const response = responseMock();
    await handler({ method: 'GET', query: { action }, headers: {} }, response);
    assert.equal(response.statusCode, 404);
  }
  const response = responseMock();
  await handler({ method: 'DELETE', query: { action: 'quizzes' }, headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, 'GET');
});
test('login cannot be called by a third-party site', async () => {
  const response = responseMock();
  await handler(
    {
      method: 'POST',
      query: { action: 'login' },
      headers: { origin: 'https://attacker.test' },
      body: {},
    },
    response,
  );
  assert.equal(response.statusCode, 403);
});
test('API rejects oversized and malformed bodies', async () => {
  for (const body of [[], 'invalid']) {
    const response = responseMock();
    await handler(
      {
        method: 'POST',
        query: { action: 'login' },
        headers: { origin: process.env.WEB_APP_URL },
        body,
      },
      response,
    );
    assert.equal(response.statusCode, 400);
  }
  const response = responseMock();
  await handler(
    {
      method: 'POST',
      query: { action: 'login' },
      headers: { origin: process.env.WEB_APP_URL },
      body: { password: 'x'.repeat(21000) },
    },
    response,
  );
  assert.equal(response.statusCode, 413);
});
test('webhook rejects requests with missing and forged secret headers', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-only-webhook-secret';
  for (const headers of [{}, { 'x-telegram-bot-api-secret-token': 'forged' }]) {
    const response = responseMock();
    await botHandler({ method: 'POST', headers, body: { update_id: 1 } }, response);
    assert.equal(response.statusCode, 403);
  }
});
test('webhook validates update shape and request method', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-only-webhook-secret';
  const response = responseMock();
  await botHandler(
    {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET },
      body: {},
    },
    response,
  );
  assert.equal(response.statusCode, 400);
  const unsupported = responseMock();
  await botHandler({ method: 'DELETE', headers: {} }, unsupported);
  assert.equal(unsupported.statusCode, 405);
});

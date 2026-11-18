import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { getApiBaseUrl } from '../src/lib/apiUrl.ts';
import { getStaticRouteUrl } from '../src/lib/staticRoute.ts';
import { handleCors } from '../server/cors.js';
import { requireSameOrigin } from '../server/security.js';

process.env.WEB_APP_URL = 'https://quiz.elvada.ru';
function responseMock() {
  return {
    headers: {},
    statusCode: 200,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
}

test('API address supports same-origin development and a separate HTTPS server', () => {
  assert.equal(getApiBaseUrl(), '/api/quiz');
  assert.equal(getApiBaseUrl('https://api.quiz.elvada.ru/'), 'https://api.quiz.elvada.ru/api/quiz');
  assert.equal(getApiBaseUrl('http://localhost:5174'), 'http://localhost:5174/api/quiz');
  for (const address of [
    'http://api.quiz.elvada.ru',
    'https://name:password@api.quiz.elvada.ru',
    'https://api.quiz.elvada.ru/api',
    'https://api.quiz.elvada.ru?secret=value',
  ])
    assert.throws(() => getApiBaseUrl(address));
});

test('Pages route restoration preserves encoded routes and Telegram launch fragments', () => {
  const route = '/quiz/cinema?team=a%26b';
  const href = `https://quiz.elvada.ru/?__quiz_route=${encodeURIComponent(route)}#tgWebAppData=test-data&tgWebAppVersion=8.0`;
  assert.equal(getStaticRouteUrl(href), `${route}#tgWebAppData=test-data&tgWebAppVersion=8.0`);
  assert.equal(getStaticRouteUrl('https://quiz.elvada.ru/quiz/cinema'), null);
  for (const target of [
    '//attacker.test',
    '/\\attacker.test',
    'https://attacker.test',
    '/\\[invalid',
  ]) {
    assert.equal(
      getStaticRouteUrl(`https://quiz.elvada.ru/?__quiz_route=${encodeURIComponent(target)}`),
      null,
    );
  }
});

test('real Pages 404 redirect keeps Telegram launch data outside the server query', () => {
  const html = readFileSync('public/404.html', 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source);
  let destination;
  const location = new URL('https://quiz.elvada.ru/quiz/cinema?team=a%26b#tgWebAppData=test-data');
  runInNewContext(source, {
    URL,
    window: {
      location: {
        origin: location.origin,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        replace(value) {
          destination = value;
        },
      },
    },
  });
  const redirected = new URL(destination);
  assert.equal(redirected.pathname, '/');
  assert.equal(redirected.searchParams.get('__quiz_route'), '/quiz/cinema?team=a%26b');
  assert.equal(redirected.hash, '#tgWebAppData=test-data');
  assert.equal(redirected.search.includes('tgWebAppData'), false);
});

test('credentialed CORS permits exactly the configured frontend and Telegram header', () => {
  const response = responseMock();
  const handled = handleCors(
    {
      method: 'OPTIONS',
      headers: {
        origin: 'https://quiz.elvada.ru',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-telegram-init-data',
      },
    },
    response,
  );
  assert.equal(handled, true);
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://quiz.elvada.ru');
  assert.equal(response.headers['Access-Control-Allow-Credentials'], 'true');
  assert.equal(response.headers.Vary, 'Origin');
  assert.equal(response.ended, true);
});

test('CORS refuses foreign origins, unsupported methods and unexpected headers', () => {
  for (const origin of ['null', 'https://attacker.test', 'https://quiz.elvada.ru.attacker.test']) {
    assert.throws(() => handleCors({ method: 'GET', headers: { origin } }, responseMock()), {
      status: 403,
    });
  }
  assert.throws(
    () =>
      handleCors(
        {
          method: 'OPTIONS',
          headers: { origin: process.env.WEB_APP_URL, 'access-control-request-method': 'PUT' },
        },
        responseMock(),
      ),
    { status: 405 },
  );
  assert.throws(
    () =>
      handleCors(
        {
          method: 'OPTIONS',
          headers: {
            origin: process.env.WEB_APP_URL,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'authorization',
          },
        },
        responseMock(),
      ),
    { status: 403 },
  );
});

test('additional migration origins require explicit configuration and still enforce CSRF', () => {
  process.env.ADDITIONAL_WEB_APP_ORIGINS = 'https://old-app.vercel.app';
  const request = { method: 'POST', headers: { origin: 'https://old-app.vercel.app' } };
  const response = responseMock();
  assert.equal(handleCors(request, response), false);
  assert.doesNotThrow(() => requireSameOrigin(request));
  delete process.env.ADDITIONAL_WEB_APP_ORIGINS;
  assert.throws(() => requireSameOrigin(request), { status: 403 });
});

import quizHandler from '../api/quiz.js';
import { handleCors } from './cors.js';
import { HttpError } from './security.js';

async function readBody(request) {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let source = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 20000) {
        await reader.cancel();
        throw new HttpError(413, 'Слишком большой запрос.');
      }
      source += decoder.decode(chunk.value, { stream: true });
    }
    source += decoder.decode();
    return source ? JSON.parse(source) : undefined;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Некорректный JSON запроса.');
  } finally {
    reader.releaseLock();
  }
}

export async function serveQuizRequest(request) {
  const url = new URL(request.url);
  const adaptedRequest = {
    method: request.method,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(request.headers),
    body: undefined,
    runtime: 'supabase',
    sessionTransport: 'header',
  };
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  let statusCode = 200;
  let responseBody = null;
  const response = {
    setHeader(name, value) {
      headers.set(name, value);
    },
    status(code) {
      statusCode = code;
      return response;
    },
    json(value) {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      responseBody = JSON.stringify(value);
      return response;
    },
    end() {
      return response;
    },
  };
  try {
    if (!handleCors(adaptedRequest, response)) {
      adaptedRequest.body = await readBody(request);
      await quizHandler(adaptedRequest, response);
    }
  } catch (error) {
    response.status(error instanceof HttpError ? error.status : 500).json({
      message: error instanceof HttpError ? error.message : 'Ошибка сервера.',
    });
  }
  return new Response(responseBody, { status: statusCode, headers });
}

import { HttpError, isAllowedOrigin } from './security.js';

const allowedMethods = ['GET', 'POST', 'PATCH', 'DELETE'];
const allowedHeaders = [
  'content-type',
  'x-telegram-init-data',
  'x-quiz-admin-session',
  'x-quiz-player-session',
];

export function handleCors(request, response) {
  response.setHeader('Vary', 'Origin');
  const origin = request.headers.origin;
  if (origin !== undefined) {
    if (!isAllowedOrigin(origin)) throw new HttpError(403, 'Недопустимый источник запроса.');
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader(
      'Access-Control-Expose-Headers',
      'X-Quiz-Admin-Session, X-Quiz-Player-Session',
    );
  }
  if (request.method !== 'OPTIONS') return false;
  if (!origin) throw new HttpError(403, 'Отсутствует Origin запроса.');
  const requestedMethod = request.headers['access-control-request-method'];
  if (typeof requestedMethod !== 'string' || !allowedMethods.includes(requestedMethod)) {
    throw new HttpError(405, 'Метод не поддерживается.');
  }
  const requestedHeaders = String(request.headers['access-control-request-headers'] || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((header) => !allowedHeaders.includes(header))) {
    throw new HttpError(403, 'Недопустимые заголовки запроса.');
  }
  response.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
  response.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  response.setHeader('Access-Control-Max-Age', '600');
  response.status(204).end();
  return true;
}

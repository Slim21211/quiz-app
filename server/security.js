import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function equalSecrets(actual, expected) {
  const actualHash = createHmac('sha256', 'comparison').update(actual).digest();
  const expectedHash = createHmac('sha256', 'comparison').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function validateTelegram(initData, token, now = Date.now()) {
  if (typeof initData !== 'string' || initData.length > 16000)
    throw new HttpError(401, 'Некорректные данные Telegram.');
  if (!token) throw new HttpError(503, 'Вход через Telegram не настроен.');
  const params = new URLSearchParams(initData);
  if (new Set(params.keys()).size !== [...params.keys()].length) {
    throw new HttpError(401, 'Некорректная подпись Telegram.');
  }
  const hash = params.get('hash');
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest('hex');
  const authDate = Number(params.get('auth_date')) * 1000;
  if (
    !hash ||
    !equalSecrets(hash, expected) ||
    !authDate ||
    authDate > now + 30000 ||
    now - authDate > 86400000
  ) {
    throw new HttpError(401, 'Сессия Telegram истекла. Откройте приложение заново.');
  }
  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    throw new HttpError(401, 'Некорректный пользователь Telegram.');
  }
  if (
    !user ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.first_name !== 'string'
  ) {
    throw new HttpError(401, 'Некорректный пользователь Telegram.');
  }
  return {
    id: user.id,
    first_name: user.first_name.slice(0, 100),
    username: typeof user.username === 'string' ? user.username.slice(0, 100) : null,
  };
}

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, 'Серверные сессии не настроены.');
  return secret;
}

export function signSession(payload, secret = sessionSecret()) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function readSession(value, secret = sessionSecret(), now = Date.now()) {
  if (typeof value !== 'string') return null;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!equalSecrets(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    return Number.isFinite(payload.expires) && payload.expires > now ? payload : null;
  } catch {
    return null;
  }
}

export function getCookie(request, name) {
  const cookie = request.headers.cookie || '';
  return cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function setCookie(response, name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
  );
}

export function isAdmin(request) {
  const session = readSession(getCookie(request, 'quiz_admin'));
  return (
    session?.role === 'admin' &&
    !!process.env.ADMIN_PASSWORD &&
    session.version ===
      createHmac('sha256', sessionSecret()).update(process.env.ADMIN_PASSWORD).digest('hex')
  );
}

export function adminVersion() {
  return createHmac('sha256', sessionSecret())
    .update(process.env.ADMIN_PASSWORD || '')
    .digest('hex');
}

export function findPlayer(request) {
  const initData = request.headers['x-telegram-init-data'];
  if (initData) return validateTelegram(initData, process.env.BOT_TOKEN);
  if (process.env.ALLOW_GUEST_PLAY !== 'true') return null;
  const session = readSession(getCookie(request, 'quiz_player'));
  if (session?.role === 'player' && Number.isSafeInteger(session.id) && session.id < 0) {
    return { id: session.id, first_name: null, username: null };
  }
  return null;
}

export function getPlayer(request, response) {
  const player = findPlayer(request);
  if (player) return player;
  if (process.env.ALLOW_GUEST_PLAY !== 'true')
    throw new HttpError(401, 'Для участия откройте квиз через Telegram-бота.');
  const identity = -Number.parseInt(randomBytes(6).toString('hex'), 16) - 1;
  setCookie(
    response,
    'quiz_player',
    signSession({ role: 'player', id: identity, expires: Date.now() + 30 * 86400000 }),
    30 * 86400,
  );
  return { id: identity, first_name: null, username: null };
}

export function requireSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) throw new HttpError(403, 'Отсутствует Origin запроса.');
  const allowedOrigin = process.env.WEB_APP_URL;
  if (!allowedOrigin || origin !== new URL(allowedOrigin).origin)
    throw new HttpError(403, 'Недопустимый источник запроса.');
}

export function textField(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `Проверьте поле «${label}» (до ${maxLength} символов).`);
  }
  return value.trim();
}

export function uuidField(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new HttpError(400, 'Некорректный идентификатор.');
  }
  return value;
}

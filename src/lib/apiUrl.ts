export function getApiBaseUrl(configured?: string): string {
  if (!configured?.trim()) return '/api/quiz';
  const url = new URL(configured.trim());
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS server origin.');
  }
  return `${url.origin}/api/quiz`;
}

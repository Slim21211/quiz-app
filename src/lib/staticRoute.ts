export function getStaticRouteUrl(currentHref: string): string | null {
  const current = new URL(currentHref);
  const route = current.searchParams.get('__quiz_route');
  if (!route || !route.startsWith('/') || route.startsWith('//')) return null;
  try {
    const restored = new URL(route, current.origin);
    if (restored.origin !== current.origin) return null;
    // Preserve Telegram launch data in the fragment; never put it into a server query.
    return `${restored.pathname}${restored.search}${current.hash}`;
  } catch {
    return null;
  }
}

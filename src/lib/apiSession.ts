interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ApiSessions {
  prepare(headers: Headers): void;
  capture(headers: Headers): void;
}

function browserStorage(name: 'sessionStorage' | 'localStorage'): SessionStorage | null {
  try {
    return typeof window === 'undefined' ? null : window[name];
  } catch {
    return null;
  }
}

export function usesHeaderSessions(endpoint: string): boolean {
  return endpoint.startsWith('https://') && new URL(endpoint).pathname === '/functions/v1/quiz';
}

export function createApiSessions(
  endpoint: string,
  adminStorage: SessionStorage | null = browserStorage('sessionStorage'),
  playerStorage: SessionStorage | null = browserStorage('localStorage'),
): ApiSessions {
  const sessions = [
    { header: 'X-Quiz-Admin-Session', storage: adminStorage, key: `${endpoint}:admin`, value: '' },
    {
      header: 'X-Quiz-Player-Session',
      storage: playerStorage,
      key: `${endpoint}:player`,
      value: '',
    },
  ];
  for (const session of sessions) {
    try {
      session.value = session.storage?.getItem(session.key) || '';
    } catch {
      // Keep the current tab usable when browser storage is unavailable.
    }
  }
  return {
    prepare(headers) {
      for (const session of sessions) {
        if (session.value) headers.set(session.header, session.value);
      }
    },
    capture(headers) {
      for (const session of sessions) {
        if (!headers.has(session.header)) continue;
        session.value = headers.get(session.header) || '';
        try {
          if (session.value) session.storage?.setItem(session.key, session.value);
          else session.storage?.removeItem(session.key);
        } catch {
          // The in-memory session still works until the tab is closed.
        }
      }
    },
  };
}

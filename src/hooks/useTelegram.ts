import { useEffect } from 'react';

export function useTelegram(): void {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
  }, []);
}

import { useEffect, useState } from 'react';

export function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function useTimer(deadline: string, serverTime: string): number {
  const [localDeadline] = useState(
    () => Date.now() + Date.parse(deadline) - Date.parse(serverTime),
  );
  const [seconds, setSeconds] = useState(() => remainingSeconds(localDeadline, Date.now()));
  useEffect(() => {
    const update = () => setSeconds(remainingSeconds(localDeadline, Date.now()));
    const interval = window.setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [localDeadline]);
  return seconds;
}

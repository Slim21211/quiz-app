import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAbandonQuestionMutation } from '@/app/api';

export function useQuestionExit(
  quizId: string,
  questionId: string,
  submitted: RefObject<boolean>,
): boolean {
  const [forfeited, setForfeited] = useState(false);
  const closed = useRef(false);
  const mounted = useRef(false);
  const [abandon] = useAbandonQuestionMutation();
  const forfeit = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    if (mounted.current) setForfeited(true);
    // A failed unload request is recovered by the server when the attempt resumes.
    void abandon({ quiz_id: quizId, question_id: questionId })
      .unwrap()
      .catch(() => {});
  }, [abandon, quizId, questionId]);

  useEffect(() => {
    mounted.current = true;
    const webApp = window.Telegram?.WebApp;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') forfeit();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', forfeit);
    webApp?.onEvent?.('deactivated', forfeit);
    handleVisibility();
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', forfeit);
      webApp?.offEvent?.('deactivated', forfeit);
      // StrictMode reconnects effects synchronously; an actual route exit does not.
      queueMicrotask(() => {
        if (!mounted.current && !submitted.current) forfeit();
      });
    };
  }, [forfeit, submitted]);
  return forfeited;
}

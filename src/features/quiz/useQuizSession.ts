import type { PlayState } from '@/types';
import { useRef, useState } from 'react';
import { usePlayMutation } from '@/app/api';
import { errorMessage } from '@/components/Feedback';

interface QuizSessionState {
  name: string;
  setName: (name: string) => void;
  state: PlayState | null;
  actionError: string;
  isLoading: boolean;
  sendAnswer: (answer?: string) => Promise<void>;
}

export function useQuizSession(quizId: string): QuizSessionState {
  const [name, setName] = useState('');
  const [state, setState] = useState<PlayState | null>(null);
  const [actionError, setActionError] = useState('');
  const [play, { isLoading }] = usePlayMutation();
  const sending = useRef(false);
  async function sendAnswer(answer?: string): Promise<void> {
    if (sending.current) return;
    sending.current = true;
    setActionError('');
    try {
      const next = await play({
        quiz_id: quizId,
        name: name.trim(),
        ...(state?.question && answer !== undefined
          ? { question_id: state.question.id, answer_text: answer }
          : {}),
      }).unwrap();
      setState(next);
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    } finally {
      sending.current = false;
    }
  }
  return { name, setName, state, actionError, isLoading, sendAnswer };
}

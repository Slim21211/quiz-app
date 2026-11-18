import type { PlayState } from '@/types';
import { useEffect, useRef, useState } from 'react';
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

export function useQuizSession(
  quizId: string,
  resume: boolean,
  resumeQuestionId?: string | null,
): QuizSessionState {
  const [shouldResume] = useState(resume);
  const [resumeTarget] = useState(resumeQuestionId);
  const [name, setName] = useState('');
  const [state, setState] = useState<PlayState | null>(null);
  const [actionError, setActionError] = useState('');
  const [play, { isLoading }] = usePlayMutation();
  const sending = useRef(false);
  useEffect(() => {
    if (!shouldResume) return;
    let active = true;
    void play({ quiz_id: quizId, resume_only: true, resume_question_id: resumeTarget })
      .unwrap()
      .then((next) => {
        if (active) setState(next);
      })
      .catch((requestError: unknown) => {
        if (active) setActionError(errorMessage(requestError));
      });
    return () => {
      active = false;
    };
  }, [play, quizId, shouldResume, resumeTarget]);
  async function sendAnswer(answer?: string): Promise<void> {
    if (sending.current) return;
    sending.current = true;
    setActionError('');
    try {
      const next = await play({
        quiz_id: quizId,
        name: name.trim(),
        resume_only: shouldResume && !state,
        ...(!state && shouldResume ? { resume_question_id: resumeTarget } : {}),
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

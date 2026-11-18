import type { FormEvent } from 'react';
import type { PlayState, Quiz } from '@/types';
import { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGetQuizzesQuery, useGetMyProgressQuery } from '@/app/api';
import { useQuizSession } from './useQuizSession';
import { questionCountLabel } from '@/lib/text';
import { useQuestionExit } from '@/hooks/useQuestionExit';
import { useTimer } from '@/hooks/useTimer';
import { Feedback, errorMessage } from '@/components/Feedback';
import styles from '@/App.module.scss';

function QuestionTurn({
  state,
  quizId,
  busy,
  error,
  onAnswer,
}: {
  state: PlayState;
  quizId: string;
  busy: boolean;
  error: string;
  onAnswer: (answer: string) => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  const submitted = useRef(false);
  const forfeited = useQuestionExit(quizId, state.question?.id || '', submitted);
  const answerInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    answerInput.current?.focus({ preventScroll: true });
  }, []);
  const seconds = useTimer(state.deadline || state.server_time, state.server_time);
  useEffect(() => {
    if (!forfeited && seconds === 0 && !busy && !submitted.current) {
      submitted.current = true;
      void onAnswer('');
    }
  }, [seconds, busy, onAnswer, forfeited]);
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || (seconds > 0 && !answer.trim())) return;
    submitted.current = true;
    await onAnswer(seconds > 0 ? answer : '');
  }
  if (forfeited)
    return (
      <section className={styles.playCard}>
        <span className={styles.eyebrow}>Время на ответ — 0 секунд</span>
        <h2 className={styles.questionTitle}>Вопрос пропущен</h2>
        <p className={styles.muted}>
          Вы вышли из квиза или свернули приложение. Вернуться к этому вопросу нельзя.
        </p>
        {error && <Feedback error message={error} />}
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={busy}
            onClick={() => {
              submitted.current = true;
              void onAnswer('');
            }}
          >
            {busy ? 'Продолжаем…' : 'Продолжить'}
          </button>
          <Link className={styles.secondary} to="/">
            К каталогу
          </Link>
        </div>
      </section>
    );
  return (
    <section className={styles.playCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.eyebrow}>
          Вопрос {state.answered + 1} / {state.total}
        </span>
        <div
          className={seconds <= 10 ? styles.timerWarning : styles.timer}
          role="timer"
          aria-label={`Осталось ${seconds} секунд`}
        >
          {String(seconds).padStart(2, '0')}
          <small>сек</small>
        </div>
      </div>
      <progress
        className={styles.progress}
        max={state.total}
        value={state.answered}
        aria-label="Прогресс квиза"
      />
      <h2 className={styles.questionTitle}>{state.question?.question_text}</h2>
      <form className={styles.stack} onSubmit={handleSubmit}>
        <label className={styles.field}>
          Ваш ответ
          <input
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
            ref={answerInput}
            required
            maxLength={4000}
            placeholder="Сформулируйте ответ своими словами"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            disabled={seconds === 0 || busy}
          />
        </label>
        {error && <Feedback error message={error} />}
        {seconds === 0 && (
          <p className={styles.muted}>
            Время вышло. {error ? 'Повторите сохранение, чтобы продолжить.' : 'Сохраняем пропуск…'}
          </p>
        )}
        <button className={styles.primary} disabled={busy || (seconds > 0 && !answer.trim())}>
          {busy ? 'Сохраняем…' : seconds === 0 ? 'Повторить сохранение' : 'Отправить ответ'}
        </button>
      </form>
      <p className={styles.muted}>
        При выходе или сворачивании приложения текущий вопрос пропускается.
      </p>
    </section>
  );
}

function QuizSession({
  quiz,
  resume,
  resumeQuestionId,
}: {
  quiz: Quiz;
  resume: boolean;
  resumeQuestionId?: string | null;
}) {
  const { name, setName, state, actionError, isLoading, sendAnswer } = useQuizSession(
    quiz.id,
    resume,
    resumeQuestionId,
  );
  if (resume && !state)
    return (
      <>
        {actionError ? (
          <Feedback
            error
            message={actionError}
            retry={() => {
              void sendAnswer();
            }}
          />
        ) : (
          <Feedback message="Продолжаем квиз…" />
        )}
        <Link className={styles.secondary} to="/">
          К каталогу
        </Link>
      </>
    );
  if (state?.completed)
    return (
      <section className={`${styles.panel} ${styles.completion}`}>
        <span className={styles.eyebrow}>Игра завершена</span>
        <div className={styles.completionScore}>
          {state.answered}
          <span> / {state.total}</span>
        </div>
        <h1>Ваши ответы сохранены</h1>
        <p>
          Организатор проверит формулировки и выставит баллы. Следите за своей позицией в таблице.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} to={`/quiz/${quiz.slug}/results`}>
            Смотреть результаты
          </Link>
          <Link className={styles.secondary} to="/">
            Другие квизы
          </Link>
        </div>
      </section>
    );
  return (
    <>
      <div className={styles.pageHeading}>
        <Link to="/" className={styles.textButton}>
          К каталогу
        </Link>
        <h1>{quiz.name}</h1>
      </div>
      {state?.question ? (
        <QuestionTurn
          key={state.question.id}
          state={state}
          quizId={quiz.id}
          busy={isLoading}
          error={actionError}
          onAnswer={sendAnswer}
        />
      ) : (
        <section className={`${styles.panel} ${styles.narrow}`}>
          <span className={styles.eyebrow}>
            {questionCountLabel(quiz.question_count)} · 60 секунд на каждый
          </span>
          <h2>Готовы к игре?</h2>
          <p className={styles.muted}>
            На вопрос даётся 60 секунд. Если выйти из квиза или свернуть приложение, текущий вопрос
            будет пропущен. При продолжении откроется следующий.
          </p>
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault();
              void sendAnswer();
            }}
          >
            <label className={styles.field}>
              Имя в таблице результатов
              <input
                required
                maxLength={80}
                autoComplete="nickname"
                placeholder="Имя или название команды"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <small>Это имя будет видно всем участникам.</small>
            </label>
            {actionError && <Feedback error message={actionError} />}
            <div className={styles.introActions}>
              <button className={styles.primary} disabled={isLoading || !quiz.question_count}>
                {isLoading ? 'Готовим игру…' : 'Начать игру'}
              </button>
              <Link className={styles.secondary} to="/">
                Отмена
              </Link>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

export function QuizPlay() {
  const { slug } = useParams<{ slug: string }>();
  const { data: quizzes = [], isLoading, error, refetch } = useGetQuizzesQuery();
  const quiz = quizzes.find((item) => item.slug === slug && item.is_active);
  const progressQuery = useGetMyProgressQuery(undefined, { refetchOnMountOrArgChange: true });
  const progress = progressQuery.data?.find((attempt) => attempt.quiz_id === quiz?.id);
  if (isLoading || progressQuery.isLoading) return <Feedback message="Загружаем квиз…" />;
  if (error) return <Feedback error message={errorMessage(error)} retry={refetch} />;
  if (!quiz)
    return (
      <Feedback message="Квиз не найден или ещё не опубликован. Выберите другую игру в каталоге." />
    );
  if (progressQuery.error)
    return (
      <Feedback error message={errorMessage(progressQuery.error)} retry={progressQuery.refetch} />
    );
  if (progress?.completed)
    return (
      <section className={`${styles.panel} ${styles.completion}`}>
        <span className={styles.eyebrow}>Квиз пройден</span>
        <h1>{quiz.name}</h1>
        {progress.correct_count === null ? (
          <p>Ваши ответы сохранены и ожидают проверки.</p>
        ) : (
          <p className={styles.completionScore}>
            {progress.correct_count}
            <span> / {progress.total_count}</span>
          </p>
        )}
        <div className={styles.actions}>
          <Link className={styles.primary} to={`/quiz/${quiz.slug}/results`}>
            Смотреть результаты
          </Link>
          <Link className={styles.secondary} to="/">
            К каталогу
          </Link>
        </div>
      </section>
    );
  return (
    <QuizSession
      key={quiz.id}
      quiz={quiz}
      resume={Boolean(progress)}
      resumeQuestionId={progress?.resume_question_id}
    />
  );
}

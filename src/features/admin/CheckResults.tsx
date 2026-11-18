import { useState } from 'react';
import {
  useGetQuizzesQuery,
  useGetParticipantsWithAnswersQuery,
  useCheckAnswerMutation,
} from '@/app/api';
import { Feedback, errorMessage } from '@/components/Feedback';
import { QuizPicker } from '@/components/QuizPicker';
import { answerHint } from '@/lib/answerComparison';
import styles from '@/App.module.scss';

export function CheckResults() {
  const {
    data: quizzes = [],
    isLoading: loadingQuizzes,
    error: quizzesError,
    refetch: refetchQuizzes,
  } = useGetQuizzesQuery();
  const [selectedId, setSelectedId] = useState('');
  const quizId = quizzes.find((quiz) => quiz.id === selectedId)?.id || quizzes[0]?.id || '';
  const [participantId, setParticipantId] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const {
    currentData: participants = [],
    isFetching,
    error,
    refetch,
  } = useGetParticipantsWithAnswersQuery(quizId, { skip: !quizId });
  const [checkAnswer, checking] = useCheckAnswerMutation();
  const participant = participants.find((item) => item.id === participantId);
  const answers =
    participant?.answers.filter((answer) => !onlyPending || answer.is_correct === null) || [];
  async function handleCheck(answerId: string, isCorrect: boolean | null): Promise<void> {
    try {
      await checkAnswer({ id: answerId, is_correct: isCorrect }).unwrap();
    } catch {
      /* Mutation error is rendered below. */
    }
  }
  return (
    <>
      <div className={styles.pageHeading}>
        <span className={styles.eyebrow}>Решение за вами</span>
        <h1>Проверка ответов</h1>
        <p>Учитывайте синонимы, опечатки и смысл ответа. Любую оценку можно изменить.</p>
      </div>
      {loadingQuizzes ? (
        <Feedback message="Загружаем квизы…" />
      ) : quizzesError ? (
        <Feedback error message={errorMessage(quizzesError)} retry={refetchQuizzes} />
      ) : !quizzes.length ? (
        <Feedback message="Сначала создайте квиз." />
      ) : (
        <>
          <section className={styles.panel}>
            <QuizPicker
              quizzes={quizzes}
              selected={quizId}
              onChange={(selected) => {
                setSelectedId(selected);
                setParticipantId('');
                checking.reset();
              }}
            />
          </section>
          {checking.error && <Feedback error message={errorMessage(checking.error)} />}
          {error ? (
            <Feedback error message={errorMessage(error)} retry={refetch} />
          ) : (
            !participant &&
            (isFetching ? (
              <Feedback message="Загружаем участников…" />
            ) : !participants.length ? (
              <Feedback message="В этом квизе пока нет участников." />
            ) : (
              <div className={styles.panel}>
                <h2>Участники · {participants.length}</h2>
                <div className={styles.stack}>
                  {participants.map((item) => (
                    <button
                      className={styles.participantRow}
                      key={item.id}
                      onClick={() => setParticipantId(item.id)}
                    >
                      <strong>
                        {item.participant_number || item.telegram_first_name || 'Участник'}
                      </strong>
                      <span className={styles.badge}>
                        {item.answers.filter((answer) => answer.is_correct !== null).length} /{' '}
                        {item.answers.length} проверено
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          {participant && (
            <>
              <div className={styles.sectionHeader}>
                <div>
                  <button className={styles.textButton} onClick={() => setParticipantId('')}>
                    К списку участников
                  </button>
                  <h2>
                    {participant.participant_number ||
                      participant.telegram_first_name ||
                      'Участник'}
                  </h2>
                </div>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={onlyPending}
                    onChange={(event) => setOnlyPending(event.target.checked)}
                  />
                  Только непроверенные
                </label>
              </div>
              {!answers.length && (
                <Feedback
                  message={
                    participant.answers.length
                      ? 'Все ответы проверены.'
                      : 'Участник ещё не ответил на вопросы.'
                  }
                />
              )}
              <div className={styles.stack}>
                {answers.map((answer) => {
                  const hint = answerHint(answer.answer_text, answer.question.correct_answer);
                  return (
                    <article
                      className={styles.reviewCard}
                      key={answer.id}
                      data-verdict={
                        answer.is_correct === null
                          ? 'pending'
                          : answer.is_correct
                            ? 'correct'
                            : 'incorrect'
                      }
                    >
                      <span className={styles.badge}>
                        {answer.is_correct === null
                          ? 'Ожидает проверки'
                          : answer.is_correct
                            ? 'Засчитан'
                            : 'Не засчитан'}
                      </span>
                      <h3>
                        {answer.question.order_number}. {answer.question.question_text}
                      </h3>
                      <dl className={styles.answerPair}>
                        <div>
                          <dt>Ответ участника</dt>
                          <dd>{answer.answer_text || 'Ответ не дан'}</dd>
                        </div>
                        <div>
                          <dt>Эталонный ответ</dt>
                          <dd>{answer.question.correct_answer}</dd>
                        </div>
                      </dl>
                      {hint && <p className={styles.hint}>{hint}</p>}
                      <div className={styles.actions}>
                        <button
                          className={styles.primary}
                          disabled={checking.isLoading || answer.is_correct === true}
                          onClick={() => {
                            void handleCheck(answer.id, true);
                          }}
                        >
                          Засчитать
                        </button>
                        <button
                          className={styles.secondary}
                          disabled={checking.isLoading || answer.is_correct === false}
                          onClick={() => {
                            void handleCheck(answer.id, false);
                          }}
                        >
                          Не засчитать
                        </button>
                        {answer.is_correct !== null && (
                          <button
                            className={styles.textButton}
                            disabled={checking.isLoading}
                            onClick={() => {
                              void handleCheck(answer.id, null);
                            }}
                          >
                            Снять оценку
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

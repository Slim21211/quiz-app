import { useGetMyProgressQuery, useGetMyReviewQuery } from '@/app/api';
import { Feedback, errorMessage } from '@/components/Feedback';
import styles from '@/App.module.scss';

export function PersonalResults({ quizId }: { quizId: string }) {
  const progress = useGetMyProgressQuery(undefined, {
    pollingInterval: 15000,
    refetchOnMountOrArgChange: true,
  });
  const completed = progress.currentData?.some(
    (attempt) => attempt.quiz_id === quizId && attempt.completed,
  );
  const review = useGetMyReviewQuery(quizId, {
    skip: !completed,
    pollingInterval: 15000,
    refetchOnMountOrArgChange: true,
  });
  if (progress.error)
    return <Feedback error message={errorMessage(progress.error)} retry={progress.refetch} />;
  if (!completed) return null;
  if (review.error)
    return <Feedback error message={errorMessage(review.error)} retry={review.refetch} />;
  const result = review.currentData;
  return (
    <section className={styles.personalReview} aria-label="Ваш личный результат">
      <h2>Ваш результат</h2>
      {!result ? (
        <Feedback message="Загружаем ваш результат…" />
      ) : result.status === 'pending' ? (
        <p className={styles.muted}>
          Ваши ответы на проверке. Разбор появится, когда организатор проверит их все.
        </p>
      ) : result.status !== 'ready' ? (
        <p className={styles.muted}>Разбор будет доступен после завершения и проверки квиза.</p>
      ) : (
        <>
          <p>
            <strong>
              {result.correct_count} / {result.total_count}
            </strong>
            {' · '}Этот разбор виден только вам.
          </p>
          <details>
            <summary>Посмотреть свои ответы</summary>
            <div className={styles.stack}>
              {result.answers.map((answer) => (
                <article
                  key={answer.id}
                  className={styles.reviewCard}
                  data-verdict={answer.is_correct ? 'correct' : 'incorrect'}
                >
                  <span className={styles.badge}>
                    {answer.is_correct ? 'Засчитан' : 'Не засчитан'}
                  </span>
                  <h3>
                    {answer.question.order_number}. {answer.question.question_text}
                  </h3>
                  <dl className={styles.answerPair}>
                    <div>
                      <dt>Ваш ответ</dt>
                      <dd>{answer.answer_text || 'Ответ не дан'}</dd>
                    </div>
                    <div>
                      <dt>Правильный ответ</dt>
                      <dd>{answer.question.correct_answer}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}

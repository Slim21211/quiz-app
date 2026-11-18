import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useGetQuizzesQuery, useGetResultsQuery } from '@/app/api';
import { Feedback, errorMessage } from '@/components/Feedback';
import { QuizPicker } from '@/components/QuizPicker';
import styles from '@/App.module.scss';

export function Results() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState('');
  const {
    data: quizzes = [],
    isLoading,
    error: quizzesError,
    refetch: refetchQuizzes,
  } = useGetQuizzesQuery();
  const quiz = slug
    ? quizzes.find((item) => item.slug === slug)
    : quizzes.find((item) => item.id === selectedId) || quizzes[0];
  const {
    currentData: results = [],
    isFetching,
    error,
    refetch,
  } = useGetResultsQuery(quiz?.id || '', { skip: !quiz, pollingInterval: 15000 });
  const pending = results.some((result) => result.pending_count > 0);
  return (
    <>
      <div className={styles.pageHeading}>
        <span className={styles.eyebrow}>Таблица игры</span>
        <h1>Знания в цифрах</h1>
        <p>Один верный ответ — один балл. При равных баллах участники делят место.</p>
      </div>
      {isLoading ? (
        <Feedback message="Загружаем квизы…" />
      ) : quizzesError ? (
        <Feedback error message={errorMessage(quizzesError)} retry={refetchQuizzes} />
      ) : !quiz ? (
        <Feedback
          message={slug ? 'Квиз не найден или скрыт из каталога.' : 'Пока нет доступных квизов.'}
        />
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.toolbar}>
              <QuizPicker
                quizzes={quizzes}
                selected={quiz.id}
                onChange={(quizId) => {
                  const selected = quizzes.find((item) => item.id === quizId);
                  setSelectedId(quizId);
                  if (slug && selected) navigate(`/quiz/${selected.slug}/results`);
                }}
              />
              <button className={styles.secondary} onClick={refetch} disabled={isFetching}>
                Обновить
              </button>
            </div>
          </section>
          {error ? (
            <Feedback error message={errorMessage(error)} retry={refetch} />
          ) : isFetching && !results.length ? (
            <Feedback message="Загружаем результаты…" />
          ) : !results.length ? (
            <Feedback message="Таблица пока пуста. Первые участники появятся после начала игры." />
          ) : (
            <section className={styles.panel}>
              <div className={styles.sectionHeader}>
                <h2>{quiz.name}</h2>
                <span className={styles.badge}>
                  {pending ? 'Идёт проверка' : 'Все ответы проверены'}
                </span>
              </div>
              <p className={styles.muted}>
                {pending
                  ? 'Результаты предварительные: часть ответов ожидает решения организатора.'
                  : 'Участники могут продолжать игру. Таблица обновляется каждые 15 секунд.'}
              </p>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <caption className={styles.visuallyHidden}>
                    Результаты квиза «{quiz.name}»
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Место</th>
                      <th scope="col">Участник</th>
                      <th scope="col">Баллы</th>
                      <th scope="col">Ответы</th>
                      <th scope="col">На проверке</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => {
                      const rank =
                        results.findIndex((item) => item.correct_count === result.correct_count) +
                        1;
                      return (
                        <tr key={result.id}>
                          <td>
                            <span className={rank <= 3 ? styles.topRank : styles.rank}>{rank}</span>
                          </td>
                          <th scope="row">{result.name}</th>
                          <td className={styles.score}>
                            {result.correct_count} <span>/ {result.total_count}</span>
                          </td>
                          <td>
                            {result.answered_count} / {result.total_count}
                          </td>
                          <td>{result.pending_count || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <Link to={`/quiz/${quiz.slug}`} className={styles.textButton}>
            К странице квиза
          </Link>
        </>
      )}
    </>
  );
}

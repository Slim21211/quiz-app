import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useGetQuizzesQuery, useGetResultsQuery } from '@/app/api';
import { Feedback, errorMessage } from '@/components/Feedback';
import { QuizPicker } from '@/components/QuizPicker';
import { ResultGroups } from './ResultGroups';
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
  const activeQuizzes = quizzes.filter((item) => item.is_active);
  const quiz = slug
    ? activeQuizzes.find((item) => item.slug === slug)
    : activeQuizzes.find((item) => item.id === selectedId) || activeQuizzes[0];
  const {
    currentData: results,
    isFetching,
    error,
    refetch,
  } = useGetResultsQuery(quiz?.id || '', { skip: !quiz, pollingInterval: 15000 });
  return (
    <>
      <div className={styles.pageHeading}>
        <span className={styles.eyebrow}>Результаты игры</span>
        <h1>Результаты</h1>
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
          <div className={styles.resultsToolbar}>
            <QuizPicker
              quizzes={activeQuizzes}
              selected={quiz.id}
              onChange={(quizId) => {
                const selected = activeQuizzes.find((item) => item.id === quizId);
                setSelectedId(quizId);
                if (slug && selected) navigate(`/quiz/${selected.slug}/results`);
              }}
            />
            <button className={styles.secondary} onClick={refetch} disabled={isFetching}>
              Обновить
            </button>
          </div>
          {error ? (
            <Feedback error message={errorMessage(error)} retry={refetch} />
          ) : !results ? (
            <Feedback message="Загружаем результаты…" />
          ) : (
            <ResultGroups results={results} />
          )}
          <Link to="/" className={styles.textButton}>
            К каталогу квизов
          </Link>
        </>
      )}
    </>
  );
}

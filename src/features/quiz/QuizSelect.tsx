import { Link } from 'react-router-dom';
import { useGetQuizzesQuery, useGetMyProgressQuery } from '@/app/api';
import { Feedback, errorMessage } from '@/components/Feedback';
import { QuizCatalogCard } from './QuizCatalogCard';
import styles from '@/App.module.scss';

const steps = [
  { title: 'Выберите тему', description: 'Найдите квиз, который вам интересен.' },
  { title: 'Ответьте на вопросы', description: 'На каждый ответ — 60 секунд.' },
  { title: 'Узнайте результат', description: 'Баллы появятся после проверки.' },
];

export function QuizSelect() {
  const { data: quizzes = [], isLoading, error, refetch } = useGetQuizzesQuery();
  const progressQuery = useGetMyProgressQuery(undefined, {
    refetchOnMountOrArgChange: true,
    pollingInterval: 15000,
  });
  const available = quizzes.filter((quiz) => quiz.is_active);
  return (
    <>
      <section className={styles.catalogIntro} aria-labelledby="catalog-title">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Тематические игры</span>
            <h1 id="catalog-title">Выберите квиз</h1>
          </div>
          <span className={styles.badge}>{available.length} в каталоге</span>
        </div>
        <ol className={styles.steps} aria-label="Как играть">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      {progressQuery.error && (
        <Feedback error message={errorMessage(progressQuery.error)} retry={progressQuery.refetch} />
      )}
      {isLoading ? (
        <Feedback message="Загружаем каталог…" />
      ) : error ? (
        <Feedback error message={errorMessage(error)} retry={refetch} />
      ) : !available.length ? (
        <Feedback message="Пока нет опубликованных квизов. Организатор скоро добавит первую игру." />
      ) : (
        <div className={styles.quizGrid}>
          {available.map((quiz, index) => (
            <QuizCatalogCard
              key={quiz.id}
              quiz={quiz}
              index={index}
              progress={progressQuery.data?.find((attempt) => attempt.quiz_id === quiz.id)}
              progressReady={!progressQuery.isLoading && !progressQuery.error}
            />
          ))}
        </div>
      )}
      {!isLoading && !error && available.length > 0 && (
        <Link className={styles.catalogResultsLink} to="/results">
          Все результаты
        </Link>
      )}
    </>
  );
}

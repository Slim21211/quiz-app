import type { Quiz, QuizProgress } from '@/types';
import { Link } from 'react-router-dom';
import { questionCountLabel } from '@/lib/text';
import styles from '@/App.module.scss';

interface QuizCatalogCardProps {
  quiz: Quiz;
  index: number;
  progress?: QuizProgress;
  progressReady: boolean;
}

export function QuizCatalogCard({ quiz, index, progress, progressReady }: QuizCatalogCardProps) {
  const completed = progress?.completed === true;
  const status = completed
    ? 'Пройден'
    : progress
      ? 'В процессе'
      : quiz.question_count
        ? 'Можно играть'
        : 'Скоро';
  return (
    <article className={styles.quizCard} data-completed={completed}>
      <div className={styles.cardTop}>
        <span className={styles.quizNumber}>{String(index + 1).padStart(2, '0')}</span>
        <span className={completed ? styles.completedBadge : styles.badge}>{status}</span>
      </div>
      <h2>{quiz.name}</h2>
      <p className={styles.muted}>{questionCountLabel(quiz.question_count)} · 60 секунд на ответ</p>
      <div className={styles.cardSummary}>
        {completed ? (
          progress.correct_count === null ? (
            <p>Ответы на проверке</p>
          ) : (
            <p>
              Ваш результат{' '}
              <strong>
                {progress.correct_count}
                <span> / {progress.total_count}</span>
              </strong>
            </p>
          )
        ) : progress ? (
          <p>
            Ответов сохранено: {progress.answered_count} из {progress.total_count}
          </p>
        ) : (
          <p>Одна попытка. Свободные ответы.</p>
        )}
      </div>
      <div className={styles.cardActions}>
        {!progressReady ? (
          <button className={styles.secondary} disabled>
            Проверяем попытку…
          </button>
        ) : completed ? (
          <Link className={styles.secondary} to={`/quiz/${quiz.slug}/results`}>
            Смотреть результаты
          </Link>
        ) : quiz.question_count > 0 ? (
          <Link className={styles.primary} to={`/quiz/${quiz.slug}`}>
            {progress ? 'Продолжить' : 'Начать игру'}
          </Link>
        ) : (
          <span className={styles.muted}>Вопросы готовятся</span>
        )}
        {!completed && (
          <Link className={styles.textButton} to={`/quiz/${quiz.slug}/results`}>
            Результаты
          </Link>
        )}
      </div>
    </article>
  );
}

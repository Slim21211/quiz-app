import { Link } from 'react-router-dom';
import { useGetQuizzesQuery } from '@/app/api';
import { Feedback, errorMessage } from '@/components/Feedback';
import { questionCountLabel } from '@/lib/text';
import styles from '@/App.module.scss';

export function QuizSelect() {
  const { data: quizzes = [], isLoading, error, refetch } = useGetQuizzesQuery();
  const available = quizzes.filter((quiz) => quiz.is_active);
  return (
    <>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Ваша следующая игра</span>
          <h1>
            Есть вопрос.
            <br />
            <span>Есть ваш ответ.</span>
          </h1>
          <p>
            Выбирайте тему, включайтесь в игру и поднимайтесь в таблице результатов. На каждый
            вопрос — одна минута.
          </p>
        </div>
        <div className={styles.heroStats}>
          <strong>
            60<span>секунд</span>
          </strong>
          <p>
            Чтобы найти
            <br />
            свой ответ
          </p>
        </div>
      </section>
      <div className={styles.sectionHeader}>
        <h2>Выберите свой квиз</h2>
        <span className={styles.badge}>{available.length} в каталоге</span>
      </div>
      {isLoading ? (
        <Feedback message="Загружаем каталог…" />
      ) : error ? (
        <Feedback error message={errorMessage(error)} retry={refetch} />
      ) : !available.length ? (
        <Feedback message="Пока нет опубликованных квизов. Организатор скоро добавит первую игру." />
      ) : (
        <div className={styles.quizGrid}>
          {available.map((quiz, index) => (
            <article className={styles.quizCard} key={quiz.id}>
              <div className={styles.cardTop}>
                <span className={styles.quizNumber}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.badge}>
                  {quiz.question_count ? 'Можно играть' : 'Скоро'}
                </span>
              </div>
              <h3>{quiz.name}</h3>
              <p className={styles.muted}>
                {questionCountLabel(quiz.question_count)} · 60 секунд на ответ
              </p>
              <div className={styles.cardActions}>
                {quiz.question_count > 0 ? (
                  <Link className={styles.primary} to={`/quiz/${quiz.slug}`}>
                    Начать игру
                  </Link>
                ) : (
                  <span className={styles.muted}>Вопросы готовятся</span>
                )}
                <Link className={styles.textButton} to={`/quiz/${quiz.slug}/results`}>
                  Результаты
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      <aside className={styles.tip}>
        <span className={styles.stepNumber}>01 / 03</span>
        <p>Выберите тему. Ответьте на вопросы. Дождитесь проверки организатора.</p>
      </aside>
    </>
  );
}

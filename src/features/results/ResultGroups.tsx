import type { QuizResults } from '@/types';
import styles from '@/App.module.scss';

export function ResultGroups({ results }: { results: QuizResults }) {
  return (
    <div className={styles.resultGroups}>
      <section className={styles.resultSection} aria-labelledby="ranked-title">
        <div className={styles.sectionHeader}>
          <h2 id="ranked-title">Итоговые результаты</h2>
          <span className={styles.badge}>Участников: {results.ranked.length}</span>
        </div>
        {!results.ranked.length ? (
          <p className={styles.emptyResults}>Проверенные результаты пока не опубликованы.</p>
        ) : (
          <>
            <div className={styles.leaderboardHeader} aria-hidden="true">
              <span>Место</span>
              <span>Участник</span>
              <span>Баллы</span>
            </div>
            <ol className={styles.leaderboard} aria-label="Итоговые результаты">
              {results.ranked.map((result) => {
                const rank =
                  results.ranked.findIndex((item) => item.correct_count === result.correct_count) +
                  1;
                return (
                  <li className={styles.resultRow} key={result.id}>
                    <span
                      className={rank <= 3 ? styles.topRank : styles.rank}
                      aria-label={`Место ${rank}`}
                    >
                      {rank}
                    </span>
                    <h3>{result.name}</h3>
                    <div className={styles.resultScore}>
                      <strong>
                        {result.correct_count}
                        <span> / {result.total_count}</span>
                      </strong>
                      <small>баллы</small>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
      {results.pending.length > 0 && (
        <section className={styles.resultSection} aria-labelledby="pending-title">
          <div className={styles.sectionHeader}>
            <h2 id="pending-title">На проверке</h2>
            <span className={styles.badge}>{results.pending.length}</span>
          </div>
          <ul className={styles.waitingList}>
            {results.pending.map((result) => (
              <li key={result.id}>
                <strong>{result.name}</strong>
                <span>
                  Проверено {result.checked_count} из {result.total_count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {results.playing.length > 0 && (
        <section className={styles.resultSection} aria-labelledby="playing-title">
          <div className={styles.sectionHeader}>
            <h2 id="playing-title">В игре</h2>
            <span className={styles.badge}>{results.playing.length}</span>
          </div>
          <ul className={styles.waitingList}>
            {results.playing.map((result) => (
              <li key={result.id}>
                <strong>{result.name}</strong>
                <span>
                  Ответов {result.answered_count} из {result.total_count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

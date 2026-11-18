import type { Quiz } from '@/types';
import styles from '@/App.module.scss';

export function QuizPicker({
  quizzes,
  selected,
  onChange,
}: {
  quizzes: Quiz[];
  selected: string;
  onChange: (quizId: string) => void;
}) {
  return (
    <label className={styles.field}>
      Квиз
      <select value={selected} onChange={(event) => onChange(event.target.value)}>
        {!quizzes.length && <option value="">Нет доступных квизов</option>}
        {quizzes.map((quiz) => (
          <option key={quiz.id} value={quiz.id}>
            {quiz.name}
            {!quiz.is_active ? ' (черновик)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

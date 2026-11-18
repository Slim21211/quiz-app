import styles from '@/App.module.scss';

export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data;
    if (
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
    )
      return data.message;
  }
  return 'Не удалось загрузить данные. Проверьте подключение и повторите попытку.';
}

export function Feedback({
  message,
  error = false,
  retry,
}: {
  message: string;
  error?: boolean;
  retry?: () => void;
}) {
  return (
    <div className={error ? styles.error : styles.notice} role={error ? 'alert' : 'status'}>
      <p>{message}</p>
      {retry && (
        <button className={styles.secondary} onClick={retry}>
          Повторить
        </button>
      )}
    </div>
  );
}

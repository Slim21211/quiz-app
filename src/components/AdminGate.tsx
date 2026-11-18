import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useGetSessionQuery, useLoginMutation } from '@/app/api';
import { Feedback, errorMessage } from './Feedback';
import styles from '@/App.module.scss';

export function AdminGate({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useGetSessionQuery();
  const [password, setPassword] = useState('');
  const [login, loginState] = useLoginMutation();
  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await login(password).unwrap();
      setPassword('');
    } catch {
      /* Error is rendered below. */
    }
  }
  if (isLoading) return <Feedback message="Проверяем сессию…" />;
  if (error) return <Feedback error message={errorMessage(error)} retry={refetch} />;
  if (data?.admin) return <>{children}</>;
  return (
    <section className={`${styles.panel} ${styles.narrow}`}>
      <span className={styles.eyebrow}>Для организаторов</span>
      <h1>Вход в управление</h1>
      <p className={styles.muted}>Создавайте квизы и проверяйте ответы участников.</p>
      <form onSubmit={handleLogin} className={styles.stack}>
        <label className={styles.field}>
          Пароль администратора
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {loginState.error && <Feedback error message={errorMessage(loginState.error)} />}
        <button className={styles.primary} disabled={loginState.isLoading}>
          {loginState.isLoading ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </section>
  );
}

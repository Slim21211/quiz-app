import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet, Link } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './app/store';
import { useGetSessionQuery, useLogoutMutation } from './app/api';
import { AdminGate } from './components/AdminGate';
import { Feedback, errorMessage } from './components/Feedback';
import { CreateQuestions } from './features/admin/CreateQuestions';
import { CheckResults } from './features/admin/CheckResults';
import { QuizPlay } from './features/quiz/QuizPlay';
import { Results } from './features/results/Results';
import { QuizSelect } from './features/quiz/QuizSelect';
import { useTelegram } from './hooks/useTelegram';
import styles from './App.module.scss';

function Layout() {
  useTelegram();
  const { data } = useGetSessionQuery();
  const [logout, { error, isLoading }] = useLogoutMutation();
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label="Quizroom — каталог квизов">
          <span className={styles.brandMark}>Q</span>Quizroom
        </Link>
        <nav className={styles.nav} aria-label="Главная навигация">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? styles.activeNav : undefined)}
          >
            Квизы
          </NavLink>
          <NavLink
            to="/results"
            className={({ isActive }) => (isActive ? styles.activeNav : undefined)}
          >
            Результаты
          </NavLink>
          <NavLink
            to="/admin/quizzes"
            className={({ isActive }) => (isActive ? styles.activeNav : undefined)}
          >
            Управление
          </NavLink>
        </nav>
        {data?.admin && (
          <button
            className={styles.textButton}
            disabled={isLoading}
            onClick={() => {
              void logout()
                .unwrap()
                .catch(() => {});
            }}
          >
            Выйти
          </button>
        )}
      </header>
      <main className={styles.main}>
        {error && <Feedback error message={errorMessage(error)} />}
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <span>Quizroom</span>
        <span>Знания решают. Попробуйте свои силы.</span>
      </footer>
    </div>
  );
}

function AdminLayout() {
  return (
    <AdminGate>
      <nav className={styles.tabs} aria-label="Управление квизами">
        <NavLink
          to="/admin/quizzes"
          className={({ isActive }) => (isActive ? styles.activeTab : undefined)}
        >
          Квизы и вопросы
        </NavLink>
        <NavLink
          to="/admin/check"
          className={({ isActive }) => (isActive ? styles.activeTab : undefined)}
        >
          Проверка ответов
        </NavLink>
      </nav>
      <Outlet />
    </AdminGate>
  );
}

function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<QuizSelect />} />
            <Route path="select" element={<Navigate to="/" replace />} />
            <Route path="quiz/main" element={<Navigate to="/quiz/new-year" replace />} />
            <Route path="quiz/:slug" element={<QuizPlay />} />
            <Route path="quiz/:slug/results" element={<Results />} />
            <Route path="results" element={<Results />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/quizzes" replace />} />
              <Route path="quizzes" element={<CreateQuestions />} />
              <Route path="questions" element={<Navigate to="/admin/quizzes" replace />} />
              <Route path="check" element={<CheckResults />} />
            </Route>
            <Route
              path="*"
              element={
                <section className={styles.panel}>
                  <h1>Страница не найдена</h1>
                  <Link to="/" className={styles.primary}>
                    Открыть каталог
                  </Link>
                </section>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}
export default App;

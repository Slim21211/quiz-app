import { Link } from 'react-router-dom';
import { Feedback, errorMessage } from '@/components/Feedback';
import { QuizPicker } from '@/components/QuizPicker';
import { useQuizEditor } from './useQuizEditor';
import styles from '@/App.module.scss';

export function CreateQuestions() {
  const {
    quizzes,
    isLoading,
    error,
    refetch,
    selectedQuiz,
    name,
    setName,
    slug,
    setSlug,
    questionText,
    setQuestionText,
    correctAnswer,
    setCorrectAnswer,
    editingId,
    setEditingId,
    message,
    setMessage,
    actionError,
    setActionError,
    creatingQuiz,
    updatingQuiz,
    questions,
    loadingQuestions,
    fetchingQuestions,
    questionsError,
    refetchQuestions,
    busy,
    resetForm,
    handleCreateQuiz,
    handleSaveQuestion,
    handleDelete,
    handleToggle,
    setSelectedId,
  } = useQuizEditor();
  return (
    <>
      <div className={styles.pageHeading}>
        <span className={styles.eyebrow}>Студия организатора</span>
        <h1>Квизы и вопросы</h1>
        <p>
          Создайте тему и наполните её вопросами. После начала игры состав вопросов фиксируется.
        </p>
      </div>
      {actionError && <Feedback error message={actionError} />}
      {message && <Feedback message={message} />}
      <details className={styles.panel} open={!isLoading && !quizzes.length}>
        <summary>Создать новый квиз</summary>
        <form className={styles.stack} onSubmit={handleCreateQuiz}>
          <label className={styles.field}>
            Название
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, Кино без границ"
            />
          </label>
          <label className={styles.field}>
            Адрес квиза
            <input
              required
              maxLength={80}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="cinema"
            />
            <small>Латинские буквы, цифры и дефис. Ссылка: /quiz/{slug || 'cinema'}</small>
          </label>
          <button className={styles.primary} disabled={creatingQuiz.isLoading}>
            {creatingQuiz.isLoading ? 'Создаём…' : 'Создать черновик'}
          </button>
        </form>
      </details>
      {isLoading ? (
        <Feedback message="Загружаем квизы…" />
      ) : error ? (
        <Feedback error message={errorMessage(error)} retry={refetch} />
      ) : (
        selectedQuiz && (
          <>
            <section className={styles.panel}>
              <div className={styles.toolbar}>
                <QuizPicker
                  quizzes={quizzes}
                  selected={selectedQuiz.id}
                  onChange={(quizId) => {
                    setSelectedId(quizId);
                    resetForm();
                    setActionError('');
                    setMessage('');
                  }}
                />
                <button
                  className={styles.secondary}
                  disabled={
                    updatingQuiz.isLoading ||
                    (!selectedQuiz.is_active &&
                      (!questions.length || fetchingQuestions || !!questionsError))
                  }
                  onClick={handleToggle}
                >
                  {selectedQuiz.is_active ? 'Скрыть из каталога' : 'Опубликовать'}
                </button>
                <Link className={styles.textButton} to={`/quiz/${selectedQuiz.slug}/results`}>
                  Результаты
                </Link>
              </div>
              <p className={styles.muted}>
                Статус: {selectedQuiz.is_active ? 'опубликован' : 'черновик'} · /quiz/
                {selectedQuiz.slug}
              </p>
              <h2>{editingId ? 'Редактировать вопрос' : 'Добавить вопрос'}</h2>
              <form onSubmit={handleSaveQuestion} className={styles.stack}>
                <label className={styles.field}>
                  Текст вопроса
                  <textarea
                    rows={4}
                    required
                    maxLength={4000}
                    value={questionText}
                    onChange={(event) => setQuestionText(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  Правильный ответ
                  <textarea
                    rows={2}
                    required
                    maxLength={1000}
                    value={correctAnswer}
                    onChange={(event) => setCorrectAnswer(event.target.value)}
                  />
                  <small>
                    Ответ виден только организатору. Синонимы и спорные формулировки учитываются при
                    ручной проверке.
                  </small>
                </label>
                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    disabled={busy || fetchingQuestions || !!questionsError}
                  >
                    {busy ? 'Сохраняем…' : editingId ? 'Сохранить изменения' : 'Добавить вопрос'}
                  </button>
                  {editingId && (
                    <button type="button" className={styles.secondary} onClick={resetForm}>
                      Отменить
                    </button>
                  )}
                </div>
              </form>
            </section>
            <section className={styles.panel}>
              <h2>Вопросы · {questions.length}</h2>
              {loadingQuestions || fetchingQuestions ? (
                <Feedback message="Загружаем вопросы…" />
              ) : questionsError ? (
                <Feedback error message={errorMessage(questionsError)} retry={refetchQuestions} />
              ) : !questions.length ? (
                <Feedback message="Добавьте первый вопрос, чтобы подготовить квиз к публикации." />
              ) : (
                <ol className={styles.questionList}>
                  {questions.map((question, index) => (
                    <li key={question.id}>
                      <span className={styles.stepNumber}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3>{question.question_text}</h3>
                        <p className={styles.muted}>Ответ: {question.correct_answer}</p>
                        <div className={styles.actions}>
                          <button
                            className={styles.textButton}
                            disabled={busy}
                            onClick={() => {
                              setEditingId(question.id);
                              setQuestionText(question.question_text);
                              setCorrectAnswer(question.correct_answer);
                            }}
                          >
                            Изменить
                          </button>
                          <button
                            className={styles.dangerText}
                            disabled={busy}
                            onClick={() => {
                              void handleDelete(question.id);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}

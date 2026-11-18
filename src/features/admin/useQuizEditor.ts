import type { FormEvent } from 'react';
import type { Quiz, Question } from '@/types';
import { useState } from 'react';
import {
  useGetQuizzesQuery,
  useCreateQuizMutation,
  useUpdateQuizMutation,
  useGetQuestionsQuery,
  useCreateQuestionMutation,
  useUpdateQuestionMutation,
  useDeleteQuestionMutation,
} from '@/app/api';
import { errorMessage } from '@/components/Feedback';

interface QuizEditorState {
  quizzes: Quiz[];
  selectedQuiz: Quiz | undefined;
  isLoading: boolean;
  error: ReturnType<typeof useGetQuizzesQuery>['error'];
  refetch: ReturnType<typeof useGetQuizzesQuery>['refetch'];
  name: string;
  setName: (name: string) => void;
  slug: string;
  setSlug: (slug: string) => void;
  questionText: string;
  setQuestionText: (text: string) => void;
  correctAnswer: string;
  setCorrectAnswer: (answer: string) => void;
  editingId: string | null;
  setEditingId: (questionId: string | null) => void;
  message: string;
  setMessage: (message: string) => void;
  actionError: string;
  setActionError: (message: string) => void;
  creatingQuiz: { isLoading: boolean };
  updatingQuiz: { isLoading: boolean };
  questions: Question[];
  loadingQuestions: boolean;
  fetchingQuestions: boolean;
  questionsError: ReturnType<typeof useGetQuestionsQuery>['error'];
  refetchQuestions: ReturnType<typeof useGetQuestionsQuery>['refetch'];
  busy: boolean;
  resetForm: () => void;
  handleCreateQuiz: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleSaveQuestion: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleDelete: (questionId: string) => Promise<void>;
  handleToggle: () => Promise<void>;
  setSelectedId: (quizId: string) => void;
}

export function useQuizEditor(): QuizEditorState {
  const { data: quizzes = [], isLoading, error, refetch } = useGetQuizzesQuery();
  const [selectedId, setSelectedId] = useState('');
  const selectedQuiz = quizzes.find((quiz) => quiz.id === selectedId) || quizzes[0];
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [createQuiz, creatingQuiz] = useCreateQuizMutation();
  const [updateQuiz, updatingQuiz] = useUpdateQuizMutation();
  const [createQuestion, creatingQuestion] = useCreateQuestionMutation();
  const [updateQuestion, updatingQuestion] = useUpdateQuestionMutation();
  const [deleteQuestion, deletingQuestion] = useDeleteQuestionMutation();
  const {
    data: questions = [],
    isLoading: loadingQuestions,
    isFetching: fetchingQuestions,
    error: questionsError,
    refetch: refetchQuestions,
  } = useGetQuestionsQuery(selectedQuiz?.id || '', { skip: !selectedQuiz });
  const busy =
    creatingQuestion.isLoading || updatingQuestion.isLoading || deletingQuestion.isLoading;
  function resetForm() {
    setQuestionText('');
    setCorrectAnswer('');
    setEditingId(null);
  }
  async function handleCreateQuiz(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError('');
    setMessage('');
    try {
      const quiz = await createQuiz({ name: name.trim(), slug: slug.trim() }).unwrap();
      setSelectedId(quiz.id);
      setName('');
      setSlug('');
      resetForm();
      setMessage('Черновик создан. Добавьте вопросы и опубликуйте квиз.');
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    }
  }
  async function handleSaveQuestion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedQuiz) return;
    setActionError('');
    setMessage('');
    try {
      const fields = { question_text: questionText.trim(), correct_answer: correctAnswer.trim() };
      if (editingId) await updateQuestion({ id: editingId, ...fields }).unwrap();
      else await createQuestion({ quiz_id: selectedQuiz.id, ...fields }).unwrap();
      resetForm();
      setMessage('Вопрос сохранён.');
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    }
  }
  async function handleDelete(questionId: string): Promise<void> {
    if (!window.confirm('Удалить вопрос без возможности восстановления?')) return;
    setActionError('');
    setMessage('');
    try {
      await deleteQuestion(questionId).unwrap();
      if (editingId === questionId) resetForm();
      setMessage('Вопрос удалён.');
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    }
  }
  async function handleToggle(): Promise<void> {
    if (!selectedQuiz) return;
    setActionError('');
    setMessage('');
    try {
      await updateQuiz({ id: selectedQuiz.id, is_active: !selectedQuiz.is_active }).unwrap();
      setMessage(selectedQuiz.is_active ? 'Квиз скрыт из каталога.' : 'Квиз опубликован.');
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    }
  }
  return {
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
  };
}

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  Quiz,
  Question,
  ParticipantWithAnswers,
  QuizResults,
  QuizProgress,
  PlayState,
} from '@/types';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/quiz',
    prepareHeaders: (headers) => {
      const initData = window.Telegram?.WebApp.initData;
      if (initData) headers.set('X-Telegram-Init-Data', initData);
      return headers;
    },
  }),
  tagTypes: ['Quiz', 'Question', 'Answer', 'Session', 'Progress'],
  endpoints: (builder) => ({
    getSession: builder.query<{ admin: boolean }, void>({
      query: () => '?action=session',
      providesTags: ['Session'],
    }),
    login: builder.mutation<{ admin: boolean }, string>({
      query: (password) => ({ url: '?action=login', method: 'POST', body: { password } }),
      invalidatesTags: ['Session'],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: '?action=logout', method: 'POST' }),
      invalidatesTags: ['Session'],
      async onQueryStarted(_argument, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(api.util.resetApiState());
        } catch {
          /* Keep the session when logout fails. */
        }
      },
    }),
    getQuizzes: builder.query<Quiz[], void>({
      query: () => '?action=quizzes',
      providesTags: ['Quiz', 'Session'],
    }),
    getMyProgress: builder.query<QuizProgress[], void>({
      query: () => '?action=my-progress',
      providesTags: ['Progress'],
    }),
    createQuiz: builder.mutation<Quiz, { name: string; slug: string }>({
      query: (body) => ({ url: '?action=quiz', method: 'POST', body }),
      invalidatesTags: ['Quiz'],
    }),
    updateQuiz: builder.mutation<void, { id: string; is_active: boolean }>({
      query: (body) => ({ url: '?action=quiz', method: 'PATCH', body }),
      invalidatesTags: ['Quiz'],
    }),
    getQuestions: builder.query<Question[], string>({
      query: (quizId) => `?action=questions&quizId=${encodeURIComponent(quizId)}`,
      providesTags: ['Question'],
    }),
    createQuestion: builder.mutation<
      void,
      { quiz_id: string; question_text: string; correct_answer: string }
    >({
      query: (body) => ({ url: '?action=question', method: 'POST', body }),
      invalidatesTags: ['Question', 'Quiz'],
    }),
    updateQuestion: builder.mutation<
      void,
      { id: string; question_text: string; correct_answer: string }
    >({
      query: (body) => ({ url: '?action=question', method: 'PATCH', body }),
      invalidatesTags: ['Question'],
    }),
    deleteQuestion: builder.mutation<void, string>({
      query: (id) => ({ url: '?action=question', method: 'DELETE', body: { id } }),
      invalidatesTags: ['Question', 'Quiz'],
    }),
    getParticipantsWithAnswers: builder.query<ParticipantWithAnswers[], string>({
      query: (quizId) => `?action=review&quizId=${encodeURIComponent(quizId)}`,
      providesTags: ['Answer'],
    }),
    checkAnswer: builder.mutation<void, { id: string; is_correct: boolean | null }>({
      query: (body) => ({ url: '?action=review', method: 'PATCH', body }),
      invalidatesTags: ['Answer', 'Progress'],
    }),
    getResults: builder.query<QuizResults, string>({
      query: (quizId) => `?action=results&quizId=${encodeURIComponent(quizId)}`,
      providesTags: ['Answer'],
    }),
    play: builder.mutation<
      PlayState,
      { quiz_id: string; name?: string; question_id?: string; answer_text?: string }
    >({
      query: (body) => ({ url: '?action=play', method: 'POST', body }),
      invalidatesTags: ['Answer', 'Progress'],
    }),
  }),
});

export const {
  useGetSessionQuery,
  useLoginMutation,
  useLogoutMutation,
  useGetQuizzesQuery,
  useGetMyProgressQuery,
  useCreateQuizMutation,
  useUpdateQuizMutation,
  useGetQuestionsQuery,
  useCreateQuestionMutation,
  useUpdateQuestionMutation,
  useDeleteQuestionMutation,
  useGetParticipantsWithAnswersQuery,
  useCheckAnswerMutation,
  useGetResultsQuery,
  usePlayMutation,
} = api;

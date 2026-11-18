export interface Quiz {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  question_count: number;
}

export interface Question {
  id: string;
  quiz_id: string;
  question_text: string;
  correct_answer: string;
  order_number: number;
}

export interface ReviewedAnswer {
  id: string;
  answer_text: string;
  is_correct: boolean | null;
  question: Question;
}

export interface ParticipantWithAnswers {
  id: string;
  telegram_first_name: string | null;
  participant_number: string | null;
  answers: ReviewedAnswer[];
}

export interface ParticipantResult {
  id: string;
  name: string;
  correct_count: number;
  answered_count: number;
  pending_count: number;
  total_count: number;
}

export interface QuizResults {
  ranked: ParticipantResult[];
  pending: { id: string; name: string; checked_count: number; total_count: number }[];
  playing: { id: string; name: string; answered_count: number; total_count: number }[];
}

export interface QuizProgress {
  quiz_id: string;
  resume_question_id?: string | null;
  correct_count: number | null;
  answered_count: number;
  pending_count: number;
  total_count: number;
  completed: boolean;
}

export interface PlayState {
  question: { id: string; question_text: string; order_number: number } | null;
  deadline: string | null;
  total: number;
  answered: number;
  completed: boolean;
  server_time: string;
}

export interface TelegramWebApp {
  initData: string;
  onEvent?: (event: 'deactivated', callback: () => void) => void;
  offEvent?: (event: 'deactivated', callback: () => void) => void;
  ready: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

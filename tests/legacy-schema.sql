-- Fixture for a disposable database only. Models the original project's schema.
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL, correct_answer TEXT NOT NULL, order_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (quiz_id, order_number)
);
CREATE TABLE public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL, telegram_username TEXT, telegram_first_name TEXT,
  participant_number TEXT, current_question_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (quiz_id, telegram_id)
);
CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE, answer_text TEXT NOT NULL,
  is_correct BOOLEAN, answered_at TIMESTAMPTZ DEFAULT now(), UNIQUE (participant_id, question_id)
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on quizzes" ON public.quizzes FOR ALL USING (true);
CREATE POLICY "Allow all operations on questions" ON public.questions FOR ALL USING (true);
CREATE POLICY "Allow all operations on participants" ON public.participants FOR ALL USING (true);
CREATE POLICY "Allow all operations on answers" ON public.answers FOR ALL USING (true);
GRANT ALL ON public.quizzes, public.questions, public.participants, public.answers TO anon, authenticated;
INSERT INTO public.quizzes(id, name, slug) VALUES ('10000000-0000-4000-8000-000000000001', 'Новогодний квиз', 'main');
INSERT INTO public.questions(id, quiz_id, question_text, correct_answer, order_number)
VALUES ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Legacy question', 'Legacy answer', 1);
INSERT INTO public.participants(id, quiz_id, telegram_id, participant_number)
VALUES ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 9999, 'Legacy player');
INSERT INTO public.answers(participant_id, question_id, answer_text, is_correct)
VALUES ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Legacy answer', true);

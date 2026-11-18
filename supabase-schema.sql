-- Review before applying. This script changes access policies and renames main.
-- Run the entire script in a transaction, first against a disposable database.
BEGIN;

CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  order_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, order_number)
);
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  participant_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, telegram_id)
);
CREATE TABLE IF NOT EXISTS public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, question_id)
);
CREATE TABLE IF NOT EXISTS public.shown_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, question_id)
);

-- Abort instead of merging two existing quizzes with different identities.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.quizzes WHERE slug = 'main')
     AND EXISTS (SELECT 1 FROM public.quizzes WHERE slug = 'new-year') THEN
    RAISE EXCEPTION 'Both main and new-year exist. Resolve the slug conflict before migration.';
  END IF;
END $$;
UPDATE public.quizzes SET slug = 'new-year' WHERE slug = 'main';
ALTER TABLE public.quizzes ALTER COLUMN is_active SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON public.questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_participants_quiz_id ON public.participants(quiz_id);
CREATE INDEX IF NOT EXISTS idx_answers_participant_id ON public.answers(participant_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON public.answers(question_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shown_participant_question ON public.shown_questions(participant_id, question_id);

CREATE TABLE IF NOT EXISTS public.request_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_limits_expires ON public.request_limits(expires_at);

-- All database access is server-only. No anonymous or authenticated client grants.
DO $$
DECLARE
  table_name TEXT;
  policy_record RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['quizzes', 'questions', 'participants', 'answers', 'shown_questions', 'request_limits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_record IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_quiz_questions() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE target_quiz UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target_quiz := OLD.quiz_id; ELSE target_quiz := NEW.quiz_id; END IF;
  PERFORM id FROM public.quizzes WHERE id = target_quiz FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.participants WHERE quiz_id = target_quiz) THEN
    RAISE EXCEPTION 'Questions are locked once a participant has joined';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.quiz_id IS DISTINCT FROM OLD.quiz_id THEN
    RAISE EXCEPTION 'Moving questions between quizzes is not supported';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS guard_quiz_questions ON public.questions;
CREATE TRIGGER guard_quiz_questions BEFORE INSERT OR UPDATE OR DELETE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.guard_quiz_questions();

CREATE OR REPLACE FUNCTION public.lock_quiz_on_join() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM id FROM public.quizzes WHERE id = NEW.quiz_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz is not active'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lock_quiz_on_join ON public.participants;
CREATE TRIGGER lock_quiz_on_join BEFORE INSERT ON public.participants
FOR EACH ROW EXECUTE FUNCTION public.lock_quiz_on_join();

CREATE OR REPLACE FUNCTION public.guard_quiz_publication() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_active AND NOT EXISTS (SELECT 1 FROM public.questions WHERE quiz_id = NEW.id) THEN
    RAISE EXCEPTION 'Add questions before publishing';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_quiz_publication ON public.quizzes;
CREATE TRIGGER guard_quiz_publication BEFORE UPDATE OF is_active ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.guard_quiz_publication();

-- Atomic progression: row lock, immutable answers, server-owned 60 second deadline.
-- Only the current question is returned; the correct answer never leaves this function.
CREATE OR REPLACE FUNCTION public.quiz_turn(
  p_participant_id UUID,
  p_question_id UUID DEFAULT NULL,
  p_answer_text TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  player public.participants%ROWTYPE;
  current_question public.questions%ROWTYPE;
  shown_time TIMESTAMPTZ;
  current_time_value TIMESTAMPTZ;
  total_count INTEGER;
  answered_count INTEGER;
BEGIN
  SELECT * INTO STRICT player FROM public.participants WHERE id = p_participant_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.quizzes WHERE id = player.quiz_id AND is_active = true) THEN
    RAISE EXCEPTION 'Quiz is not active';
  END IF;
  IF p_answer_text IS NOT NULL AND length(p_answer_text) > 4000 THEN
    RAISE EXCEPTION 'Answer exceeds the length limit';
  END IF;
  current_time_value := clock_timestamp();
  SELECT count(*) INTO total_count FROM public.questions WHERE quiz_id = player.quiz_id;
  LOOP
    SELECT question.* INTO current_question FROM public.questions question
    WHERE question.quiz_id = player.quiz_id AND NOT EXISTS (
      SELECT 1 FROM public.answers answer WHERE answer.participant_id = player.id AND answer.question_id = question.id
    ) ORDER BY question.order_number LIMIT 1;
    EXIT WHEN NOT FOUND;

    INSERT INTO public.shown_questions (participant_id, question_id, shown_at)
      VALUES (player.id, current_question.id, current_time_value)
      ON CONFLICT (participant_id, question_id) DO NOTHING;
    SELECT shown_at INTO shown_time FROM public.shown_questions
      WHERE participant_id = player.id AND question_id = current_question.id;

    IF current_question.id = p_question_id OR shown_time + interval '60 seconds' <= current_time_value THEN
      INSERT INTO public.answers (participant_id, question_id, answer_text, is_correct, answered_at)
      VALUES (player.id, current_question.id,
        CASE WHEN shown_time + interval '60 seconds' > current_time_value THEN coalesce(trim(p_answer_text), '') ELSE '' END,
        NULL, current_time_value)
      ON CONFLICT (participant_id, question_id) DO NOTHING;
      p_question_id := NULL;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  SELECT count(*) INTO answered_count FROM public.answers answer
    JOIN public.questions question ON question.id = answer.question_id
    WHERE answer.participant_id = player.id AND question.quiz_id = player.quiz_id;
  IF current_question.id IS NULL THEN
    RETURN jsonb_build_object('question', NULL, 'deadline', NULL, 'total', total_count,
      'answered', answered_count, 'completed', true, 'server_time', current_time_value);
  END IF;
  RETURN jsonb_build_object('question', jsonb_build_object('id', current_question.id,
    'question_text', current_question.question_text, 'order_number', current_question.order_number),
    'deadline', shown_time + interval '60 seconds', 'total', total_count,
    'answered', answered_count, 'completed', false, 'server_time', current_time_value);
END $$;

REVOKE ALL ON FUNCTION public.quiz_turn(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quiz_turn(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.guard_quiz_questions(), public.lock_quiz_on_join(), public.guard_quiz_publication() FROM PUBLIC, anon, authenticated;
-- Shared across serverless instances; keys contain HMAC digests, never raw IPs.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key TEXT, p_limit INTEGER, p_window INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE attempt_count INTEGER;
BEGIN
  IF p_limit < 1 OR p_window < 1 OR p_window > 86400 OR length(p_key) > 100 THEN
    RAISE EXCEPTION 'Invalid rate limit';
  END IF;
  DELETE FROM public.request_limits WHERE expires_at < clock_timestamp() - interval '1 day';
  INSERT INTO public.request_limits AS limits (key, attempts, expires_at)
    VALUES (p_key, 1, clock_timestamp() + make_interval(secs => p_window))
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN limits.expires_at <= clock_timestamp() THEN 1 ELSE limits.attempts + 1 END,
      expires_at = CASE WHEN limits.expires_at <= clock_timestamp()
        THEN clock_timestamp() + make_interval(secs => p_window) ELSE limits.expires_at END
    RETURNING attempts INTO attempt_count;
  RETURN attempt_count <= p_limit;
END $$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
COMMIT;

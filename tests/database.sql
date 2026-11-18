-- Run only on a disposable PostgreSQL database, after supabase-schema.sql.
BEGIN;
DO $$
DECLARE
  quiz_id_value UUID;
  player_id UUID;
  first_question UUID;
  second_question UUID;
  state JSONB;
  repeated_state JSONB;
  original_deadline TEXT;
  edit_blocked BOOLEAN := false;
  saved_text TEXT;
BEGIN
  INSERT INTO public.quizzes(name, slug, is_active) VALUES ('Test quiz', 'sql-test', false) RETURNING id INTO quiz_id_value;
  INSERT INTO public.questions(quiz_id, question_text, correct_answer, order_number)
    VALUES (quiz_id_value, 'First question', 'Secret answer', 1) RETURNING id INTO first_question;
  INSERT INTO public.questions(quiz_id, question_text, correct_answer, order_number)
    VALUES (quiz_id_value, 'Second question', 'Another secret', 3) RETURNING id INTO second_question;
  UPDATE public.quizzes SET is_active = true WHERE id = quiz_id_value;
  INSERT INTO public.participants(quiz_id, telegram_id, participant_number)
    VALUES (quiz_id_value, 12345, 'Test player') RETURNING id INTO player_id;

  state := public.quiz_turn(player_id);
  ASSERT state->'question'->>'id' = first_question::TEXT, 'Starts on the first question';
  ASSERT NOT (state->'question' ? 'correct_answer'), 'Does not expose the correct answer';
  ASSERT (state->>'answered')::INTEGER = 0, 'No answers before submission';
  original_deadline := state->>'deadline';
  repeated_state := public.quiz_turn(player_id);
  ASSERT repeated_state->>'deadline' = original_deadline, 'Reload preserves the deadline';

  BEGIN
    INSERT INTO public.questions(quiz_id, question_text, correct_answer, order_number)
      VALUES (quiz_id_value, 'Late question', 'Answer', 4);
  EXCEPTION WHEN raise_exception THEN edit_blocked := true;
  END;
  ASSERT edit_blocked, 'Question set is frozen after a participant joins';

  state := public.quiz_turn(player_id, first_question, 'First answer');
  ASSERT state->'question'->>'id' = second_question::TEXT, 'Progresses across gaps in question order';
  ASSERT (state->>'answered')::INTEGER = 1, 'First answer saved';
  repeated_state := public.quiz_turn(player_id, first_question, 'Changed answer');
  SELECT answer_text INTO saved_text FROM public.answers WHERE participant_id = player_id AND question_id = first_question;
  ASSERT saved_text = 'First answer', 'Duplicate submissions do not overwrite answers';
  ASSERT repeated_state->>'deadline' = state->>'deadline', 'Duplicate submission does not reset the next timer';

  UPDATE public.shown_questions SET shown_at = clock_timestamp() - interval '61 seconds'
    WHERE participant_id = player_id AND question_id = second_question;
  state := public.quiz_turn(player_id, second_question, 'Too late');
  ASSERT (state->>'completed')::BOOLEAN, 'Completes after last question';
  ASSERT state->'question' = 'null'::JSONB, 'Completion has no question';
  ASSERT (state->>'answered')::INTEGER = 2, 'Counts timed-out answers';
  SELECT answer_text INTO saved_text FROM public.answers WHERE participant_id = player_id AND question_id = second_question;
  ASSERT saved_text = '', 'Late answers are replaced with a timeout';
  repeated_state := public.quiz_turn(player_id);
  ASSERT (repeated_state->>'completed')::BOOLEAN, 'Completed attempts cannot restart';

  ASSERT public.consume_rate_limit('sql-test', 2, 60), 'Rate limit first request';
  ASSERT public.consume_rate_limit('sql-test', 2, 60), 'Rate limit second request';
  ASSERT NOT public.consume_rate_limit('sql-test', 2, 60), 'Rate limit rejects excess attempts';
  UPDATE public.request_limits SET expires_at = clock_timestamp() - interval '1 second' WHERE key = 'sql-test';
  ASSERT public.consume_rate_limit('sql-test', 2, 60), 'Expired rate limit resets';

  ASSERT NOT has_table_privilege('anon', 'public.questions', 'SELECT'), 'Anonymous users cannot read correct answers';
  ASSERT NOT has_table_privilege('authenticated', 'public.answers', 'UPDATE'), 'Authenticated clients cannot change scores';
  ASSERT NOT has_function_privilege('anon', 'public.quiz_turn(uuid,uuid,text)', 'EXECUTE'), 'Anonymous clients cannot invoke progression';
  ASSERT has_function_privilege('service_role', 'public.quiz_turn(uuid,uuid,text)', 'EXECUTE'), 'Server can invoke progression';
END $$;
ROLLBACK;

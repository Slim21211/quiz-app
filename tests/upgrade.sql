DO $$
BEGIN
  ASSERT (SELECT slug = 'new-year' FROM public.quizzes WHERE id = '10000000-0000-4000-8000-000000000001'), 'Renames the existing quiz without changing its ID';
  ASSERT (SELECT correct_answer = 'Legacy answer' FROM public.questions WHERE id = '10000000-0000-4000-8000-000000000002'), 'Preserves existing questions';
  ASSERT (SELECT participant_number = 'Legacy player' FROM public.participants WHERE id = '10000000-0000-4000-8000-000000000003'), 'Preserves existing participants';
  ASSERT (SELECT is_correct = true FROM public.answers WHERE participant_id = '10000000-0000-4000-8000-000000000003'), 'Preserves existing verdicts';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('quizzes', 'questions', 'participants', 'answers', 'shown_questions', 'request_limits')), 'Removes public policies';
END $$;

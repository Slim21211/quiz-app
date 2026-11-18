import { createHmac } from 'node:crypto';
import { groupResults, summarizeAnswers } from '../server/results.js';
import { createClient } from '@supabase/supabase-js';
import {
  HttpError,
  sessionSecret,
  equalSecrets,
  signSession,
  setCookie,
  isAdmin,
  adminVersion,
  getPlayer,
  findPlayer,
  requireSameOrigin,
  textField,
  uuidField,
} from '../server/security.js';

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'База данных сервера не настроена.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function checked(result) {
  if (result.error) {
    if (result.error.code === '23505')
      throw new HttpError(409, 'Такая ссылка или номер вопроса уже занят. Обновите страницу.');
    if (result.error.code === 'P0001') {
      const message =
        result.error.message === 'Add questions before publishing'
          ? 'Добавьте хотя бы один вопрос перед публикацией.'
          : result.error.message === 'Quiz is not active'
            ? 'Квиз скрыт организатором.'
            : 'В квизе уже есть участники. Для новых вопросов создайте отдельный квиз.';
      throw new HttpError(409, message);
    }
    throw new HttpError(
      503,
      'Не удалось выполнить запрос к базе. Проверьте настройку и SQL-обновление.',
    );
  }
  return result.data;
}

async function readRows(query) {
  const rows = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const page = checked(await query.range(offset, offset + pageSize - 1)) || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
    offset += pageSize;
  }
}

function requireAdmin(request) {
  if (!isAdmin(request)) throw new HttpError(401, 'Войдите как администратор.');
}

async function rateLimit(request, response, category, limit, windowSeconds) {
  // Vercel overwrites x-forwarded-for at its edge. Local requests use the socket.
  const address =
    process.env.VERCEL === '1'
      ? String(request.headers['x-forwarded-for'] || '')
          .split(',')[0]
          .trim()
      : request.socket?.remoteAddress || 'local';
  const fingerprint = createHmac('sha256', sessionSecret())
    .update(`${category}:${address}`)
    .digest('hex');
  const allowed = checked(
    await database().rpc('consume_rate_limit', {
      p_key: fingerprint,
      p_limit: limit,
      p_window: windowSeconds,
    }),
  );
  if (!allowed) {
    response.setHeader('Retry-After', String(windowSeconds));
    throw new HttpError(429, 'Слишком много запросов. Повторите попытку позже.');
  }
}

const methods = {
  session: ['GET'],
  login: ['POST'],
  logout: ['POST'],
  quizzes: ['GET'],
  'my-progress': ['GET'],
  quiz: ['POST', 'PATCH'],
  questions: ['GET'],
  question: ['POST', 'PATCH', 'DELETE'],
  review: ['GET', 'PATCH'],
  results: ['GET'],
  play: ['POST'],
};

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const action = request.query.action;
    if (typeof action !== 'string' || !Object.hasOwn(methods, action))
      throw new HttpError(404, 'Маршрут не найден.');
    if (!methods[action].includes(request.method)) {
      response.setHeader('Allow', methods[action].join(', '));
      throw new HttpError(405, 'Метод не поддерживается.');
    }
    if (request.method !== 'GET') requireSameOrigin(request);
    const body = request.body || {};
    if (typeof body !== 'object' || Array.isArray(body))
      throw new HttpError(400, 'Некорректный запрос.');
    if (Buffer.byteLength(JSON.stringify(body)) > 20000)
      throw new HttpError(413, 'Слишком большой запрос.');
    if (action === 'session') return response.json({ admin: isAdmin(request) });
    if (action === 'login') {
      if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16)
        throw new HttpError(503, 'Пароль администратора не настроен (минимум 16 символов).');
      await rateLimit(request, response, 'login', 10, 900);
      const password = textField(body.password, 'Пароль', 256);
      if (!equalSecrets(password, process.env.ADMIN_PASSWORD))
        throw new HttpError(401, 'Неверный пароль.');
      setCookie(
        response,
        'quiz_admin',
        signSession({ role: 'admin', version: adminVersion(), expires: Date.now() + 8 * 3600000 }),
        8 * 3600,
      );
      return response.json({ admin: true });
    }
    if (action === 'logout') {
      setCookie(response, 'quiz_admin', '', 0);
      return response.json({ success: true });
    }
    if (['quiz', 'questions', 'question', 'review'].includes(action)) requireAdmin(request);
    const supabase = database();
    if (action === 'quizzes') {
      let query = supabase
        .from('quizzes')
        .select('*, questions(count)')
        .order('created_at', { ascending: false })
        .order('id');
      if (!isAdmin(request)) query = query.eq('is_active', true);
      const quizzes = await readRows(query);
      return response.json(
        quizzes.map(({ questions, ...quiz }) => ({
          ...quiz,
          question_count: questions[0]?.count || 0,
        })),
      );
    }
    if (action === 'quiz') {
      if (request.method === 'PATCH') {
        if (typeof body.is_active !== 'boolean')
          throw new HttpError(400, 'Некорректный статус квиза.');
        checked(
          await supabase
            .from('quizzes')
            .update({ is_active: body.is_active })
            .eq('id', uuidField(body.id)),
        );
        return response.json({ success: true });
      }
      const name = textField(body.name, 'Название', 120);
      const slug = textField(body.slug, 'Ссылка', 80);
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        ['main', 'new', 'admin', 'results'].includes(slug)
      )
        throw new HttpError(
          400,
          'Используйте латинские буквы, цифры и дефис. Ссылка зарезервирована или некорректна.',
        );
      const quiz = checked(
        await supabase.from('quizzes').insert({ name, slug, is_active: false }).select().single(),
      );
      return response.status(201).json({ ...quiz, question_count: 0 });
    }
    if (action === 'questions') {
      return response.json(
        await readRows(
          supabase
            .from('questions')
            .select('*')
            .eq('quiz_id', uuidField(request.query.quizId))
            .order('order_number'),
        ),
      );
    }
    if (action === 'question') {
      if (request.method === 'DELETE') {
        checked(await supabase.from('questions').delete().eq('id', uuidField(body.id)));
      } else {
        const fields = {
          question_text: textField(body.question_text, 'Вопрос', 4000),
          correct_answer: textField(body.correct_answer, 'Правильный ответ', 1000),
        };
        if (request.method === 'PATCH') {
          checked(await supabase.from('questions').update(fields).eq('id', uuidField(body.id)));
        } else {
          const quizId = uuidField(body.quiz_id);
          const latest = checked(
            await supabase
              .from('questions')
              .select('order_number')
              .eq('quiz_id', quizId)
              .order('order_number', { ascending: false })
              .limit(1),
          );
          checked(
            await supabase.from('questions').insert({
              ...fields,
              quiz_id: quizId,
              order_number: (latest[0]?.order_number || 0) + 1,
            }),
          );
        }
      }
      return response.json({ success: true });
    }
    if (action === 'review') {
      if (request.method === 'PATCH') {
        if (body.is_correct !== null && typeof body.is_correct !== 'boolean')
          throw new HttpError(400, 'Некорректная оценка.');
        checked(
          await supabase
            .from('answers')
            .update({ is_correct: body.is_correct })
            .eq('id', uuidField(body.id)),
        );
        return response.json({ success: true });
      }
      const participants = await readRows(
        supabase
          .from('participants')
          .select(
            'id, telegram_first_name, participant_number, answers(id, answer_text, is_correct, question:questions(id, quiz_id, question_text, correct_answer, order_number))',
          )
          .eq('quiz_id', uuidField(request.query.quizId))
          .order('created_at')
          .order('id'),
      );
      participants.forEach((participant) =>
        participant.answers.sort(
          (left, right) => left.question.order_number - right.question.order_number,
        ),
      );
      return response.json(participants);
    }
    if (action === 'results') {
      const quizId = uuidField(request.query.quizId);
      const quizQuery = supabase.from('quizzes').select('id, is_active').eq('id', quizId);
      const quiz = checked(await quizQuery.maybeSingle());
      if (!quiz) throw new HttpError(404, 'Квиз не найден.');
      if (!quiz.is_active && !isAdmin(request)) throw new HttpError(404, 'Квиз недоступен.');
      const participants = await readRows(
        supabase
          .from('participants')
          .select('id, participant_number, answers(is_correct)')
          .eq('quiz_id', quizId)
          .order('created_at')
          .order('id'),
      );
      const countResult = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quizId);
      checked(countResult);
      return response.json(groupResults(participants, countResult.count || 0));
    }
    if (action === 'my-progress') {
      const player = findPlayer(request);
      if (!player) return response.json([]);
      const participants = await readRows(
        supabase
          .from('participants')
          .select('quiz_id, answers(is_correct), quiz:quizzes!inner(is_active, questions(count))')
          .eq('telegram_id', player.id)
          .eq('quiz.is_active', true)
          .order('id'),
      );
      return response.json(
        participants.map((participant) => {
          const summary = summarizeAnswers(
            participant.answers,
            participant.quiz.questions[0]?.count || 0,
          );
          return {
            quiz_id: participant.quiz_id,
            ...summary,
            correct_count:
              summary.completed && summary.pending_count === 0 ? summary.correct_count : null,
          };
        }),
      );
    }
    if (action === 'play') {
      const player = getPlayer(request, response);
      await rateLimit(request, response, 'play', 300, 60);
      const quizId = uuidField(body.quiz_id);
      const quiz = checked(
        await supabase
          .from('quizzes')
          .select('id')
          .eq('id', quizId)
          .eq('is_active', true)
          .maybeSingle(),
      );
      if (!quiz) throw new HttpError(404, 'Квиз недоступен.');
      let participant = checked(
        await supabase
          .from('participants')
          .select('id')
          .eq('quiz_id', quizId)
          .eq('telegram_id', player.id)
          .maybeSingle(),
      );
      if (!participant) {
        const name = textField(body.name, 'Имя участника', 80);
        checked(
          await supabase.from('participants').upsert(
            {
              quiz_id: quizId,
              telegram_id: player.id,
              telegram_first_name: player.first_name,
              telegram_username: player.username,
              participant_number: name,
            },
            { onConflict: 'quiz_id,telegram_id', ignoreDuplicates: true },
          ),
        );
        participant = checked(
          await supabase
            .from('participants')
            .select('id')
            .eq('quiz_id', quizId)
            .eq('telegram_id', player.id)
            .single(),
        );
      }
      const questionId = body.question_id === undefined ? null : uuidField(body.question_id);
      if (questionId && (typeof body.answer_text !== 'string' || body.answer_text.length > 4000))
        throw new HttpError(400, 'Ответ должен быть не длиннее 4000 символов.');
      const state = checked(
        await supabase.rpc('quiz_turn', {
          p_participant_id: participant.id,
          p_question_id: questionId,
          p_answer_text: questionId ? body.answer_text.trim() : null,
        }),
      );
      return response.json(state);
    }
    throw new HttpError(404, 'Маршрут не найден.');
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    // Never log request bodies, Telegram initData, database errors or credentials.
    if (status === 500) console.error('Quiz request failed');
    return response.status(status).json({
      message:
        error instanceof HttpError ? error.message : 'Ошибка сервера. Повторите запрос позже.',
    });
  }
}

import type { Page } from '@playwright/test';
import type { Quiz, Question, ParticipantWithAnswers, QuizProgress } from '../src/types';
import { test, expect } from '@playwright/test';

const quizId = '00000000-0000-4000-8000-000000000001';
const questionId = '00000000-0000-4000-8000-000000000002';
const participantId = '00000000-0000-4000-8000-000000000003';

async function mockApi(
  page: Page,
  initiallyAdmin = false,
  initialProgress: QuizProgress[] = [],
): Promise<void> {
  let progress = initialProgress;
  let admin = initiallyAdmin;
  const quizzes: Quiz[] = [
    {
      id: quizId,
      name: 'Кино без границ',
      slug: 'cinema',
      is_active: true,
      question_count: 1,
      created_at: '2026-01-01',
    },
  ];
  const questions: Question[] = [
    {
      id: questionId,
      quiz_id: quizId,
      question_text: 'Кто снял фильм «Сталкер»?',
      correct_answer: 'Андрей Тарковский',
      order_number: 1,
    },
  ];
  const participants: ParticipantWithAnswers[] = [
    {
      id: participantId,
      participant_number: 'Команда Альфа',
      telegram_first_name: null,
      answers: [
        {
          id: 'answer-one',
          answer_text: 'Тарковский Андрей',
          is_correct: null,
          question: questions[0],
        },
      ],
    },
  ];
  await page.route('https://telegram.org/**', (route) => route.abort());
  await page.route('**/api/quiz?**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const action = requestUrl.searchParams.get('action');
    const method = request.method();
    const payload: unknown = request.postDataJSON();
    let response: unknown;
    if (action === 'my-progress') response = progress;
    else if (action === 'session') response = { admin };
    else if (action === 'login') {
      admin = true;
      response = { admin: true };
    } else if (action === 'logout') {
      admin = false;
      response = { success: true };
    } else if (action === 'quizzes') response = quizzes.filter((quiz) => admin || quiz.is_active);
    else if (action === 'questions')
      response = questions.filter(
        (question) => question.quiz_id === requestUrl.searchParams.get('quizId'),
      );
    else if (
      action === 'quiz' &&
      method === 'POST' &&
      typeof payload === 'object' &&
      payload !== null &&
      'name' in payload &&
      'slug' in payload &&
      typeof payload.name === 'string' &&
      typeof payload.slug === 'string'
    ) {
      const quiz: Quiz = {
        id: '00000000-0000-4000-8000-000000000004',
        name: payload.name,
        slug: payload.slug,
        question_count: 0,
        is_active: false,
        created_at: '2026-01-02',
      };
      quizzes.unshift(quiz);
      response = quiz;
    } else if (
      action === 'quiz' &&
      method === 'PATCH' &&
      typeof payload === 'object' &&
      payload !== null &&
      'id' in payload &&
      'is_active' in payload &&
      typeof payload.is_active === 'boolean'
    ) {
      const quiz = quizzes.find((item) => item.id === payload.id);
      if (quiz) quiz.is_active = payload.is_active;
      response = { success: true };
    } else if (
      action === 'question' &&
      method === 'POST' &&
      typeof payload === 'object' &&
      payload !== null &&
      'quiz_id' in payload &&
      'question_text' in payload &&
      'correct_answer' in payload &&
      typeof payload.quiz_id === 'string' &&
      typeof payload.question_text === 'string' &&
      typeof payload.correct_answer === 'string'
    ) {
      questions.push({
        id: '00000000-0000-4000-8000-000000000005',
        quiz_id: payload.quiz_id,
        question_text: payload.question_text,
        correct_answer: payload.correct_answer,
        order_number: 1,
      });
      const quiz = quizzes.find((item) => item.id === payload.quiz_id);
      if (quiz) quiz.question_count += 1;
      response = { success: true };
    } else if (action === 'review' && method === 'GET') response = participants;
    else if (
      action === 'review' &&
      method === 'PATCH' &&
      typeof payload === 'object' &&
      payload !== null &&
      'is_correct' in payload &&
      (typeof payload.is_correct === 'boolean' || payload.is_correct === null)
    ) {
      participants[0].answers[0].is_correct = payload.is_correct;
      response = { success: true };
    } else if (action === 'results')
      response = {
        ranked: [
          {
            id: participantId,
            name: 'Команда Альфа',
            correct_count: 1,
            answered_count: 1,
            pending_count: 0,
            total_count: 1,
          },
          {
            id: 'another-participant',
            name: 'Команда Бета',
            correct_count: 1,
            answered_count: 1,
            pending_count: 0,
            total_count: 1,
          },
        ],
        pending: [
          { id: 'waiting-participant', name: 'Команда Гамма', checked_count: 0, total_count: 1 },
        ],
        playing: [
          { id: 'playing-participant', name: 'Команда Дельта', answered_count: 0, total_count: 1 },
        ],
      };
    else if (action === 'play') {
      const answered = typeof payload === 'object' && payload !== null && 'question_id' in payload;
      if (answered)
        progress = [
          {
            quiz_id: quizId,
            correct_count: null,
            answered_count: 1,
            pending_count: 1,
            total_count: 1,
            completed: true,
          },
        ];
      response = {
        question: answered
          ? null
          : { id: questionId, question_text: questions[0].question_text, order_number: 1 },
        deadline: answered ? null : new Date(Date.now() + 60000).toISOString(),
        server_time: new Date().toISOString(),
        total: 1,
        answered: answered ? 1 : 0,
        completed: answered,
      };
    } else {
      await route.fulfill({ status: 400, json: { message: `Unexpected test action: ${action}` } });
      return;
    }
    await route.fulfill({ json: response });
  });
}

test('catalog is responsive and links to individual quiz results', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Выберите квиз' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Кино без границ' })).toBeVisible();
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
  await page.screenshot({
    path: `/private/tmp/quizroom-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Результаты', exact: true }).last().click();
  await expect(page).toHaveURL(/\/quiz\/cinema\/results$/);
  await expect(page.getByRole('list', { name: 'Итоговые результаты' })).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Итоговые результаты' })
      .getByRole('listitem')
      .filter({ hasText: 'Команда Бета' })
      .getByLabel('Место 1'),
  ).toHaveText('1');
});

test('participant starts a quiz, submits an answer and reaches results', async ({ page }) => {
  await mockApi(page);
  await page.goto('/quiz/cinema');
  await page.getByLabel('Имя в таблице результатов').fill('Команда Альфа');
  await page.getByRole('button', { name: 'Начать игру', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Кто снял фильм «Сталкер»?' })).toBeVisible();
  await page.getByLabel('Ваш ответ').fill('Андрей Тарковский');
  await page.getByLabel('Ваш ответ').press('Enter');
  await expect(page.getByRole('link', { name: 'Смотреть результаты' })).toBeVisible();
  await page.getByRole('link', { name: 'Смотреть результаты' }).click();
  await expect(page.getByRole('list', { name: 'Итоговые результаты' })).toBeVisible();
});

test('administrator signs in and creates a quiz with its own address', async ({ page }) => {
  await mockApi(page);
  await page.goto('/admin/quizzes');
  await page.getByLabel('Пароль администратора').fill('test-only-admin-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Квизы и вопросы' })).toBeVisible();
  await page.getByText('Создать новый квиз', { exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Наука вокруг нас');
  await page.getByLabel('Адрес квиза').fill('science');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await expect(page.getByText('Черновик создан.', { exact: false })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveValue('Наука вокруг нас (черновик)');
  await page.getByLabel('Текст вопроса').fill('Как называется наша галактика?');
  await page.getByLabel('Правильный ответ', { exact: false }).fill('Млечный Путь');
  await page.getByRole('button', { name: 'Добавить вопрос', exact: true }).click();
  await expect(page.getByText('Вопрос сохранён.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Как называется наша галактика?' })).toBeVisible();
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByText('Квиз опубликован.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Квизы', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Наука вокруг нас' })).toBeVisible();
});

test('administrator can score, reverse and clear a verdict', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/admin/check');
  await page.getByRole('button', { name: /Команда Альфа/ }).click();
  await expect(page.getByText('Те же слова в другом порядке.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Засчитать', exact: true }).click();
  await expect(page.getByText('Засчитан', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Не засчитать', exact: true }).click();
  await expect(page.getByText('Не засчитан', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Снять оценку', exact: true }).click();
  await expect(page.getByText('Ожидает проверки', { exact: true })).toBeVisible();
});

test('catalog failure displays a retry action instead of endless loading', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/quiz?action=quizzes', (route) =>
    route.fulfill({ status: 503, json: { message: 'Временная ошибка базы' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Временная ошибка базы');
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
});

test('all three steps are visible and the header remains aligned when scrolling', async ({
  page,
}) => {
  await mockApi(page, true);
  await page.goto('/');
  const steps = page.getByRole('list', { name: 'Как играть' });
  await expect(steps.getByRole('listitem')).toHaveCount(3);
  for (const step of await steps.getByRole('listitem').all()) await expect(step).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Главная навигация' });
  const bounds = await navigation.getByRole('link').evaluateAll((links) =>
    links.map((link) => ({
      width: link.getBoundingClientRect().width,
      top: link.getBoundingClientRect().top,
    })),
  );
  expect(
    Math.max(...bounds.map((bound) => bound.width)) -
      Math.min(...bounds.map((bound) => bound.width)),
  ).toBeLessThan(1);
  expect(new Set(bounds.map((bound) => bound.top)).size).toBe(1);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const headerTop = await page
    .getByRole('banner')
    .evaluate((header) => header.getBoundingClientRect().top);
  expect(headerTop).toBe(0);
});

test('name entry can be cancelled without starting an attempt', async ({ page }) => {
  await mockApi(page);
  let playRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).searchParams.get('action') === 'play') playRequests += 1;
  });
  await page.goto('/quiz/cinema');
  await page.getByLabel('Имя в таблице результатов').fill('Передумал');
  await page.getByRole('link', { name: 'Отмена', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect(playRequests).toBe(0);
});

test('completed quiz displays the score after reload and cannot be restarted', async ({ page }) => {
  await mockApi(page, false, [
    {
      quiz_id: quizId,
      correct_count: 1,
      answered_count: 1,
      pending_count: 0,
      total_count: 1,
      completed: true,
    },
  ]);
  await page.goto('/');
  const card = page.getByRole('article').filter({ hasText: 'Кино без границ' });
  await expect(card).toContainText('Ваш результат');
  await expect(card).toContainText('1 / 1');
  await expect(card.getByRole('link', { name: 'Начать игру' })).toHaveCount(0);
  await page.reload();
  await expect(card).toContainText('Пройден');
  await page.goto('/quiz/cinema');
  await expect(page.getByLabel('Имя в таблице результатов')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Смотреть результаты' })).toBeVisible();
});

test('pending and unfinished players are separate from the ranked list without scores', async ({
  page,
}, testInfo) => {
  await mockApi(page);
  await page.goto('/results');
  const ranked = page.getByRole('region', { name: 'Итоговые результаты' });
  await expect(ranked.getByText('Команда Альфа')).toBeVisible();
  await expect(ranked.getByText('Команда Гамма')).toHaveCount(0);
  const pending = page.getByRole('region', { name: 'На проверке' });
  await expect(pending).toContainText('Команда Гамма');
  await expect(pending).toContainText('Проверено 0 из 1');
  await expect(page.getByRole('region', { name: 'В игре' })).toContainText('Команда Дельта');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `/private/tmp/quizroom-results-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test('quiz picker supports search, keyboard selection and Escape', async ({ page }) => {
  await mockApi(page, true);
  await page.route('**/api/quiz?action=quizzes', (route) =>
    route.fulfill({
      json: [
        {
          id: 'hidden-id',
          name: 'Скрытый квиз',
          slug: 'hidden',
          is_active: false,
          question_count: 1,
        },
        { id: quizId, name: 'Кино без границ', slug: 'cinema', is_active: true, question_count: 1 },
        {
          id: 'science-id',
          name: 'Наука вокруг нас',
          slug: 'science',
          is_active: true,
          question_count: 1,
        },
      ],
    }),
  );
  await page.goto('/results');
  const picker = page.getByRole('combobox', { name: 'Квиз', exact: true });
  await expect(picker).toHaveValue('Кино без границ');
  await picker.click();
  await expect(page.getByRole('option')).toHaveCount(2);
  await picker.fill('Наука');
  await expect(page.getByRole('option')).toHaveCount(1);
  await picker.press('Enter');
  await expect(picker).toHaveValue('Наука вокруг нас');
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await picker.click();
  await picker.press('ArrowUp');
  await picker.press('Enter');
  await expect(picker).toHaveValue('Кино без границ');
  await picker.click();
  await picker.fill('нет такой темы');
  await expect(page.getByText('Квизы не найдены')).toBeVisible();
  await picker.press('Escape');
  await expect(picker).toHaveValue('Кино без границ');
});

test('a completed quiz under review offers results without a new start', async ({ page }) => {
  await mockApi(page, false, [
    {
      quiz_id: quizId,
      correct_count: null,
      answered_count: 1,
      pending_count: 1,
      total_count: 1,
      completed: true,
    },
  ]);
  await page.goto('/');
  const card = page.getByRole('article');
  await expect(card).toContainText('Ответы на проверке');
  await expect(card.getByRole('link', { name: 'Начать игру' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Смотреть результаты' })).toBeVisible();
});

test('an unfinished attempt offers continuation after reload', async ({ page }) => {
  await mockApi(page, false, [
    {
      quiz_id: quizId,
      correct_count: null,
      answered_count: 0,
      pending_count: 0,
      total_count: 1,
      completed: false,
    },
  ]);
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('article')).toContainText('В процессе');
  await page.getByRole('link', { name: 'Продолжить', exact: true }).click();
  await expect(page).toHaveURL('/quiz/cinema');
  await expect(page.getByRole('heading', { name: 'Кто снял фильм «Сталкер»?' })).toBeVisible();
  await expect(page.getByLabel('Имя в таблице результатов')).toHaveCount(0);
});

test('long participant names fit narrow result cards', async ({ page }) => {
  await mockApi(page, true);
  await page.setViewportSize({ width: 320, height: 740 });
  const longName = 'ОченьДлинноеНазваниеКомандыБезПробелов'.repeat(3);
  await page.route('**/api/quiz?action=results&**', (route) =>
    route.fulfill({
      json: {
        ranked: [
          {
            id: participantId,
            name: longName,
            correct_count: 125,
            total_count: 150,
            answered_count: 150,
            pending_count: 0,
          },
        ],
        pending: [{ id: 'pending', name: longName, checked_count: 50, total_count: 150 }],
        playing: [],
      },
    }),
  );
  await page.goto('/results');
  await expect(page.getByRole('list', { name: 'Итоговые результаты' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const rows = page.getByRole('list', { name: 'Итоговые результаты' }).getByRole('listitem');
  expect(await rows.first().evaluate((row) => row.scrollWidth <= row.clientWidth)).toBe(true);
});

test('route changes and browser history always scroll to the page top', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page
    .getByRole('navigation', { name: 'Главная навигация' })
    .getByRole('link', { name: 'Результаты' })
    .click();
  await expect(page.getByRole('heading', { name: 'Результаты', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Выберите квиз' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('resume opens the next unanswered question with the existing deadline and no name prompt', async ({
  page,
}) => {
  await mockApi(page, false, [
    {
      quiz_id: quizId,
      answered_count: 1,
      total_count: 3,
      pending_count: 1,
      correct_count: null,
      completed: false,
    },
  ]);
  await page.route('**/api/quiz?action=play', async (route) => {
    const payload: unknown = route.request().postDataJSON();
    expect(
      typeof payload === 'object' &&
        payload !== null &&
        'resume_only' in payload &&
        payload.resume_only === true,
    ).toBe(true);
    expect(typeof payload === 'object' && payload !== null && 'name' in payload).toBe(false);
    await route.fulfill({
      json: {
        question: {
          id: 'next-question',
          question_text: 'Следующий вопрос после сохранённого ответа',
          order_number: 2,
        },
        deadline: new Date(Date.now() + 15000).toISOString(),
        server_time: new Date().toISOString(),
        total: 3,
        answered: 1,
        completed: false,
      },
    });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Продолжить', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Следующий вопрос после сохранённого ответа' }),
  ).toBeVisible();
  await expect(page.getByText('Вопрос 2 / 3', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Имя в таблице результатов')).toHaveCount(0);
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /Осталось 1[45] секунд/);
});

test('failed resume offers retry without displaying the registration form', async ({ page }) => {
  await mockApi(page, false, [
    {
      quiz_id: quizId,
      answered_count: 0,
      total_count: 1,
      pending_count: 0,
      correct_count: null,
      completed: false,
    },
  ]);
  await page.route('**/api/quiz?action=play', (route) =>
    route.fulfill({ status: 503, json: { message: 'Не удалось продолжить игру' } }),
  );
  await page.goto('/quiz/cinema');
  await expect(page.getByRole('alert')).toContainText('Не удалось продолжить игру');
  await expect(page.getByLabel('Имя в таблице результатов')).toHaveCount(0);
  await page.unroute('**/api/quiz?action=play');
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByRole('heading', { name: 'Кто снял фильм «Сталкер»?' })).toBeVisible();
});

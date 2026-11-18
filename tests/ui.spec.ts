import type { Page } from '@playwright/test';
import type { Quiz, Question, ParticipantWithAnswers } from '../src/types';
import { test, expect } from '@playwright/test';

const quizId = '00000000-0000-4000-8000-000000000001';
const questionId = '00000000-0000-4000-8000-000000000002';
const participantId = '00000000-0000-4000-8000-000000000003';

async function mockApi(page: Page, initiallyAdmin = false): Promise<void> {
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
    if (action === 'session') response = { admin };
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
      response = [
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
      ];
    else if (action === 'play') {
      const answered = typeof payload === 'object' && payload !== null && 'question_id' in payload;
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
  await expect(page.getByRole('heading', { name: 'Выберите свой квиз' })).toBeVisible();
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
  await expect(page.getByRole('table')).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'Команда Бета' }).locator('td').first(),
  ).toHaveText('1');
});

test('participant starts a quiz, submits an answer and reaches results', async ({ page }) => {
  await mockApi(page);
  await page.goto('/quiz/cinema');
  await page.getByLabel('Имя в таблице результатов').fill('Команда Альфа');
  await page.getByRole('button', { name: 'Начать или продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Кто снял фильм «Сталкер»?' })).toBeVisible();
  await page.getByLabel('Ваш ответ').fill('Андрей Тарковский');
  await page.getByRole('button', { name: 'Отправить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Ваши ответы сохранены' })).toBeVisible();
  await page.getByRole('link', { name: 'Смотреть результаты' }).click();
  await expect(page.getByRole('table')).toBeVisible();
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
  await expect(page.getByRole('combobox')).toHaveValue('00000000-0000-4000-8000-000000000004');
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

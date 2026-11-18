import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

const endpoint = 'https://edge.example.test/functions/v1/quiz';
const adminToken = 'test-only-signed-admin-session';

async function mockEdge(page: Page): Promise<void> {
  await page.route('https://telegram.org/**', (route) => route.abort());
  await page.route(`${endpoint}**`, async (route) => {
    const request = route.request();
    const action = new URL(request.url()).searchParams.get('action');
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Headers': 'Content-Type, X-Quiz-Admin-Session, X-Quiz-Player-Session',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Expose-Headers': 'X-Quiz-Admin-Session',
      'Content-Type': 'application/json',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    expect(request.headers().cookie).toBeUndefined();
    const admin = request.headers()['x-quiz-admin-session'] === adminToken;
    let response: unknown = [];
    if (action === 'login') {
      await route.fulfill({
        headers: { ...headers, 'X-Quiz-Admin-Session': adminToken },
        body: JSON.stringify({ admin: true }),
      });
      return;
    }
    if (action === 'logout') {
      expect(admin).toBe(true);
      await route.fulfill({
        headers: { ...headers, 'X-Quiz-Admin-Session': '' },
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    if (action === 'session') response = { admin };
    await route.fulfill({ headers, body: JSON.stringify(response) });
  });
}

test('Edge administrator signs in, reloads and logs out using headers without cookies', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'irrelevant-cookie', value: 'do-not-send', domain: 'edge.example.test', path: '/' },
  ]);
  await mockEdge(page);
  await page.goto('/admin/quizzes');
  await page.getByLabel('Пароль администратора').fill('test-only-admin-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Квизы и вопросы' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Квизы и вопросы' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0);
  await page.goto('/admin/quizzes');
  await expect(page.getByLabel('Пароль администратора')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Пароль администратора')).toBeVisible();
  const storedPassword = await page.evaluate(() =>
    Object.values(sessionStorage).some((value) => value === 'test-only-admin-password'),
  );
  expect(storedPassword).toBe(false);
});

test('Edge administrator remains usable when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('Storage disabled');
      },
    });
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage disabled');
      },
    });
  });
  await mockEdge(page);
  await page.goto('/admin/quizzes');
  await page.getByLabel('Пароль администратора').fill('test-only-admin-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Квизы и вопросы' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0);
  await page.goto('/admin/quizzes');
  await expect(page.getByLabel('Пароль администратора')).toBeVisible();
});

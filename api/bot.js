import { Telegraf } from 'telegraf';
import { equalSecrets } from '../server/security.js';

let bot;
function getBot() {
  if (bot) return bot;
  const token = process.env.BOT_TOKEN;
  const appUrl = process.env.WEB_APP_URL;
  if (!token || !appUrl || new URL(appUrl).protocol !== 'https:')
    throw new Error('Bot is not configured');
  const application = new Telegraf(token);
  application.command('start', async (context) => {
    const privateChat = context.chat.type === 'private';
    const username = context.botInfo.username;
    await context.reply('Добро пожаловать в Quizroom. Выберите тему и начните игру.', {
      reply_markup: {
        inline_keyboard: [
          [
            privateChat
              ? { text: 'Выбрать квиз', web_app: { url: new URL('/', appUrl).href } }
              : { text: 'Выбрать квиз', url: `https://t.me/${username}?start=quiz` },
          ],
        ],
      },
    });
  });
  // Avoid serializing Telegram payloads or tokens in error logs.
  application.catch(() => {
    throw new Error('Bot update failed');
  });
  bot = application;
  return application;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'GET') return response.status(200).json({ status: 'running' });
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).end();
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = request.headers['x-telegram-bot-api-secret-token'];
  if (!secret) return response.status(503).json({ message: 'Webhook is not configured' });
  if (typeof supplied !== 'string' || !equalSecrets(supplied, secret))
    return response.status(403).end();
  try {
    if (!request.body || !Number.isInteger(request.body.update_id))
      return response.status(400).end();
    await getBot().handleUpdate(request.body);
    return response.status(200).send('OK');
  } catch {
    console.error('Bot webhook failed');
    return response.status(500).json({ message: 'Bot update failed' });
  }
}

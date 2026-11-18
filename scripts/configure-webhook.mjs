import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

class SetupError extends Error {}

export async function configureWebhook(environment, apply = false) {
  const token = environment.BOT_TOKEN;
  const secret = environment.TELEGRAM_WEBHOOK_SECRET;
  if (!token) throw new SetupError('BOT_TOKEN is missing.');
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new SetupError(
      'TELEGRAM_WEBHOOK_SECRET must contain 1–256 letters, digits, underscores or hyphens.',
    );
  }
  let endpoint;
  try {
    const application = new URL(environment.WEB_APP_URL);
    if (application.protocol !== 'https:' || application.username || application.password) {
      throw new Error('Invalid application URL');
    }
    endpoint = new URL('/api/bot', application.origin);
  } catch {
    throw new SetupError('WEB_APP_URL must be a public HTTPS application URL.');
  }

  async function telegram(method, body) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        ...(body
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new SetupError(`Telegram ${method} failed (HTTP ${response.status}).`);
      return payload.result;
    } catch (error) {
      if (error instanceof SetupError) throw error;
      // Network errors may contain credential-bearing URLs; never forward them.
      throw new SetupError(`Telegram ${method} request failed.`);
    }
  }

  const [identity, current] = await Promise.all([telegram('getMe'), telegram('getWebhookInfo')]);
  let probe;
  try {
    // Invalid update: verifies the secret without invoking handlers or sending messages.
    probe = await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new SetupError('The deployed webhook could not be reached.');
  }
  if (probe.status !== 400) {
    throw new SetupError(
      `Webhook preflight returned HTTP ${probe.status}; expected 400. Check the deployed TELEGRAM_WEBHOOK_SECRET and WEB_APP_URL.`,
    );
  }
  console.log(`Bot: @${identity.username}`);
  console.log(`Webhook: ${endpoint.href}`);
  console.log(`Pending updates: ${current.pending_update_count}`);
  console.log('The deployed webhook accepts the configured secret.');
  if (!apply) {
    console.log('Read-only check complete. Run npm run webhook:setup to register the secret.');
    return;
  }
  await telegram('setWebhook', {
    url: endpoint.href,
    secret_token: secret,
    drop_pending_updates: false,
    ...(current.max_connections ? { max_connections: current.max_connections } : {}),
  });
  const updated = await telegram('getWebhookInfo');
  if (updated.url !== endpoint.href)
    throw new SetupError('Webhook registration could not be verified.');
  console.log('Webhook registered with the matching secret. Pending updates were preserved.');
  console.log(`Pending updates after registration: ${updated.pending_update_count}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some((argument) => argument !== '--apply')) {
    console.error('Usage: node scripts/configure-webhook.mjs [--apply]');
    process.exitCode = 1;
  } else {
    const environment = { ...loadEnv('development', process.cwd(), ''), ...process.env };
    try {
      await configureWebhook(environment, argumentsList.includes('--apply'));
    } catch (error) {
      console.error(
        error instanceof SetupError ? error.message : 'Webhook setup failed; credentials omitted.',
      );
      process.exitCode = 1;
    }
  }
}

import { randomBytes } from 'node:crypto';

const variableNames = ['SESSION_SECRET', 'ADMIN_PASSWORD', 'TELEGRAM_WEBHOOK_SECRET'];

process.stdout.write(
  variableNames
    .map((variableName) => `${variableName}=${randomBytes(32).toString('base64url')}`)
    .join('\n') + '\n',
);

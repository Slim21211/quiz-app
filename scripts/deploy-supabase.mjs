import { spawn } from 'node:child_process';
import { loadEnv } from 'vite';

const environment = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const apply = process.argv.includes('--apply');

async function runCli(argumentsValue, input) {
  await new Promise((resolve, reject) => {
    // A shell pipe stays readable as /dev/stdin on macOS; Node pipe stdio uses a socket.
    const cli = environment.SUPABASE_CLI_BINARY || 'npx';
    const cliArguments = environment.SUPABASE_CLI_BINARY
      ? argumentsValue
      : ['--yes', 'supabase@2.54.11', ...argumentsValue];
    const command = input === undefined ? cli : '/bin/sh';
    const commandArguments =
      input === undefined
        ? cliArguments
        : ['-c', 'cat | "$@"', 'supabase-stdin', cli, ...cliArguments];
    const child = spawn(command, commandArguments, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // CLI output is intentionally suppressed: errors may contain secret input.
    child.stdout.resume();
    child.stderr.resume();
    child.on('error', () => reject(new Error('Could not start Supabase CLI.')));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Supabase CLI failed. Check CLI authentication and project access.'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

try {
  const projectUrl = new URL(environment.SUPABASE_URL);
  const projectRef = projectUrl.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
  if (projectUrl.protocol !== 'https:' || !projectRef) {
    throw new Error('SUPABASE_URL must identify a hosted Supabase project.');
  }
  const required = { SESSION_SECRET: 32, ADMIN_PASSWORD: 16, BOT_TOKEN: 20 };
  const settings = { WEB_APP_URL: 'https://quiz.elvada.ru' };
  for (const [name, minimum] of Object.entries(required)) {
    if (!environment[name] || environment[name].length < minimum) {
      throw new Error(`${name} is missing or too short.`);
    }
    settings[name] = environment[name];
  }
  console.log(`Supabase project: ${projectRef}`);
  console.log(`Function: quiz`);
  console.log(`Secrets: ${Object.keys(settings).join(', ')}`);
  if (!apply) {
    console.log('Configuration check complete. No remote changes were made.');
  } else {
    const source = Object.entries(settings)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join('\n');
    await runCli(
      ['secrets', 'set', '--project-ref', projectRef, '--env-file', '/dev/stdin', '--yes'],
      source,
    );
    console.log('Function secrets configured.');
    await runCli([
      'functions',
      'deploy',
      'quiz',
      '--project-ref',
      projectRef,
      '--use-api',
      '--yes',
    ]);
    console.log(`Function deployed: ${projectUrl.origin}/functions/v1/quiz`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Supabase setup failed.');
  process.exitCode = 1;
}

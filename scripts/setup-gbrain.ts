/**
 * Register shared-source + one app-level OAuth client for gbrain think.
 * Personal memory lives in app Postgres (`app_memories`).
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appDatabaseUrl,
  DEMO_API_KEYS,
  SHARED_OAUTH_CLIENT_NAME,
  SHARED_SOURCE_ID,
} from '../server/config.ts';
import { closeDb, getGbrainAuth, migrate, upsertGbrainAuth, upsertUser } from '../server/db.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type OAuthRegistration = {
  clientId: string;
  clientSecret: string;
};

function runGbrain(args: string): string {
  const cmd = `gbrain ${args}`;
  try {
    return execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    }).trim();
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
    throw new Error(out || e.message || cmd);
  }
}

function runGbrainAllowExists(args: string): void {
  try {
    runGbrain(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists|duplicate|registered/i.test(msg)) {
      console.log(`(skip) ${args} — ${msg.split('\n')[0]}`);
      return;
    }
    throw err;
  }
}

function parseOAuthRegistration(output: string): OAuthRegistration {
  const clientId = output.match(/Client ID:\s+(\S+)/i)?.[1];
  const clientSecret = output.match(/Client Secret:\s+(\S+)/i)?.[1];
  if (!clientId || !clientSecret) {
    throw new Error(`Could not parse OAuth registration output:\n${output}`);
  }
  return { clientId, clientSecret };
}

function ensureGitRepo(relativeDir: string): void {
  const dir = path.join(REPO_ROOT, relativeDir);
  if (!existsSync(path.join(dir, '.git'))) {
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    console.log(`Initialized git repo: ${relativeDir}`);
  }
  try {
    execSync('git rev-parse HEAD', { cwd: dir, stdio: 'ignore' });
  } catch {
    execSync('git add -A', { cwd: dir, stdio: 'ignore' });
    execSync('git commit -m "chore: initial source commit" --allow-empty', {
      cwd: dir,
      stdio: 'ignore',
    });
    console.log(`Created initial commit: ${relativeDir}`);
  }
}

async function ensureSharedOAuth(force: boolean): Promise<OAuthRegistration> {
  const existing = await getGbrainAuth();
  if (!force && existing) {
    console.log(`(skip) Shared OAuth — already configured (${existing.oauth_client_id})`);
    return {
      clientId: existing.oauth_client_id,
      clientSecret: existing.oauth_client_secret,
    };
  }

  if (existing && force) {
    try {
      runGbrain(`auth revoke-client ${existing.oauth_client_id}`);
      console.log('Revoked prior shared OAuth client');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Could not revoke prior OAuth client: ${msg.split('\n')[0]}`);
    }
  }

  const out = runGbrain(
    `auth register-client ${SHARED_OAUTH_CLIENT_NAME} --grant-types client_credentials --scopes "read" --source ${SHARED_SOURCE_ID} --federated-read ${SHARED_SOURCE_ID}`,
  );
  return parseOAuthRegistration(out);
}

async function main(): Promise<void> {
  const forceOAuth = process.argv.includes('--force-oauth');
  if (!appDatabaseUrl()) {
    throw new Error('Set APP_DATABASE_URL or GBRAIN_DATABASE_URL in .env');
  }

  console.log('Registering shared gbrain source...');
  ensureGitRepo('shared-source');
  runGbrainAllowExists(`sources add ${SHARED_SOURCE_ID} --path ./shared-source --federated`);

  console.log('Syncing shared-source...');
  try {
    runGbrain(`sync --source ${SHARED_SOURCE_ID}`);
  } catch (err) {
    console.warn('Sync warning (non-fatal):', err instanceof Error ? err.message : err);
  }

  await migrate();

  console.log('Registering shared OAuth client for think...');
  const oauth = await ensureSharedOAuth(forceOAuth);
  await upsertGbrainAuth({
    oauth_client_id: oauth.clientId,
    oauth_client_secret: oauth.clientSecret,
  });
  console.log(`  oauth_client_id=${oauth.clientId}`);

  for (const [id, apiKey] of Object.entries(DEMO_API_KEYS)) {
    await upsertUser({ id, api_key: apiKey });
    console.log(`  demo user ${id}: api_key=${apiKey}`);
  }

  console.log('\nSetup complete.');
  console.log('Start gbrain: gbrain serve --http --port 3131');
  console.log('Start API:    bun run server');
  await closeDb();
}

await main();

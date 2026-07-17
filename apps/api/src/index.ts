import { buildThinkQuestion, slugForMemoryNote } from './context.ts';
import { serverPort } from './config.ts';
import {
  getOrCreateSession,
  getUserByApiKey,
  insertMemory,
  insertMessage,
  listRecentMessages,
  migrate,
  searchMemoriesByUser,
  seedDemoUsersIfEmpty,
} from './db.ts';
import { gbrainThink } from './gbrain-client.ts';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized(): Response {
  return json({ error: 'Unauthorized. Use Authorization: Bearer <demo-api-key>.' }, 401);
}

async function resolveUser(req: Request) {
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const apiKey = match?.[1]?.trim();
  if (!apiKey) return null;
  return getUserByApiKey(apiKey);
}

async function handleQuery(req: Request): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const message = body.message?.trim();
  if (!message) return json({ error: 'message is required' }, 400);

  const sessionId = await getOrCreateSession(user.id);
  const recent = await listRecentMessages(sessionId);
  const personalMemories = await searchMemoriesByUser(user.id, message);
  const question = buildThinkQuestion(recent, message, personalMemories);

  let answer: string;
  try {
    answer = await gbrainThink(question);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 502);
  }

  await insertMessage(sessionId, 'user', message);
  await insertMessage(sessionId, 'assistant', answer);

  return json({
    userId: user.id,
    sessionId,
    answer,
  });
}

async function handleRemember(req: Request): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  let body: { content?: string };
  try {
    body = (await req.json()) as { content?: string };
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const content = body.content?.trim();
  if (!content) return json({ error: 'content is required' }, 400);

  const slug = slugForMemoryNote();
  const memory = await insertMemory(user.id, slug, content);

  return json({
    userId: user.id,
    slug: memory.slug,
    saved: true,
  });
}

async function handleHealth(): Promise<Response> {
  return json({ ok: true });
}

const server = Bun.serve({
  port: serverPort(),
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') return handleHealth();
    if (req.method === 'POST' && url.pathname === '/query') return handleQuery(req);
    if (req.method === 'POST' && url.pathname === '/remember') return handleRemember(req);
    return json({ error: 'Not found' }, 404);
  },
});

await migrate();
await seedDemoUsersIfEmpty();

console.log(`gbrain-sandbox API listening on http://localhost:${server.port}`);
console.log('Demo keys: Authorization: Bearer demo-key-lily | demo-key-bob');

export default server;

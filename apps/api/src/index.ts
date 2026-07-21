import { slugForMemoryNote } from './context.ts';
import { serverPort } from './config.ts';
import {
  countUsers,
  createUser,
  deleteUser,
  getOrCreateSession,
  getUserByApiKey,
  getUserById,
  insertMemory,
  insertMessage,
  listRecentMessages,
  listUsers,
  migrate,
  searchMemoriesByUser,
  seedDemoUsersIfEmpty,
  updateUserApiKey,
  type AppUser,
} from './db.ts';
import { answerWithHydratedPages } from './answer.ts';
import { gbrainQueryHits, gbrainSearch } from './gbrain-client.ts';
import { logRetrievalHits, parseRetrievalHits } from './retrieval.ts';

export type AskMode = 'think' | 'query' | 'search';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized(): Response {
  return json({ error: 'Unauthorized. Use Authorization: Bearer <api-key>.' }, 401);
}

function userJson(user: AppUser) {
  return {
    id: user.id,
    apiKey: user.api_key,
    createdAt: user.created_at?.toISOString?.() ?? user.created_at ?? null,
  };
}

async function resolveUser(req: Request) {
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const apiKey = match?.[1]?.trim();
  if (!apiKey) return null;
  return getUserByApiKey(apiKey);
}

function parseAskMode(raw: unknown): AskMode | null {
  if (raw === undefined || raw === null || raw === '') return 'think';
  if (raw === 'think' || raw === 'query' || raw === 'search') return raw;
  return null;
}

function normalizeUserId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  if (!id) return null;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id)) return null;
  return id;
}

function newApiKey(userId: string): string {
  return `demo-key-${userId}-${crypto.randomUUID().slice(0, 8)}`;
}

async function handleQuery(req: Request): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  let body: { message?: string; mode?: string };
  try {
    body = (await req.json()) as { message?: string; mode?: string };
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const message = body.message?.trim();
  if (!message) return json({ error: 'message is required' }, 400);

  const mode = parseAskMode(body.mode);
  if (!mode) {
    return json({ error: "mode must be 'think', 'query', or 'search'" }, 400);
  }

  let answer: string;
  try {
    switch (mode) {
      case 'search':
        answer = await gbrainSearch(message);
        break;
      case 'query': {
        const hitsRaw = await gbrainQueryHits(message);
        const hits = parseRetrievalHits(hitsRaw);
        logRetrievalHits('query mode', message, hits);
        answer =
          typeof hitsRaw === 'string'
            ? hitsRaw
            : JSON.stringify(hitsRaw, null, 2);
        break;
      }
      case 'think': {
        const sessionId = await getOrCreateSession(user.id);
        const recent = await listRecentMessages(sessionId);
        const personalMemories = await searchMemoriesByUser(user.id, message);
        answer = await answerWithHydratedPages(recent, message, personalMemories);
        await insertMessage(sessionId, 'user', message);
        await insertMessage(sessionId, 'assistant', answer);
        return json({
          userId: user.id,
          sessionId,
          mode,
          answer,
        });
      }
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 502);
  }

  return json({
    userId: user.id,
    mode,
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

async function handleListUsers(): Promise<Response> {
  const users = await listUsers();
  return json({ users: users.map(userJson) });
}

async function handleGetUser(idParam: string): Promise<Response> {
  const id = normalizeUserId(idParam);
  if (!id) return json({ error: 'Invalid user id' }, 400);
  const user = await getUserById(id);
  if (!user) return json({ error: 'User not found' }, 404);
  return json(userJson(user));
}

async function handleCreateUser(req: Request): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor && (await countUsers()) > 0) return unauthorized();

  let body: { id?: string; apiKey?: string };
  try {
    body = (await req.json()) as { id?: string; apiKey?: string };
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const id = normalizeUserId(body.id ?? '');
  if (!id) {
    return json(
      { error: 'id is required (lowercase letter, then letters/digits/_/-)' },
      400,
    );
  }

  const apiKey = body.apiKey?.trim() || newApiKey(id);
  try {
    const user = await createUser(id, apiKey);
    return json(userJson(user), 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return json({ error: `User id or api key already exists` }, 409);
    }
    return json({ error: msg }, 502);
  }
}

async function handleUpdateUser(req: Request, idParam: string): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor) return unauthorized();

  const id = normalizeUserId(idParam);
  if (!id) return json({ error: 'Invalid user id' }, 400);

  let body: { apiKey?: string };
  try {
    body = (await req.json()) as { apiKey?: string };
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const apiKey = body.apiKey?.trim() || newApiKey(id);
  try {
    const user = await updateUserApiKey(id, apiKey);
    if (!user) return json({ error: 'User not found' }, 404);
    return json(userJson(user));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return json({ error: 'api key already in use' }, 409);
    }
    return json({ error: msg }, 502);
  }
}

async function handleDeleteUser(req: Request, idParam: string): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor) return unauthorized();

  const id = normalizeUserId(idParam);
  if (!id) return json({ error: 'Invalid user id' }, 400);

  const deleted = await deleteUser(id);
  if (!deleted) return json({ error: 'User not found' }, 404);
  return json({ deleted: true, id });
}

async function handleHealth(): Promise<Response> {
  return json({ ok: true });
}

const server = Bun.serve({
  port: serverPort(),
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') return handleHealth();
    if (req.method === 'POST' && path === '/query') return handleQuery(req);
    if (req.method === 'POST' && path === '/remember') return handleRemember(req);

    if (req.method === 'GET' && path === '/users') return handleListUsers();
    if (req.method === 'POST' && path === '/users') return handleCreateUser(req);

    const userMatch = path.match(/^\/users\/([^/]+)$/);
    if (userMatch) {
      const id = decodeURIComponent(userMatch[1]!);
      if (req.method === 'GET') return handleGetUser(id);
      if (req.method === 'PATCH') return handleUpdateUser(req, id);
      if (req.method === 'DELETE') return handleDeleteUser(req, id);
    }

    return json({ error: 'Not found' }, 404);
  },
});

await migrate();
await seedDemoUsersIfEmpty();

console.log(`gbrain-sandbox API listening on http://localhost:${server.port}`);
console.log('User CRUD: GET/POST /users, GET/PATCH/DELETE /users/:id');

export default server;

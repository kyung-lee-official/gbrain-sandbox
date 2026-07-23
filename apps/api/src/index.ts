import { answerWithHydratedPages } from "./answer.ts";
import { serverPort } from "./config.ts";
import { slugForMemoryNote } from "./context.ts";
import {
  type AppUser,
  countUsers,
  createSession,
  createUser,
  deleteGbrainAuth,
  deleteMemoryForUser,
  deleteUser,
  getGbrainAuth,
  getOrCreateSession,
  getSessionOwnedByUser,
  getUserByApiKey,
  getUserById,
  insertMemory,
  insertMessage,
  listMemoriesForUser,
  listMessagesForUser,
  listRecentMessages,
  listSessionsForUser,
  listUsers,
  nukeDatabases,
  searchMemoriesByUser,
  updateSessionTitle,
  updateUserApiKey,
  upsertGbrainAuth,
} from "./db.ts";
import {
  clearGbrainTokenCache,
  gbrainQueryHits,
  gbrainSearch,
  testGbrainOAuthCredentials,
} from "./gbrain-client.ts";
import { closePrisma } from "./prisma.ts";
import { logRetrievalHits, parseRetrievalHits } from "./retrieval.ts";

export type AskMode = "ask" | "query" | "search";

/** Browser UI is on :3133; without these, fetch fails as "Failed to fetch". */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function unauthorized(): Response {
  return json(
    { error: "Unauthorized. Use Authorization: Bearer <api-key>." },
    401,
  );
}

function userJson(user: AppUser) {
  return {
    id: user.id,
    apiKey: user.api_key,
    createdAt: user.created_at?.toISOString?.() ?? user.created_at ?? null,
  };
}

async function resolveUser(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const apiKey = match?.[1]?.trim();
  if (!apiKey) return null;
  return getUserByApiKey(apiKey);
}

function parseAskMode(raw: unknown): AskMode | null {
  if (raw === undefined || raw === null || raw === "") return "ask";
  if (raw === "ask" || raw === "query" || raw === "search") return raw;
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

function sessionJson(session: {
  id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: session.id,
    title: session.title,
    createdAt: isoFromDate(session.created_at),
    updatedAt: isoFromDate(session.updated_at),
  };
}

async function handleQuery(req: Request): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  let body: { message?: string; mode?: string; sessionId?: string };
  try {
    body = (await req.json()) as {
      message?: string;
      mode?: string;
      sessionId?: string;
    };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const message = body.message?.trim();
  if (!message) return json({ error: "message is required" }, 400);

  const mode = parseAskMode(body.mode);
  if (!mode) {
    return json({ error: "mode must be 'ask', 'query', or 'search'" }, 400);
  }

  let answer: string;
  try {
    switch (mode) {
      case "search":
        answer = await gbrainSearch(message);
        break;
      case "query": {
        const hitsRaw = await gbrainQueryHits(message);
        const hits = parseRetrievalHits(hitsRaw);
        logRetrievalHits("query mode", message, hits);
        answer =
          typeof hitsRaw === "string"
            ? hitsRaw
            : JSON.stringify(hitsRaw, null, 2);
        break;
      }
      case "ask": {
        const requested = body.sessionId?.trim();
        let sessionId: string;
        if (requested) {
          const owned = await getSessionOwnedByUser(requested, user.id);
          if (!owned) return json({ error: "Session not found" }, 404);
          sessionId = owned.id;
        } else {
          sessionId = await getOrCreateSession(user.id);
        }
        const recent = await listRecentMessages(sessionId);
        const personalMemories = await searchMemoriesByUser(user.id, message);
        answer = await answerWithHydratedPages(
          recent,
          message,
          personalMemories,
        );
        await insertMessage(sessionId, "user", message);
        await insertMessage(sessionId, "assistant", answer);
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

async function handleListSessions(req: Request): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  const sessions = await listSessionsForUser(user.id);
  return json({ sessions: sessions.map(sessionJson) });
}

async function handleCreateSession(req: Request): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  const session = await createSession(user.id);
  return json(sessionJson(session), 201);
}

async function handlePatchSession(
  req: Request,
  sessionIdParam: string,
): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  const sessionId = sessionIdParam.trim();
  if (!sessionId) return json({ error: "Invalid session id" }, 400);

  let body: { title?: string | null };
  try {
    body = (await req.json()) as { title?: string | null };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!("title" in body)) {
    return json({ error: "title is required (string or null)" }, 400);
  }

  let title: string | null;
  if (body.title === null) {
    title = null;
  } else if (typeof body.title === "string") {
    const trimmed = body.title.trim();
    title = trimmed.length > 0 ? trimmed : null;
  } else {
    return json({ error: "title must be a string or null" }, 400);
  }

  const session = await updateSessionTitle(sessionId, user.id, title);
  if (!session) return json({ error: "Session not found" }, 404);
  return json(sessionJson(session));
}

async function handleRemember(req: Request): Promise<Response> {
  const user = await resolveUser(req);
  if (!user) return unauthorized();

  let body: { content?: string };
  try {
    body = (await req.json()) as { content?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const content = body.content?.trim();
  if (!content) return json({ error: "content is required" }, 400);

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

async function handleNukeDatabase(req: Request): Promise<Response> {
  let body: { target?: string };
  try {
    body = (await req.json()) as { target?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const target = body.target;
  if (target !== "app") {
    return json(
      { error: "target must be 'app' (wipe gbrain DB manually)" },
      400,
    );
  }

  try {
    await nukeDatabases(target);
    clearGbrainTokenCache();
    await closePrisma();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }

  return json({ ok: true, nuked: true, target });
}

function gbrainAuthJson(auth: {
  oauth_client_id: string;
  oauth_client_secret: string;
}) {
  return {
    configured: true as const,
    oauthClientId: auth.oauth_client_id,
    oauthClientSecret: auth.oauth_client_secret,
  };
}

function parseGbrainAuthBody(body: {
  oauthClientId?: string;
  oauthClientSecret?: string;
}): { oauth_client_id: string; oauth_client_secret: string } | Response {
  const oauthClientId = body.oauthClientId?.trim() ?? "";
  const oauthClientSecret = body.oauthClientSecret?.trim() ?? "";
  if (!oauthClientId || !oauthClientSecret) {
    return json(
      { error: "oauthClientId and oauthClientSecret are required" },
      400,
    );
  }
  return {
    oauth_client_id: oauthClientId,
    oauth_client_secret: oauthClientSecret,
  };
}

async function handleGetGbrainAuth(): Promise<Response> {
  const auth = await getGbrainAuth();
  if (!auth) {
    return json({ configured: false });
  }
  return json(gbrainAuthJson(auth));
}

async function handlePutGbrainAuth(req: Request): Promise<Response> {
  let body: { oauthClientId?: string; oauthClientSecret?: string };
  try {
    body = (await req.json()) as {
      oauthClientId?: string;
      oauthClientSecret?: string;
    };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseGbrainAuthBody(body);
  if (parsed instanceof Response) return parsed;

  try {
    await upsertGbrainAuth(parsed);
    clearGbrainTokenCache();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }

  const connection = await testGbrainOAuthCredentials(parsed);
  return json({
    ...gbrainAuthJson(parsed),
    saved: true,
    connection,
  });
}

async function handleDeleteGbrainAuth(): Promise<Response> {
  try {
    const deleted = await deleteGbrainAuth();
    clearGbrainTokenCache();
    return json({ ok: true, deleted, configured: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
}

async function handleTestGbrainAuth(req: Request): Promise<Response> {
  let body: { oauthClientId?: string; oauthClientSecret?: string } = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text) as {
        oauthClientId?: string;
        oauthClientSecret?: string;
      };
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  let auth: { oauth_client_id: string; oauth_client_secret: string };
  if (body.oauthClientId?.trim() || body.oauthClientSecret?.trim()) {
    const parsed = parseGbrainAuthBody(body);
    if (parsed instanceof Response) return parsed;
    auth = parsed;
  } else {
    const stored = await getGbrainAuth();
    if (!stored) {
      return json(
        {
          ok: false,
          error:
            "No credentials stored. Enter client id/secret or save them first.",
        },
        400,
      );
    }
    auth = stored;
  }

  const connection = await testGbrainOAuthCredentials(auth);
  if (connection.ok) {
    return json({ ok: true, connection });
  }
  return json({
    ok: false,
    error: connection.error,
    connection,
  });
}

async function handleGetUser(idParam: string): Promise<Response> {
  const id = normalizeUserId(idParam);
  if (!id) return json({ error: "Invalid user id" }, 400);
  const user = await getUserById(id);
  if (!user) return json({ error: "User not found" }, 404);
  return json(userJson(user));
}

async function handleCreateUser(req: Request): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor && (await countUsers()) > 0) return unauthorized();

  let body: { id?: string; apiKey?: string };
  try {
    body = (await req.json()) as { id?: string; apiKey?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const id = normalizeUserId(body.id ?? "");
  if (!id) {
    return json(
      { error: "id is required (lowercase letter, then letters/digits/_/-)" },
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

async function handleUpdateUser(
  req: Request,
  idParam: string,
): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor) return unauthorized();

  const id = normalizeUserId(idParam);
  if (!id) return json({ error: "Invalid user id" }, 400);

  let body: { apiKey?: string };
  try {
    body = (await req.json()) as { apiKey?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const apiKey = body.apiKey?.trim() || newApiKey(id);
  try {
    const user = await updateUserApiKey(id, apiKey);
    if (!user) return json({ error: "User not found" }, 404);
    return json(userJson(user));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return json({ error: "api key already in use" }, 409);
    }
    return json({ error: msg }, 502);
  }
}

async function handleDeleteUser(
  req: Request,
  idParam: string,
): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor) return unauthorized();

  const id = normalizeUserId(idParam);
  if (!id) return json({ error: "Invalid user id" }, 400);

  const deleted = await deleteUser(id);
  if (!deleted) return json({ error: "User not found" }, 404);
  return json({ deleted: true, id });
}

function isoFromDate(value: Date | string | undefined | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function handleGetUserData(
  req: Request,
  idParam: string,
): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor) return unauthorized();

  const id = normalizeUserId(idParam);
  if (!id) return json({ error: "Invalid user id" }, 400);

  const user = await getUserById(id);
  if (!user) return json({ error: "User not found" }, 404);

  const url = new URL(req.url);
  const messagePageRaw = Number.parseInt(
    url.searchParams.get("messagePage") ?? "1",
    10,
  );
  const messagePage =
    Number.isFinite(messagePageRaw) && messagePageRaw > 0 ? messagePageRaw : 1;
  const messagePageSize = 50;

  const [memories, sessions, messagePageResult] = await Promise.all([
    listMemoriesForUser(id),
    listSessionsForUser(id),
    listMessagesForUser(id, { page: messagePage, pageSize: messagePageSize }),
  ]);

  return json({
    user: userJson(user),
    memories: memories.map((m) => ({
      id: m.id,
      slug: m.slug,
      content: m.content,
      createdAt: isoFromDate(m.created_at),
    })),
    sessions: sessions.map((s) => sessionJson(s)),
    messages: {
      items: messagePageResult.items.map((m) => ({
        id: m.id,
        sessionId: m.session_id,
        role: m.role,
        content: m.content,
        createdAt: isoFromDate(m.created_at),
      })),
      total: messagePageResult.total,
      page: messagePageResult.page,
      pageSize: messagePageResult.pageSize,
    },
  });
}

async function handleDeleteMemory(
  req: Request,
  idParam: string,
  memoryIdParam: string,
): Promise<Response> {
  const actor = await resolveUser(req);
  if (!actor) return unauthorized();

  const id = normalizeUserId(idParam);
  if (!id) return json({ error: "Invalid user id" }, 400);

  const memoryId = Number.parseInt(memoryIdParam, 10);
  if (!Number.isFinite(memoryId) || memoryId <= 0) {
    return json({ error: "Invalid memory id" }, 400);
  }

  const deleted = await deleteMemoryForUser(id, memoryId);
  if (!deleted) return json({ error: "Memory not found" }, 404);
  return json({ deleted: true, id: memoryId });
}

async function handleHealth(): Promise<Response> {
  return json({ ok: true });
}

const server = Bun.serve({
  port: serverPort(),
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") return corsPreflight();

    if (req.method === "GET" && path === "/health") return handleHealth();
    if (req.method === "POST" && path === "/admin/nuke")
      return handleNukeDatabase(req);
    if (req.method === "GET" && path === "/admin/gbrain-auth")
      return handleGetGbrainAuth();
    if (req.method === "PUT" && path === "/admin/gbrain-auth")
      return handlePutGbrainAuth(req);
    if (req.method === "DELETE" && path === "/admin/gbrain-auth")
      return handleDeleteGbrainAuth();
    if (req.method === "POST" && path === "/admin/gbrain-auth/test")
      return handleTestGbrainAuth(req);
    if (req.method === "POST" && path === "/query") return handleQuery(req);
    if (req.method === "POST" && path === "/remember")
      return handleRemember(req);

    if (req.method === "GET" && path === "/sessions")
      return handleListSessions(req);
    if (req.method === "POST" && path === "/sessions")
      return handleCreateSession(req);

    const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (req.method === "PATCH" && sessionMatch) {
      return handlePatchSession(req, decodeURIComponent(sessionMatch[1]!));
    }

    if (req.method === "GET" && path === "/users") return handleListUsers();
    if (req.method === "POST" && path === "/users")
      return handleCreateUser(req);

    const userDataMatch = path.match(/^\/users\/([^/]+)\/data$/);
    if (req.method === "GET" && userDataMatch) {
      return handleGetUserData(req, decodeURIComponent(userDataMatch[1]!));
    }

    const memoryMatch = path.match(/^\/users\/([^/]+)\/memories\/(\d+)$/);
    if (req.method === "DELETE" && memoryMatch) {
      return handleDeleteMemory(
        req,
        decodeURIComponent(memoryMatch[1]!),
        memoryMatch[2]!,
      );
    }

    const userMatch = path.match(/^\/users\/([^/]+)$/);
    if (userMatch) {
      const id = decodeURIComponent(userMatch[1]!);
      if (req.method === "GET") return handleGetUser(id);
      if (req.method === "PATCH") return handleUpdateUser(req, id);
      if (req.method === "DELETE") return handleDeleteUser(req, id);
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`gbrain-sandbox API listening on http://localhost:${server.port}`);
console.log(
  "User CRUD: GET/POST /users, GET/PATCH/DELETE /users/:id, GET /users/:id/data, DELETE /users/:id/memories/:memoryId",
);
console.log(
  "Sessions: GET/POST /sessions, PATCH /sessions/:id; ask mode accepts body.sessionId",
);
console.log(
  "Admin: POST /admin/nuke { target: app }; GET/PUT/DELETE /admin/gbrain-auth; POST /admin/gbrain-auth/test",
);
export default server;

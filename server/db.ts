import postgres from "postgres";
import { appDatabaseUrl, DEMO_API_KEYS } from "./config.ts";

export type AppUser = {
	id: string;
	api_key: string;
};

export type AppMessage = {
	id: number;
	session_id: string;
	role: "user" | "assistant";
	content: string;
	created_at: Date;
};

export type AppMemory = {
	id: number;
	user_id: string;
	slug: string;
	content: string;
	created_at: Date;
};

export type GbrainAuth = {
	oauth_client_id: string;
	oauth_client_secret: string;
};

let sql: ReturnType<typeof postgres> | null = null;

export function db(): ReturnType<typeof postgres> {
	if (!sql) {
		const url = appDatabaseUrl();
		if (!url)
			throw new Error("Missing APP_DATABASE_URL or GBRAIN_DATABASE_URL");
		sql = postgres(url, { max: 10 });
	}
	return sql;
}

export async function closeDb(): Promise<void> {
	if (sql) {
		await sql.end({ timeout: 5 });
		sql = null;
	}
}

export async function migrate(): Promise<void> {
	const s = db();
	await s`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

	await s`
    CREATE TABLE IF NOT EXISTS app_gbrain_auth (
      id TEXT PRIMARY KEY DEFAULT 'default',
      oauth_client_id TEXT NOT NULL,
      oauth_client_secret TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
	await s`
    CREATE TABLE IF NOT EXISTS app_memories (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, slug)
    )
  `;
	await s`CREATE INDEX IF NOT EXISTS app_memories_user_id_idx ON app_memories (user_id, created_at DESC)`;
	await s`
    CREATE INDEX IF NOT EXISTS app_memories_fts_idx
    ON app_memories
    USING gin (to_tsvector('english', content))
  `;
	await s`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
	await s`
    CREATE TABLE IF NOT EXISTS app_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES app_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
	await s`CREATE INDEX IF NOT EXISTS app_messages_session_id_idx ON app_messages (session_id, created_at)`;
}

export async function upsertUser(user: AppUser): Promise<void> {
	await db()`
    INSERT INTO app_users (id, api_key)
    VALUES (${user.id}, ${user.api_key})
    ON CONFLICT (id) DO UPDATE SET api_key = EXCLUDED.api_key
  `;
}

export async function upsertGbrainAuth(auth: GbrainAuth): Promise<void> {
	await db()`
    INSERT INTO app_gbrain_auth (id, oauth_client_id, oauth_client_secret, updated_at)
    VALUES ('default', ${auth.oauth_client_id}, ${auth.oauth_client_secret}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      oauth_client_id = EXCLUDED.oauth_client_id,
      oauth_client_secret = EXCLUDED.oauth_client_secret,
      updated_at = NOW()
  `;
}

export async function getGbrainAuth(): Promise<GbrainAuth | null> {
	const rows = await db()`
    SELECT oauth_client_id, oauth_client_secret
    FROM app_gbrain_auth
    WHERE id = 'default'
    LIMIT 1
  `;
	if (rows.length === 0) return null;
	const row = rows[0]!;
	return {
		oauth_client_id: row.oauth_client_id as string,
		oauth_client_secret: row.oauth_client_secret as string,
	};
}

export async function getUserByApiKey(apiKey: string): Promise<AppUser | null> {
	const rows = await db()`
    SELECT id, api_key FROM app_users WHERE api_key = ${apiKey} LIMIT 1
  `;
	if (rows.length === 0) return null;
	const row = rows[0]!;
	return { id: row.id as string, api_key: row.api_key as string };
}

export async function getOrCreateSession(userId: string): Promise<string> {
	const s = db();
	const existing = await s`
    SELECT id FROM app_sessions WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1
  `;
	if (existing.length > 0) return existing[0]!.id as string;

	const newId = crypto.randomUUID();
	await s`INSERT INTO app_sessions (id, user_id) VALUES (${newId}::uuid, ${userId})`;
	return newId;
}

export async function touchSession(sessionId: string): Promise<void> {
	await db()`UPDATE app_sessions SET updated_at = NOW() WHERE id = ${sessionId}::uuid`;
}

export async function listRecentMessages(
	sessionId: string,
	limit = 12,
): Promise<AppMessage[]> {
	const rows = await db()`
    SELECT id, session_id, role, content, created_at
    FROM app_messages
    WHERE session_id = ${sessionId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
	return rows
		.map((row) => ({
			id: Number(row.id),
			session_id: row.session_id as string,
			role: row.role as "user" | "assistant",
			content: row.content as string,
			created_at: row.created_at as Date,
		}))
		.reverse();
}

export async function insertMessage(
	sessionId: string,
	role: "user" | "assistant",
	content: string,
): Promise<void> {
	await db()`
    INSERT INTO app_messages (session_id, role, content)
    VALUES (${sessionId}::uuid, ${role}, ${content})
  `;
	await touchSession(sessionId);
}

export async function insertMemory(
	userId: string,
	slug: string,
	content: string,
): Promise<AppMemory> {
	const rows = await db()`
    INSERT INTO app_memories (user_id, slug, content)
    VALUES (${userId}, ${slug}, ${content})
    ON CONFLICT (user_id, slug) DO UPDATE SET content = EXCLUDED.content
    RETURNING id, user_id, slug, content, created_at
  `;
	const row = rows[0];
	if (!row) throw new Error("insertMemory returned no row");
	return {
		id: Number(row.id),
		user_id: row.user_id as string,
		slug: row.slug as string,
		content: row.content as string,
		created_at: row.created_at as Date,
	};
}

/** Retrieve memories for one user only (hard `user_id` filter). */
export async function searchMemoriesByUser(
	userId: string,
	query: string,
	limit = 8,
): Promise<AppMemory[]> {
	const q = query.trim();
	if (q) {
		const matched = await db()`
      SELECT id, user_id, slug, content, created_at
      FROM app_memories
      WHERE user_id = ${userId}
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ${q})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
		if (matched.length > 0) {
			return matched.map((row) => ({
				id: Number(row.id),
				user_id: row.user_id as string,
				slug: row.slug as string,
				content: row.content as string,
				created_at: row.created_at as Date,
			}));
		}
	}

	const recent = await db()`
    SELECT id, user_id, slug, content, created_at
    FROM app_memories
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
	return recent.map((row) => ({
		id: Number(row.id),
		user_id: row.user_id as string,
		slug: row.slug as string,
		content: row.content as string,
		created_at: row.created_at as Date,
	}));
}

export async function seedDemoUsersIfEmpty(): Promise<void> {
	const count = await db()`SELECT COUNT(*)::int AS n FROM app_users`;
	if ((count[0]?.n as number) > 0) return;

	for (const [id, apiKey] of Object.entries(DEMO_API_KEYS)) {
		await upsertUser({ id, api_key: apiKey });
	}
}

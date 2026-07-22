import { chatModel, mcpUrl, oauthTokenUrl } from "./config.ts";
import { type GbrainAuth, getGbrainAuth } from "./db.ts";

const MCP_PROTOCOL = "2024-11-05";
let tokenCache: {
  accessToken: string;
  expiresAt: number;
  clientId: string;
} | null = null;

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function parseSseOrJson(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Empty MCP response");
  if (trimmed.startsWith("event:") || trimmed.includes("\ndata: ")) {
    const dataLines = trimmed
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));
    const last = dataLines[dataLines.length - 1];
    if (!last) throw new Error("MCP SSE response had no data payload");
    return JSON.parse(last) as JsonRpcResponse;
  }
  return JSON.parse(trimmed) as JsonRpcResponse;
}

export function clearGbrainTokenCache(): void {
  tokenCache = null;
}

async function resolveAuth(): Promise<GbrainAuth> {
  const auth = await getGbrainAuth();
  if (!auth) {
    throw new Error(
      "Shared gbrain OAuth not configured. Register a client (apps/gbrain) and save credentials on /gbrain-connection.",
    );
  }
  return auth;
}

/** Exchange client credentials for an access token (does not use the in-memory cache). */
export async function testGbrainOAuthCredentials(
  auth: GbrainAuth,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fetchOAuthToken(auth, { forceRefresh: true, skipCacheStore: true });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchOAuthToken(
  auth: GbrainAuth,
  opts?: { forceRefresh?: boolean; skipCacheStore?: boolean },
): Promise<string> {
  if (
    !opts?.forceRefresh &&
    !opts?.skipCacheStore &&
    tokenCache &&
    tokenCache.clientId === auth.oauth_client_id &&
    tokenCache.expiresAt > Date.now() + 30_000
  ) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: auth.oauth_client_id,
    client_secret: auth.oauth_client_secret,
    // query / search / get_page are read-scoped; think-mode synthesis runs in Bun.
    scope: "read",
  });

  const res = await fetch(oauthTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth token failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token)
    throw new Error("OAuth response missing access_token");

  if (!opts?.skipCacheStore) {
    const expiresIn =
      typeof json.expires_in === "number" ? json.expires_in : 3600;
    tokenCache = {
      accessToken: json.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
      clientId: auth.oauth_client_id,
    };
  }
  return json.access_token;
}

async function mcpRequest(
  auth: GbrainAuth,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
): Promise<unknown> {
  const accessToken = await fetchOAuthToken(auth);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${accessToken}`,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(mcpUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${text}`);

  const payload = parseSseOrJson(text);
  if (payload.error) {
    throw new Error(`MCP error: ${payload.error.message}`);
  }
  return payload.result;
}

async function openMcpSession(auth: GbrainAuth): Promise<string | undefined> {
  let accessToken = await fetchOAuthToken(auth);
  let res = await fetch(mcpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL,
        capabilities: {},
        clientInfo: { name: "gbrain-sandbox-bun", version: "2.0.0" },
      },
    }),
  });

  // After rotating OAuth credentials in app_gbrain_auth, drop a stale
  // in-memory token so /token is called again.
  if (res.status === 401) {
    accessToken = await fetchOAuthToken(auth, { forceRefresh: true });
    res = await fetch(mcpUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL,
          capabilities: {},
          clientInfo: { name: "gbrain-sandbox-bun", version: "2.0.0" },
        },
      }),
    });
  }

  const sessionId =
    res.headers.get("mcp-session-id") ??
    res.headers.get("Mcp-Session-Id") ??
    undefined;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP initialize failed (${res.status}): ${text}`);
  }
  if (sessionId) {
    await mcpRequest(auth, "notifications/initialized", {}, sessionId);
  }
  return sessionId;
}

function extractToolText(
  result: unknown,
  opts?: { preferAnswer?: boolean },
): string {
  return extractToolPayload(result, opts).text;
}

function extractToolPayload(
  result: unknown,
  opts?: { preferAnswer?: boolean },
): { text: string; parsed: unknown | null } {
  if (!result || typeof result !== "object") {
    const text = JSON.stringify(result);
    return { text, parsed: null };
  }
  const r = result as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
  };
  if (Array.isArray(r.content)) {
    const parts = r.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);
    if (parts.length > 0) {
      const joined = parts.join("\n");
      if (opts?.preferAnswer) {
        try {
          const parsed = JSON.parse(joined) as { answer?: string };
          if (typeof parsed.answer === "string" && parsed.answer.trim()) {
            return { text: parsed.answer.trim(), parsed };
          }
        } catch {
          // not JSON — return raw text
        }
      }
      try {
        const parsed = JSON.parse(joined) as unknown;
        return { text: JSON.stringify(parsed, null, 2), parsed };
      } catch {
        return { text: joined, parsed: null };
      }
    }
  }
  if (r.structuredContent !== undefined) {
    const text = JSON.stringify(r.structuredContent, null, 2);
    return { text, parsed: r.structuredContent };
  }
  const text = JSON.stringify(result, null, 2);
  return { text, parsed: null };
}

async function callGbrainTool(
  name: string,
  arguments_: Record<string, unknown>,
): Promise<unknown> {
  const auth = await resolveAuth();
  const sessionId = await openMcpSession(auth);
  return mcpRequest(
    auth,
    "tools/call",
    { name, arguments: arguments_ },
    sessionId,
  );
}

export type GbrainPage = {
  slug: string;
  title?: string;
  compiled_truth: string;
};

/** Hybrid retrieval hits as parsed JSON (array of chunk rows). */
export async function gbrainQueryHits(query: string): Promise<unknown> {
  const result = await callGbrainTool("query", { query });
  const { parsed } = extractToolPayload(result);
  return parsed ?? [];
}

/** Full page body for a slug (avoids think's 600-char gather clips). */
export async function gbrainGetPage(slug: string): Promise<GbrainPage> {
  const result = await callGbrainTool("get_page", { slug });
  const { parsed } = extractToolPayload(result);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`get_page returned unexpected payload for slug ${slug}`);
  }
  const page = parsed as Record<string, unknown>;
  const compiled =
    typeof page.compiled_truth === "string"
      ? page.compiled_truth
      : typeof page.compiledTruth === "string"
        ? page.compiledTruth
        : "";
  const resolvedSlug = typeof page.slug === "string" ? page.slug : slug;
  if (!compiled.trim()) {
    throw new Error(
      `get_page returned empty compiled_truth for slug ${resolvedSlug}`,
    );
  }
  return {
    slug: resolvedSlug,
    title: typeof page.title === "string" ? page.title : undefined,
    compiled_truth: compiled,
  };
}

/** Keyword retrieval (BM25 / tsvector). No LLM. */
export async function gbrainSearch(query: string): Promise<string> {
  const result = await callGbrainTool("search", { query });
  return extractToolText(result);
}

/** Hybrid retrieval (vector + keyword). No LLM. */
export async function gbrainQuery(query: string): Promise<string> {
  const result = await callGbrainTool("query", { query });
  return extractToolText(result);
}

/** Legacy gbrain think (600-char page clips). Prefer answerWithHydratedPages. */
export async function gbrainThink(question: string): Promise<string> {
  const model = chatModel();
  const arguments_: Record<string, string> = { question };
  if (model) arguments_.model = model;
  const result = await callGbrainTool("think", arguments_);
  return extractToolText(result, { preferAnswer: true });
}

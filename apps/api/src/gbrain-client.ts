import { chatModel, mcpUrl, oauthTokenUrl } from './config.ts';
import { getGbrainAuth, type GbrainAuth } from './db.ts';

const MCP_PROTOCOL = '2024-11-05';
let tokenCache: { accessToken: string; expiresAt: number } | null = null;

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function parseSseOrJson(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Empty MCP response');
  if (trimmed.startsWith('event:') || trimmed.includes('\ndata: ')) {
    const dataLines = trimmed
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6));
    const last = dataLines[dataLines.length - 1];
    if (!last) throw new Error('MCP SSE response had no data payload');
    return JSON.parse(last) as JsonRpcResponse;
  }
  return JSON.parse(trimmed) as JsonRpcResponse;
}

async function resolveAuth(): Promise<GbrainAuth> {
  const auth = await getGbrainAuth();
  if (!auth) {
    throw new Error('Shared gbrain OAuth not configured. Run: bun run setup:gbrain');
  }
  return auth;
}

async function fetchOAuthToken(auth: GbrainAuth): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.accessToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.oauth_client_id,
    client_secret: auth.oauth_client_secret,
    // `think` is gated as write by gbrain (read covers search/query/get_page only).
    scope: 'read write',
  });

  const res = await fetch(oauthTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth token failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('OAuth response missing access_token');

  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
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
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${accessToken}`,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(mcpUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
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
  const accessToken = await fetchOAuthToken(auth);
  const res = await fetch(mcpUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'gbrain-sandbox-bun', version: '2.0.0' },
      },
    }),
  });
  const sessionId = res.headers.get('mcp-session-id') ?? res.headers.get('Mcp-Session-Id') ?? undefined;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP initialize failed (${res.status}): ${text}`);
  }
  if (sessionId) {
    await mcpRequest(auth, 'notifications/initialized', {}, sessionId);
  }
  return sessionId;
}

function extractToolText(result: unknown): string {
  if (!result || typeof result !== 'object') return JSON.stringify(result);
  const r = result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown };
  if (Array.isArray(r.content)) {
    const parts = r.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string);
    if (parts.length > 0) {
      const joined = parts.join('\n');
      try {
        const parsed = JSON.parse(joined) as { answer?: string };
        if (typeof parsed.answer === 'string' && parsed.answer.trim()) return parsed.answer.trim();
      } catch {
        // not JSON — return raw text
      }
      return joined;
    }
  }
  if (r.structuredContent !== undefined) return JSON.stringify(r.structuredContent, null, 2);
  return JSON.stringify(result, null, 2);
}

/** Call gbrain `think` against the shared corpus via the app OAuth client. */
export async function gbrainThink(question: string): Promise<string> {
  const auth = await resolveAuth();
  const sessionId = await openMcpSession(auth);
  const model = chatModel();
  const arguments_: Record<string, string> = { question };
  if (model) arguments_.model = model;
  const result = await mcpRequest(
    auth,
    'tools/call',
    {
      name: 'think',
      arguments: arguments_,
    },
    sessionId,
  );
  return extractToolText(result);
}

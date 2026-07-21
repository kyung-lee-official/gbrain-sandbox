const DEFAULT_API_URL = "http://localhost:3000";

export function apiBaseUrl(): string {
  return (process.env.API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
}

export type AskMode = "think" | "query" | "search";

export type ApiUser = {
  id: string;
  apiKey: string;
  createdAt?: string | null;
};

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export async function getHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBaseUrl()}/health`, { cache: "no-store" });
    const data = (await parseJson(res)) as { ok?: boolean; error?: string } | null;
    if (!res.ok) {
      return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
    }
    return { ok: data?.ok === true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function fetchUsers(): Promise<{
  users?: ApiUser[];
  error?: string;
}> {
  try {
    const res = await fetch(`${apiBaseUrl()}/users`, { cache: "no-store" });
    const data = (await parseJson(res)) as {
      users?: ApiUser[];
      error?: string;
    } | null;
    if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
    return { users: data?.users ?? [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export async function createUserApi(
  actorApiKey: string | null,
  id: string,
  apiKey?: string,
): Promise<{ user?: ApiUser; error?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (actorApiKey) headers.Authorization = `Bearer ${actorApiKey}`;
  const body: { id: string; apiKey?: string } = { id };
  if (apiKey) body.apiKey = apiKey;
  const res = await fetch(`${apiBaseUrl()}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await parseJson(res)) as (ApiUser & { error?: string }) | null;
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  if (!data?.id || !data.apiKey) return { error: "Empty response" };
  return { user: { id: data.id, apiKey: data.apiKey, createdAt: data.createdAt } };
}

export async function updateUserApi(
  actorApiKey: string,
  id: string,
  apiKey?: string,
): Promise<{ user?: ApiUser; error?: string }> {
  const body: { apiKey?: string } = {};
  if (apiKey) body.apiKey = apiKey;
  const res = await fetch(`${apiBaseUrl()}/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${actorApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await parseJson(res)) as (ApiUser & { error?: string }) | null;
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  if (!data?.id || !data.apiKey) return { error: "Empty response" };
  return { user: { id: data.id, apiKey: data.apiKey, createdAt: data.createdAt } };
}

export async function deleteUserApi(
  actorApiKey: string,
  id: string,
): Promise<{ deleted?: boolean; error?: string }> {
  const res = await fetch(`${apiBaseUrl()}/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${actorApiKey}` },
    cache: "no-store",
  });
  const data = (await parseJson(res)) as {
    deleted?: boolean;
    error?: string;
  } | null;
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  return { deleted: data?.deleted === true };
}

export async function postQuery(
  apiKey: string,
  message: string,
  mode: AskMode = "think",
): Promise<{
  userId?: string;
  sessionId?: string;
  mode?: AskMode;
  answer?: string;
  error?: string;
}> {
  const res = await fetch(`${apiBaseUrl()}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, mode }),
    cache: "no-store",
  });
  const data = (await parseJson(res)) as {
    userId?: string;
    sessionId?: string;
    mode?: AskMode;
    answer?: string;
    error?: string;
  } | null;
  if (!res.ok) {
    return { error: data?.error ?? `HTTP ${res.status}` };
  }
  return data ?? { error: "Empty response" };
}

export async function postRemember(
  apiKey: string,
  content: string,
): Promise<{ userId?: string; slug?: string; saved?: boolean; error?: string }> {
  const res = await fetch(`${apiBaseUrl()}/remember`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
    cache: "no-store",
  });
  const data = (await parseJson(res)) as {
    userId?: string;
    slug?: string;
    saved?: boolean;
    error?: string;
  } | null;
  if (!res.ok) {
    return { error: data?.error ?? `HTTP ${res.status}` };
  }
  return data ?? { error: "Empty response" };
}

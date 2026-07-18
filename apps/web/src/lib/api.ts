const DEFAULT_API_URL = "http://localhost:3000";

export function apiBaseUrl(): string {
  return (process.env.API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
}

export type DemoUser = "lily" | "bob";

export const DEMO_API_KEYS: Record<DemoUser, string> = {
  lily: "demo-key-lily",
  bob: "demo-key-bob",
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

export type AskMode = "think" | "query" | "search";

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

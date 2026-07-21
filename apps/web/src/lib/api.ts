import { apiFetch } from "./api-client";

export { ApiError, apiBaseUrl } from "./api-client";

export type AskMode = "think" | "query" | "search";

export type ApiUser = {
  id: string;
  apiKey: string;
  createdAt?: string | null;
};

export type QueryResult = {
  userId?: string;
  sessionId?: string;
  mode?: AskMode;
  answer?: string;
};

export type RememberResult = {
  userId?: string;
  slug?: string;
  saved?: boolean;
};

export type UserMemoryRow = {
  id: number;
  slug: string;
  content: string;
  createdAt: string | null;
};

export type UserSessionRow = {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UserMessageRow = {
  id: number;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string | null;
};

export type UserDataDump = {
  user: ApiUser;
  memories: UserMemoryRow[];
  sessions: UserSessionRow[];
  messages: UserMessageRow[];
};

export const UserQueryKey = {
  List: ["users"] as const,
  Health: ["health"] as const,
  Data: (id: string) => ["users", id, "data"] as const,
} as const;

export async function getHealth(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/health");
}

export async function listUsers(): Promise<ApiUser[]> {
  const data = await apiFetch<{ users: ApiUser[] }>("/users");
  return data.users ?? [];
}

export async function createUser(input: {
  id: string;
  apiKey?: string;
  actorApiKey: string | null;
}): Promise<ApiUser> {
  return apiFetch<ApiUser>("/users", {
    method: "POST",
    apiKey: input.actorApiKey ?? undefined,
    body: JSON.stringify({
      id: input.id,
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    }),
  });
}

export async function regenerateUserKey(input: {
  id: string;
  actorApiKey: string;
}): Promise<ApiUser> {
  return apiFetch<ApiUser>(`/users/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    apiKey: input.actorApiKey,
    body: JSON.stringify({}),
  });
}

export async function deleteUser(input: {
  id: string;
  actorApiKey: string;
}): Promise<{ deleted: boolean; id: string }> {
  return apiFetch<{ deleted: boolean; id: string }>(
    `/users/${encodeURIComponent(input.id)}`,
    {
      method: "DELETE",
      apiKey: input.actorApiKey,
    },
  );
}

export async function getUserData(input: {
  id: string;
  apiKey: string;
}): Promise<UserDataDump> {
  return apiFetch<UserDataDump>(`/users/${encodeURIComponent(input.id)}/data`, {
    apiKey: input.apiKey,
  });
}

export async function postQuery(input: {
  apiKey: string;
  message: string;
  mode: AskMode;
}): Promise<QueryResult> {
  return apiFetch<QueryResult>("/query", {
    method: "POST",
    apiKey: input.apiKey,
    body: JSON.stringify({ message: input.message, mode: input.mode }),
  });
}

export async function postRemember(input: {
  apiKey: string;
  content: string;
}): Promise<RememberResult> {
  return apiFetch<RememberResult>("/remember", {
    method: "POST",
    apiKey: input.apiKey,
    body: JSON.stringify({ content: input.content }),
  });
}

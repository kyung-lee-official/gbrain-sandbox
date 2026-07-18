"use server";

import {
  DEMO_API_KEYS,
  type AskMode,
  type DemoUser,
  getHealth,
  postQuery,
  postRemember,
} from "@/lib/api";

function apiKeyForUser(user: string): string | null {
  if (user !== "lily" && user !== "bob") return null;
  return DEMO_API_KEYS[user as DemoUser];
}

function parseAskMode(raw: string): AskMode | null {
  if (raw === "think" || raw === "query" || raw === "search") return raw;
  return null;
}

export async function checkApiHealth() {
  return getHealth();
}

export async function submitQuery(formData: FormData) {
  const user = String(formData.get("user") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const mode = parseAskMode(String(formData.get("mode") ?? "think"));
  const apiKey = apiKeyForUser(user);
  if (!apiKey) return { error: "Pick Lily or Bob." };
  if (!message) return { error: "message is required" };
  if (!mode) return { error: "mode must be think, query, or search" };
  return postQuery(apiKey, message, mode);
}

export async function submitRemember(formData: FormData) {
  const user = String(formData.get("user") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  const apiKey = apiKeyForUser(user);
  if (!apiKey) return { error: "Pick Lily or Bob." };
  if (!content) return { error: "content is required" };
  return postRemember(apiKey, content);
}

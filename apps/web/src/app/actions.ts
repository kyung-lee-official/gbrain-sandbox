"use server";

import {
  DEMO_API_KEYS,
  type DemoUser,
  getHealth,
  postQuery,
  postRemember,
} from "@/lib/api";

function apiKeyForUser(user: string): string | null {
  if (user !== "lily" && user !== "bob") return null;
  return DEMO_API_KEYS[user as DemoUser];
}

export async function checkApiHealth() {
  return getHealth();
}

export async function submitQuery(formData: FormData) {
  const user = String(formData.get("user") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const apiKey = apiKeyForUser(user);
  if (!apiKey) return { error: "Pick Lily or Bob." };
  if (!message) return { error: "message is required" };
  return postQuery(apiKey, message);
}

export async function submitRemember(formData: FormData) {
  const user = String(formData.get("user") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  const apiKey = apiKeyForUser(user);
  if (!apiKey) return { error: "Pick Lily or Bob." };
  if (!content) return { error: "content is required" };
  return postRemember(apiKey, content);
}

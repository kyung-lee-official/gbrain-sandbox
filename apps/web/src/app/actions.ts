"use server";

import {
  createUserApi,
  deleteUserApi,
  fetchUsers,
  getHealth,
  postQuery,
  postRemember,
  updateUserApi,
  type AskMode,
} from "@/lib/api";

function parseAskMode(raw: string): AskMode | null {
  if (raw === "think" || raw === "query" || raw === "search") return raw;
  return null;
}

export async function checkApiHealth() {
  return getHealth();
}

export async function loadUsers() {
  return fetchUsers();
}

export async function submitQuery(formData: FormData) {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const mode = parseAskMode(String(formData.get("mode") ?? "think"));
  if (!apiKey) return { error: "Select a signed-in user." };
  if (!message) return { error: "message is required" };
  if (!mode) return { error: "mode must be think, query, or search" };
  return postQuery(apiKey, message, mode);
}

export async function submitRemember(formData: FormData) {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!apiKey) return { error: "Select a signed-in user." };
  if (!content) return { error: "content is required" };
  return postRemember(apiKey, content);
}

export async function submitCreateUser(formData: FormData) {
  const actorApiKey = String(formData.get("actorApiKey") ?? "").trim() || null;
  const id = String(formData.get("id") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim() || undefined;
  if (!id) return { error: "id is required" };
  return createUserApi(actorApiKey, id, apiKey);
}

export async function submitRegenerateKey(formData: FormData) {
  const actorApiKey = String(formData.get("actorApiKey") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  if (!actorApiKey) return { error: "Sign in as a user to regenerate keys." };
  if (!id) return { error: "id is required" };
  return updateUserApi(actorApiKey, id);
}

export async function submitDeleteUser(formData: FormData) {
  const actorApiKey = String(formData.get("actorApiKey") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();
  if (!actorApiKey) return { error: "Sign in as a user to delete." };
  if (!id) return { error: "id is required" };
  return deleteUserApi(actorApiKey, id);
}

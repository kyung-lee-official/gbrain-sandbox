"use client";

import { useEffect, useState, useTransition } from "react";
import type { ApiUser, AskMode } from "@/lib/api";
import { submitQuery, submitRemember } from "./actions";
import { ResponseView, type ApiPayload } from "./response-view";
import { UserSidebar } from "./user-sidebar";

const MODE_HELP: Record<AskMode, string> = {
  think:
    "query + get_page — full shared pages, DeepSeek synthesis (chat + personal memory)",
  query: "gbrain query — hybrid retrieval (vector + keyword), no LLM",
  search: "gbrain search — keyword / BM25 retrieval, no LLM",
};

export function DemoPanel() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [active, setActive] = useState<ApiUser | null>(null);
  const [mode, setMode] = useState<AskMode>("think");
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (active) return;
    if (users.length === 0) return;
    const lily = users.find((u) => u.id === "lily");
    setActive(lily ?? users[0] ?? null);
  }, [users, active]);

  function onSelectUser(user: ApiUser) {
    if (!user.id) {
      setActive(null);
      return;
    }
    setActive(user);
    setPayload(null);
  }

  function onRemember(formData: FormData) {
    if (!active) return;
    formData.set("apiKey", active.apiKey);
    startTransition(async () => {
      setPayload(null);
      const res = await submitRemember(formData);
      setPayload(res);
    });
  }

  function onQuery(formData: FormData) {
    if (!active) return;
    formData.set("apiKey", active.apiKey);
    formData.set("mode", mode);
    startTransition(async () => {
      setPayload(null);
      const res = await submitQuery(formData);
      setPayload(res);
    });
  }

  return (
    <div className="app-shell">
      <UserSidebar
        activeUserId={active?.id ?? null}
        onSelectUser={onSelectUser}
        onUsersChange={setUsers}
      />
      <div className="panel">
        <p className="signed-in">
          Signed in as{" "}
          <strong>
            {active ? active.id : "nobody — pick a user in the sidebar"}
          </strong>
        </p>

        <form action={onRemember} className="card">
          <h2>Remember</h2>
          <p>POST /remember — personal note in app Postgres</p>
          <textarea
            name="content"
            rows={3}
            placeholder="My favorite coffee is oat latte."
            required
            disabled={pending || !active}
          />
          <button type="submit" disabled={pending || !active}>
            Save note
          </button>
        </form>

        <form action={onQuery} className="card">
          <h2>Ask</h2>
          <p>POST /query — {MODE_HELP[mode]}</p>
          <label className="field">
            <span>Mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as AskMode)}
              disabled={pending || !active}
            >
              <option value="think">think</option>
              <option value="query">query</option>
              <option value="search">search</option>
            </select>
          </label>
          <textarea
            name="message"
            rows={3}
            placeholder="What is the sandbox verification protocol codename?"
            required
            disabled={pending || !active}
          />
          <button type="submit" disabled={pending || !active}>
            Ask
          </button>
        </form>

        <ResponseView pending={pending} payload={payload} />
      </div>
    </div>
  );
}

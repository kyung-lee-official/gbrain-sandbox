"use client";

import { useState, useTransition } from "react";
import type { AskMode } from "@/lib/api";
import { submitQuery, submitRemember } from "./actions";
import { ResponseView, type ApiPayload } from "./response-view";

type DemoUser = "lily" | "bob";

const MODE_HELP: Record<AskMode, string> = {
  think: "query + get_page — full shared pages, DeepSeek synthesis (chat + personal memory)",
  query: "gbrain query — hybrid retrieval (vector + keyword), no LLM",
  search: "gbrain search — keyword / BM25 retrieval, no LLM",
};

export function DemoPanel() {
  const [user, setUser] = useState<DemoUser>("lily");
  const [mode, setMode] = useState<AskMode>("think");
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [pending, startTransition] = useTransition();

  function onRemember(formData: FormData) {
    formData.set("user", user);
    startTransition(async () => {
      setPayload(null);
      const res = await submitRemember(formData);
      setPayload(res);
    });
  }

  function onQuery(formData: FormData) {
    formData.set("user", user);
    formData.set("mode", mode);
    startTransition(async () => {
      setPayload(null);
      const res = await submitQuery(formData);
      setPayload(res);
    });
  }

  return (
    <div className="panel">
      <label className="field">
        <span>Demo user</span>
        <select
          value={user}
          onChange={(e) => setUser(e.target.value as DemoUser)}
          disabled={pending}
        >
          <option value="lily">Lily (demo-key-lily)</option>
          <option value="bob">Bob (demo-key-bob)</option>
        </select>
      </label>

      <form action={onRemember} className="card">
        <h2>Remember</h2>
        <p>POST /remember — personal note in app Postgres</p>
        <textarea
          name="content"
          rows={3}
          placeholder="My favorite coffee is oat latte."
          required
          disabled={pending}
        />
        <button type="submit" disabled={pending}>
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
            disabled={pending}
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
          disabled={pending}
        />
        <button type="submit" disabled={pending}>
          Ask
        </button>
      </form>

      <ResponseView pending={pending} payload={payload} />
    </div>
  );
}

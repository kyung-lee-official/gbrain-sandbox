"use client";

import { useState, useTransition } from "react";
import { submitQuery, submitRemember } from "./actions";

type DemoUser = "lily" | "bob";

export function DemoPanel() {
  const [user, setUser] = useState<DemoUser>("lily");
  const [result, setResult] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function onRemember(formData: FormData) {
    formData.set("user", user);
    startTransition(async () => {
      setResult("");
      const res = await submitRemember(formData);
      setResult(JSON.stringify(res, null, 2));
    });
  }

  function onQuery(formData: FormData) {
    formData.set("user", user);
    startTransition(async () => {
      setResult("");
      const res = await submitQuery(formData);
      setResult(JSON.stringify(res, null, 2));
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
        <h2>Query</h2>
        <p>POST /query — shared gbrain + personal memory</p>
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

      <section className="card">
        <h2>Response</h2>
        <pre>{pending ? "Calling Bun API…" : result || "—"}</pre>
      </section>
    </div>
  );
}

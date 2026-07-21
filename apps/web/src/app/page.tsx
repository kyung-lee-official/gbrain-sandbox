import { apiBaseUrl } from "@/lib/api";
import { DemoPanel } from "./demo-panel";

export default function Home() {
  const apiUrl = apiBaseUrl();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 pb-12">
      <header className="mb-2">
        <h1 className="mb-1 font-display text-3xl text-ink">gbrain-sandbox</h1>
        <p className="my-1 text-sm text-muted">
          Next.js UI talking to Bun API at <code className="font-mono text-sm">{apiUrl}</code>
        </p>
        <p className="my-1 text-sm text-muted">
          Users live in Postgres <code className="font-mono text-sm">app_users</code>. Use the
          sidebar to sign in and manage accounts.
        </p>
      </header>
      <DemoPanel />
    </main>
  );
}

import { apiBaseUrl } from "@/lib/api";
import { checkApiHealth } from "./actions";
import { DemoPanel } from "./demo-panel";

export default async function Home() {
  const health = await checkApiHealth();
  const apiUrl = apiBaseUrl();

  return (
    <main className="page">
      <header>
        <h1>gbrain-sandbox</h1>
        <p>
          Next.js UI talking to Bun API at <code>{apiUrl}</code>
        </p>
        <p className={health.ok ? "ok" : "err"}>
          {health.ok
            ? "API health: ok"
            : `API health: down${health.error ? ` (${health.error})` : ""}`}
        </p>
      </header>
      <DemoPanel />
    </main>
  );
}

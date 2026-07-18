import type { AskMode } from "@/lib/api";

export type ApiPayload = {
  userId?: string;
  sessionId?: string;
  mode?: AskMode;
  answer?: string;
  slug?: string;
  saved?: boolean;
  error?: string;
};

type RetrievalHit = {
  slug?: string;
  title?: string;
  score?: number;
  evidence?: string;
  source_id?: string;
  chunk_text?: string;
  type?: string;
};

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function normalizeChunkText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function formatScore(score: number | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return score.toFixed(4);
}

function isRetrievalHitArray(value: unknown): value is RetrievalHit[] {
  return (
    Array.isArray(value) &&
    value.every((item) => item !== null && typeof item === "object")
  );
}

function RetrievalHits({ hits }: { hits: RetrievalHit[] }) {
  if (hits.length === 0) {
    return <p className="readable-empty">No hits.</p>;
  }

  return (
    <ol className="hit-list">
      {hits.map((hit, index) => {
        const key = `${hit.slug ?? "hit"}-${index}`;
        const body = hit.chunk_text
          ? normalizeChunkText(hit.chunk_text)
          : null;
        return (
          <li key={key} className="hit">
            <div className="hit-header">
              <strong>{hit.title?.trim() || hit.slug || `Hit ${index + 1}`}</strong>
              {hit.slug ? <code className="hit-slug">{hit.slug}</code> : null}
            </div>
            <div className="hit-meta">
              <span>score {formatScore(hit.score)}</span>
              {hit.evidence ? <span>{hit.evidence}</span> : null}
              {hit.source_id ? <span>{hit.source_id}</span> : null}
              {hit.type ? <span>{hit.type}</span> : null}
            </div>
            {body ? <pre className="hit-body">{body}</pre> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ReadableAnswer({
  mode,
  answer,
}: {
  mode?: AskMode;
  answer: string;
}) {
  const parsed = tryParseJson(answer);

  if (
    (mode === "search" || mode === "query" || mode === undefined) &&
    isRetrievalHitArray(parsed)
  ) {
    return <RetrievalHits hits={parsed} />;
  }

  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as { answer?: string; gaps?: string[] };
    if (typeof obj.answer === "string" && obj.answer.trim()) {
      return (
        <div className="readable-prose">
          <p>{obj.answer.trim()}</p>
          {Array.isArray(obj.gaps) && obj.gaps.length > 0 ? (
            <div className="readable-gaps">
              <h3>Gaps</h3>
              <ul>
                {obj.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }
  }

  return <p className="readable-prose">{answer}</p>;
}

export function ResponseView({
  pending,
  payload,
}: {
  pending: boolean;
  payload: ApiPayload | null;
}) {
  if (pending) {
    return (
      <section className="card">
        <h2>Response</h2>
        <p className="readable-empty">Calling Bun API…</p>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="card">
        <h2>Response</h2>
        <p className="readable-empty">—</p>
      </section>
    );
  }

  const raw = JSON.stringify(payload, null, 2);

  return (
    <section className="card response-card">
      <h2>Response</h2>

      <div className="readable">
        {payload.error ? (
          <p className="err">{payload.error}</p>
        ) : payload.saved ? (
          <div className="readable-prose">
            <p>
              Saved note{payload.slug ? ` as ` : "."}
              {payload.slug ? <code>{payload.slug}</code> : null}
              {payload.userId ? ` for ${payload.userId}` : null}.
            </p>
          </div>
        ) : typeof payload.answer === "string" ? (
          <ReadableAnswer mode={payload.mode} answer={payload.answer} />
        ) : (
          <p className="readable-empty">No answer field.</p>
        )}
      </div>

      {(payload.userId || payload.mode || payload.sessionId) && !payload.error ? (
        <p className="response-meta">
          {[
            payload.userId ? `user ${payload.userId}` : null,
            payload.mode ? `mode ${payload.mode}` : null,
            payload.sessionId ? `session ${payload.sessionId}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      <div className="raw-block">
        <h3>Raw JSON</h3>
        <pre className="raw-json">{raw}</pre>
      </div>
    </section>
  );
}

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
    return <p className="m-0 text-sm text-muted">No hits.</p>;
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
      {hits.map((hit, index) => {
        const key = `${hit.slug ?? "hit"}-${index}`;
        const body = hit.chunk_text ? normalizeChunkText(hit.chunk_text) : null;
        return (
          <li
            key={key}
            className="flex flex-col gap-1.5 rounded border border-line bg-canvas p-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <strong>{hit.title?.trim() || hit.slug || `Hit ${index + 1}`}</strong>
              {hit.slug ? (
                <code className="font-mono text-sm">{hit.slug}</code>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted">
              <span>score {formatScore(hit.score)}</span>
              {hit.evidence ? <span>{hit.evidence}</span> : null}
              {hit.source_id ? <span>{hit.source_id}</span> : null}
              {hit.type ? <span>{hit.type}</span> : null}
            </div>
            {body ? (
              <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-surface p-2.5 font-display text-sm leading-snug">
                {body}
              </pre>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ReadableAnswer({ mode, answer }: { mode?: AskMode; answer: string }) {
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
        <div className="font-display text-base leading-snug text-ink">
          <p className="m-0">{obj.answer.trim()}</p>
          {Array.isArray(obj.gaps) && obj.gaps.length > 0 ? (
            <div>
              <h3 className="mb-1 mt-3 text-sm">Gaps</h3>
              <ul className="m-0 list-disc pl-5 text-sm text-muted">
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

  return <p className="m-0 font-display text-base leading-snug text-ink">{answer}</p>;
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
      <section className="flex flex-col gap-2.5 rounded-md border border-line bg-surface p-4">
        <h2 className="m-0 font-display text-lg text-ink">Response</h2>
        <p className="m-0 text-sm text-muted">Calling Bun API…</p>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="flex flex-col gap-2.5 rounded-md border border-line bg-surface p-4">
        <h2 className="m-0 font-display text-lg text-ink">Response</h2>
        <p className="m-0 text-sm text-muted">—</p>
      </section>
    );
  }

  const raw = JSON.stringify(payload, null, 2);

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-4">
      <h2 className="m-0 font-display text-lg text-ink">Response</h2>

      <div className="flex flex-col gap-3">
        {payload.error ? (
          <p className="m-0 text-danger">{payload.error}</p>
        ) : payload.saved ? (
          <div className="font-display text-base leading-snug text-ink">
            <p className="m-0">
              Saved note{payload.slug ? ` as ` : "."}
              {payload.slug ? <code className="font-mono text-sm">{payload.slug}</code> : null}
              {payload.userId ? ` for ${payload.userId}` : null}.
            </p>
          </div>
        ) : typeof payload.answer === "string" ? (
          <ReadableAnswer mode={payload.mode} answer={payload.answer} />
        ) : (
          <p className="m-0 text-sm text-muted">No answer field.</p>
        )}
      </div>

      {(payload.userId || payload.mode || payload.sessionId) && !payload.error ? (
        <p className="m-0 font-mono text-xs text-muted">
          {[
            payload.userId ? `user ${payload.userId}` : null,
            payload.mode ? `mode ${payload.mode}` : null,
            payload.sessionId ? `session ${payload.sessionId}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
        <h3 className="m-0 font-mono text-sm font-normal text-muted">Raw JSON</h3>
        <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas p-2.5 font-mono text-xs leading-snug">
          {raw}
        </pre>
      </div>
    </section>
  );
}

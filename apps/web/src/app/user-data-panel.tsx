"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError, type ApiUser, getUserData, UserQueryKey } from "@/lib/api";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function UserDataPanel({ active }: { active: ApiUser | null }) {
  const dataQuery = useQuery({
    queryKey: active
      ? UserQueryKey.Data(active.id)
      : (["users", "none", "data"] as const),
    queryFn: () => {
      if (!active) throw new Error("No user selected");
      return getUserData({ id: active.id, apiKey: active.apiKey });
    },
    enabled: Boolean(active),
  });

  const dump = dataQuery.data;
  const err = dataQuery.isError ? errorMessage(dataQuery.error) : null;

  return (
    <section className="flex flex-col gap-3.5 rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 font-display text-ink text-lg">User DB</h2>
        <button
          type="button"
          className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void dataQuery.refetch()}
          disabled={!active || dataQuery.isFetching}
        >
          Refresh
        </button>
      </div>
      <p className="m-0 text-muted text-sm">
        GET /users/:id/data — memories, sessions, and messages for{" "}
        <strong className="text-ink">{active?.id ?? "nobody"}</strong>
      </p>

      {!active ? (
        <p className="m-0 text-muted text-sm">
          Select a user to inspect their rows.
        </p>
      ) : dataQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading…</p>
      ) : err ? (
        <p className="m-0 text-danger text-sm">{err}</p>
      ) : dump ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 font-mono font-normal text-muted text-sm">
              Memories ({dump.memories.length})
            </h3>
            {dump.memories.length === 0 ? (
              <p className="m-0 text-muted text-sm">No rows in app_memories.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {dump.memories.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col gap-1 rounded border border-line bg-canvas p-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-muted text-xs">
                      <span>#{m.id}</span>
                      <code className="text-ink">{m.slug}</code>
                      <span>{formatWhen(m.createdAt)}</span>
                    </div>
                    <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words font-display text-ink text-sm leading-snug">
                      {m.content}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 font-mono font-normal text-muted text-sm">
              Sessions ({dump.sessions.length})
            </h3>
            {dump.sessions.length === 0 ? (
              <p className="m-0 text-muted text-sm">No rows in app_sessions.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {dump.sessions.map((s) => (
                  <li
                    key={s.id}
                    className="rounded border border-line bg-canvas px-2.5 py-2 font-mono text-muted text-xs"
                  >
                    <code className="break-all text-ink">{s.id}</code>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>created {formatWhen(s.createdAt)}</span>
                      <span>updated {formatWhen(s.updatedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 font-mono font-normal text-muted text-sm">
              Messages ({dump.messages.length})
            </h3>
            {dump.messages.length === 0 ? (
              <p className="m-0 text-muted text-sm">No rows in app_messages.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {dump.messages.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col gap-1 rounded border border-line bg-canvas p-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-muted text-xs">
                      <span>#{m.id}</span>
                      <span className="text-ink">{m.role}</span>
                      <code className="break-all">{m.sessionId}</code>
                      <span>{formatWhen(m.createdAt)}</span>
                    </div>
                    <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words font-display text-ink text-sm leading-snug">
                      {m.content}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

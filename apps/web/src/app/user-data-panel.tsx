"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, type ApiUser, getUserData, UserQueryKey } from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function UserDataPanel({ active }: { active: ApiUser | null }) {
  const [messagePage, setMessagePage] = useState(1);

  const dataQuery = useQuery({
    queryKey: active
      ? UserQueryKey.Data(active.id, messagePage)
      : (["users", "none", "data", messagePage] as const),
    queryFn: () => {
      if (!active) throw new Error("No user selected");
      return getUserData({
        id: active.id,
        apiKey: active.apiKey,
        messagePage,
      });
    },
    enabled: Boolean(active),
  });

  const dump = dataQuery.data;
  const err = dataQuery.isError ? errorMessage(dataQuery.error) : null;

  const messages = dump?.messages;
  const totalPages = messages
    ? Math.max(1, Math.ceil(messages.total / messages.pageSize))
    : 1;

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
        Messages for{" "}
        <strong className="text-ink">{active?.id ?? "nobody"}</strong>. Memories
        are managed in Settings.
      </p>

      {!active ? (
        <p className="m-0 text-muted text-sm">
          Select a user to inspect their rows.
        </p>
      ) : dataQuery.isLoading ? (
        <p className="m-0 text-muted text-sm">Loading…</p>
      ) : err && !dump ? (
        <p className="m-0 text-danger text-sm">{err}</p>
      ) : dump ? (
        <div className="flex flex-col gap-4">
          {err ? <p className="m-0 text-danger text-sm">{err}</p> : null}

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 font-mono font-normal text-muted text-sm">
                Messages ({messages?.total ?? 0})
                {messages && messages.total > 0 ? (
                  <span className="ml-2 font-normal">
                    · page {messages.page}/{totalPages} · newest first ·{" "}
                    {messages.pageSize}/page
                  </span>
                ) : null}
              </h3>
              {messages && messages.total > messages.pageSize ? (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={messagePage <= 1 || dataQuery.isFetching}
                    onClick={() => setMessagePage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={messagePage >= totalPages || dataQuery.isFetching}
                    onClick={() =>
                      setMessagePage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
            {!messages?.items?.length ? (
              <p className="m-0 text-muted text-sm">No rows in app_messages.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {messages.items.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col gap-1 rounded border border-line bg-canvas p-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-muted text-xs">
                      <span>#{m.id}</span>
                      <span className="text-ink">{m.role}</span>
                      <code className="break-all">{m.sessionId}</code>
                      <span>{formatDateTime(m.createdAt)}</span>
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

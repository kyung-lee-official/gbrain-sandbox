"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import { useActiveUserStore } from "@/lib/active-user-store";
import {
  ApiError,
  type ApiUser,
  createSession,
  listSessions,
  listUsers,
  UserQueryKey,
} from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { displayName } from "@/lib/display-name";

function shortSessionId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ActiveUserPanel({ active }: { active: ApiUser | null }) {
  const queryClient = useQueryClient();
  const activeSessionId = useActiveUserStore((s) => s.activeSessionId);
  const setActiveSessionId = useActiveUserStore((s) => s.setActiveSessionId);

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: Boolean(active),
  });

  const sessionsQuery = useQuery({
    queryKey: active
      ? UserQueryKey.Sessions(active.id)
      : (["sessions", "none"] as const),
    queryFn: () => {
      if (!active) throw new Error("Not signed in.");
      return listSessions(active.apiKey);
    },
    enabled: Boolean(active),
  });

  const sessions = sessionsQuery.data ?? [];

  useEffect(() => {
    if (!active || sessionsQuery.isLoading) return;
    if (sessions.length === 0) {
      if (activeSessionId) setActiveSessionId(null);
      return;
    }
    if (activeSessionId && sessions.some((s) => s.id === activeSessionId)) {
      return;
    }
    const latest = sessions[0];
    if (latest) setActiveSessionId(latest.id);
  }, [
    active,
    sessions,
    sessionsQuery.isLoading,
    activeSessionId,
    setActiveSessionId,
  ]);

  const createSessionMutation = useMutation({
    mutationFn: () => {
      if (!active) throw new Error("Not signed in.");
      return createSession(active.apiKey);
    },
    onSuccess: async (session) => {
      if (!active) return;
      await queryClient.invalidateQueries({
        queryKey: UserQueryKey.Sessions(active.id),
      });
      setActiveSessionId(session.id);
    },
  });

  const live =
    active && usersQuery.data
      ? (usersQuery.data.find((u) => u.id === active.id) ?? active)
      : active;

  const err =
    (createSessionMutation.isError
      ? errorMessage(createSessionMutation.error)
      : null) ||
    (sessionsQuery.isError ? errorMessage(sessionsQuery.error) : null);

  return (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col gap-3 overflow-y-auto border-line border-r bg-surface p-4">
      {!live ? (
        <p className="m-0 text-muted text-sm">
          Nobody signed in.{" "}
          <Link href="/auth" className="text-accent">
            Go to Sign in
          </Link>
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 font-display text-ink text-lg">
              {displayName(live.id)}
            </h2>
            <div className="flex shrink-0 gap-1">
              <Link
                href={`/settings/${encodeURIComponent(live.id)}`}
                className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs no-underline hover:border-ink hover:text-ink"
              >
                Settings
              </Link>
              <Link
                href="/auth"
                className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs no-underline hover:border-ink hover:text-ink"
              >
                Switch Account
              </Link>
            </div>
          </div>

          {err ? <p className="m-0 text-danger text-sm">{err}</p> : null}

          <div className="flex flex-col gap-2 border-line border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 font-display text-base text-ink">Chats</h3>
              <button
                type="button"
                className="rounded border border-accent bg-accent px-2 py-0.5 text-white text-xs disabled:cursor-not-allowed disabled:opacity-60"
                disabled={createSessionMutation.isPending}
                onClick={() => createSessionMutation.mutate()}
              >
                New chat
              </button>
            </div>
            <p className="m-0 text-muted text-xs">
              Sorted by latest message. Think mode uses the selected chat.
            </p>
            {sessionsQuery.isLoading ? (
              <p className="m-0 text-muted text-xs">Loading chats…</p>
            ) : sessions.length === 0 ? (
              <p className="m-0 text-muted text-xs">
                No chats yet. Start one with New chat or Ask (think).
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {sessions.map((session) => {
                  const selected = session.id === activeSessionId;
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        className={
                          selected
                            ? "flex w-full cursor-pointer flex-col gap-0.5 rounded border border-accent border-l-4 bg-accent/15 px-2 py-1.5 text-left text-ink"
                            : "flex w-full cursor-pointer flex-col gap-0.5 rounded border border-line bg-canvas px-2 py-1.5 text-left text-ink"
                        }
                        onClick={() => setActiveSessionId(session.id)}
                      >
                        <span className="font-mono text-ink text-xs">
                          {shortSessionId(session.id)}
                        </span>
                        <span className="font-mono text-muted text-xs">
                          {formatDateTime(session.updatedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

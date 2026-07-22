"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ApiError,
  type ApiUser,
  listUsers,
  regenerateUserKey,
  UserQueryKey,
} from "@/lib/api";

function displayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ActiveUserPanel({ active }: { active: ApiUser | null }) {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: Boolean(active),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => {
      if (!active) throw new Error("Not signed in.");
      return regenerateUserKey({ id: active.id, actorApiKey: active.apiKey });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
      if (active) {
        await queryClient.invalidateQueries({
          queryKey: UserQueryKey.DataRoot(active.id),
        });
      }
    },
  });

  const live =
    active && usersQuery.data
      ? (usersQuery.data.find((u) => u.id === active.id) ?? active)
      : active;

  const err = regenerateMutation.isError
    ? errorMessage(regenerateMutation.error)
    : null;

  return (
    <aside className="sticky top-4 flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 font-display text-ink text-lg">Signed in</h2>
        <Link
          href="/auth"
          className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs no-underline hover:border-ink hover:text-ink"
        >
          Switch user
        </Link>
      </div>

      {!live ? (
        <p className="m-0 text-muted text-sm">
          Nobody signed in.{" "}
          <Link href="/auth" className="text-accent">
            Go to Sign in
          </Link>
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1 rounded border border-accent border-l-4 bg-accent/15 px-2.5 py-2">
            <span className="font-display text-base text-ink">
              {displayName(live.id)}
            </span>
            <code className="break-all font-mono text-muted text-xs">
              {live.apiKey}
            </code>
            {live.createdAt ? (
              <span className="font-mono text-muted text-xs">
                created {new Date(live.createdAt).toLocaleString()}
              </span>
            ) : null}
          </div>
          {err ? <p className="m-0 text-danger text-sm">{err}</p> : null}
          <button
            type="button"
            className="self-start rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={regenerateMutation.isPending}
            onClick={() => regenerateMutation.mutate()}
            title="Regenerate API key"
          >
            New key
          </button>
        </>
      )}
    </aside>
  );
}

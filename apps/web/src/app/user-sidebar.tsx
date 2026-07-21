"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  type ApiUser,
  createUser,
  deleteUser,
  listUsers,
  regenerateUserKey,
  UserQueryKey,
} from "@/lib/api";

type Props = {
  activeUserId: string | null;
  onSelectUser: (user: ApiUser | null) => void;
};

const createUserSchema = z.object({
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z][a-z0-9_-]{0,63}$/,
      "Use a lowercase id (letter, then letters/digits/_/-)",
    ),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

function displayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function UserSidebar({ activeUserId, onSelectUser }: Props) {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
  });

  const users = usersQuery.data ?? [];
  const activeApiKey = users.find((u) => u.id === activeUserId)?.apiKey ?? null;

  const createForm = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { id: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateUserValues) =>
      createUser({ id: values.id, actorApiKey: activeApiKey }),
    onSuccess: async (user) => {
      createForm.reset({ id: "" });
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
      onSelectUser(user);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => {
      if (!activeApiKey)
        throw new Error("Sign in as a user to regenerate keys.");
      return regenerateUserKey({ id, actorApiKey: activeApiKey });
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
      if (user.id === activeUserId) onSelectUser(user);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!activeApiKey) throw new Error("Sign in as a user to delete.");
      return deleteUser({ id, actorApiKey: activeApiKey });
    },
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: UserQueryKey.List });
      if (id === activeUserId) onSelectUser(null);
    },
  });

  const busy =
    usersQuery.isFetching ||
    createMutation.isPending ||
    regenerateMutation.isPending ||
    deleteMutation.isPending ||
    createForm.formState.isSubmitting;

  const actionError =
    (createMutation.isError ? errorMessage(createMutation.error) : null) ||
    (regenerateMutation.isError
      ? errorMessage(regenerateMutation.error)
      : null) ||
    (deleteMutation.isError ? errorMessage(deleteMutation.error) : null) ||
    (usersQuery.isError ? errorMessage(usersQuery.error) : null);

  return (
    <aside className="sticky top-4 flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 font-display text-ink text-lg">Users</h2>
        <button
          type="button"
          className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void usersQuery.refetch()}
          disabled={busy}
        >
          Refresh
        </button>
      </div>
      <p className="m-0 text-muted text-xs">
        Click a user to sign in. Highlighted = current session.
      </p>
      {actionError ? (
        <p className="m-0 text-danger text-sm">{actionError}</p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {users.map((user) => {
          const active = user.id === activeUserId;
          return (
            <li key={user.id}>
              <button
                type="button"
                className={
                  active
                    ? "flex w-full cursor-pointer flex-col gap-1 rounded border border-accent border-l-4 bg-accent/15 px-2.5 py-2 text-left text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    : "flex w-full cursor-pointer flex-col gap-1 rounded border border-line bg-canvas px-2.5 py-2 text-left text-ink disabled:cursor-not-allowed disabled:opacity-60"
                }
                onClick={() => onSelectUser(user)}
                disabled={busy}
              >
                <span className="font-display text-base">
                  {displayName(user.id)}
                </span>
                <code className="break-all font-mono text-muted text-xs">
                  {user.apiKey}
                </code>
              </button>
              <div className="mt-1 flex gap-1.5 pl-0.5">
                <button
                  type="button"
                  className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => regenerateMutation.mutate(user.id)}
                  disabled={busy || !activeApiKey}
                  title="Regenerate API key"
                >
                  New key
                </button>
                <button
                  type="button"
                  className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete user "${user.id}"? Memories and chat will cascade.`,
                      )
                    ) {
                      return;
                    }
                    deleteMutation.mutate(user.id);
                  }}
                  disabled={busy || !activeApiKey}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <form
        className="flex flex-col gap-2 border-line border-t pt-3"
        onSubmit={createForm.handleSubmit((values) =>
          createMutation.mutate(values),
        )}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span>New user id</span>
          <input
            className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
            placeholder="e.g. mina"
            disabled={busy}
            {...createForm.register("id")}
          />
        </label>
        {createForm.formState.errors.id ? (
          <p className="m-0 text-danger text-sm">
            {createForm.formState.errors.id.message}
          </p>
        ) : null}
        <button
          type="submit"
          className="self-start rounded border border-accent bg-accent px-3.5 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
        >
          Create user
        </button>
      </form>
    </aside>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useActiveUserStore } from "@/lib/active-user-store";
import {
  ApiError,
  type AskMode,
  apiBaseUrl,
  getHealth,
  listUsers,
  postQuery,
  UserQueryKey,
} from "@/lib/api";
import { ActiveUserPanel } from "./active-user-panel";
import { type ApiPayload, ResponseView } from "./response-view";
import { UserDataPanel } from "./user-data-panel";

const MODE_HELP: Record<AskMode, string> = {
  think:
    "query + get_page — full shared pages, DeepSeek synthesis (chat + personal memory)",
  query: "gbrain query — hybrid retrieval (vector + keyword), no LLM",
  search: "gbrain search — keyword / BM25 retrieval, no LLM",
};

const askSchema = z.object({
  mode: z.enum(["think", "query", "search"]),
  message: z.string().trim().min(1, "message is required"),
});

type AskValues = z.infer<typeof askSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function DemoPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const activeSessionId = useActiveUserStore((s) => s.activeSessionId);
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const [storeReady, setStoreReady] = useState(false);
  const [payload, setPayload] = useState<ApiPayload | null>(null);

  useEffect(() => {
    setStoreReady(useActiveUserStore.persist.hasHydrated());
    return useActiveUserStore.persist.onFinishHydration(() => {
      setStoreReady(true);
    });
  }, []);

  const healthQuery = useQuery({
    queryKey: UserQueryKey.Health,
    queryFn: getHealth,
  });

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
    enabled: storeReady,
  });

  const active = useMemo(() => {
    const users = usersQuery.data;
    if (!users || !activeUserId) return null;
    return users.find((u) => u.id === activeUserId) ?? null;
  }, [usersQuery.data, activeUserId]);

  useEffect(() => {
    if (!storeReady) return;
    if (!activeUserId) {
      router.replace("/auth");
      return;
    }
    const users = usersQuery.data;
    if (!users) return;
    if (!users.some((u) => u.id === activeUserId)) {
      setActiveUserId(null);
      router.replace("/auth");
    }
  }, [storeReady, activeUserId, usersQuery.data, router, setActiveUserId]);

  const askForm = useForm<AskValues>({
    resolver: zodResolver(askSchema),
    defaultValues: { mode: "think", message: "" },
  });

  const mode = useWatch({ control: askForm.control, name: "mode" });

  const askMutation = useMutation({
    mutationFn: (values: AskValues) => {
      if (!active) throw new Error("Select a signed-in user.");
      return postQuery({
        apiKey: active.apiKey,
        message: values.message,
        mode: values.mode,
        sessionId: values.mode === "think" ? activeSessionId : null,
      });
    },
    onSuccess: async (data) => {
      setPayload(data);
      askForm.reset({ mode: askForm.getValues("mode"), message: "" });
      if (active) {
        await queryClient.invalidateQueries({
          queryKey: UserQueryKey.DataRoot(active.id),
        });
        await queryClient.invalidateQueries({
          queryKey: UserQueryKey.Sessions(active.id),
        });
        if (data.sessionId) {
          useActiveUserStore.getState().setActiveSessionId(data.sessionId);
        }
      }
    },
    onError: (err) => setPayload({ error: errorMessage(err) }),
  });

  const pending = askMutation.isPending;
  const healthOk = healthQuery.data?.ok === true;
  const healthError = healthQuery.isError
    ? errorMessage(healthQuery.error)
    : null;

  if (!storeReady || !activeUserId || !active) {
    return (
      <p className="m-0 px-5 py-8 text-muted text-sm">
        {!storeReady ? "Loading session…" : "Redirecting to sign in…"}
      </p>
    );
  }

  const apiUrl = apiBaseUrl();

  return (
    <div className="flex h-dvh overflow-hidden">
      <ActiveUserPanel active={active} />

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-8 pb-12">
        <div className="mx-auto max-w-4xl">
          <header className="mb-4">
            <h1 className="mb-1 font-display text-3xl text-ink">
              gbrain-sandbox
            </h1>
            <p className="my-1 text-muted text-sm">
              Current session:{" "}
              {activeSessionId ? (
                <code className="break-all font-mono text-ink text-sm">
                  {activeSessionId}
                </code>
              ) : (
                <span>none — New chat or Ask (think)</span>
              )}
            </p>
            <p className="my-1 text-muted text-sm">
              Conversation UI for Bun API at{" "}
              <code className="font-mono text-sm">{apiUrl}</code>
            </p>
            <p className="my-1 text-muted text-sm">
              Manage accounts on{" "}
              <Link href="/auth" className="text-accent">
                /auth
              </Link>
              . Personal notes live in{" "}
              <Link
                href={`/settings/${encodeURIComponent(active.id)}`}
                className="text-accent"
              >
                Settings
              </Link>
              .
            </p>
            <p
              className={
                healthQuery.isLoading
                  ? "my-1 text-muted text-sm"
                  : healthOk
                    ? "my-1 text-ok text-sm"
                    : "my-1 text-danger text-sm"
              }
            >
              {healthQuery.isLoading
                ? "API health: checking…"
                : healthOk
                  ? "API health: ok"
                  : `API health: down${healthError ? ` (${healthError})` : ""}`}
            </p>
          </header>

          <div className="flex flex-col gap-4">
            <form
              className="flex flex-col gap-2.5 rounded-md border border-line bg-surface p-4"
              onSubmit={askForm.handleSubmit((values) => {
                setPayload(null);
                askMutation.mutate(values);
              })}
            >
              <h2 className="m-0 font-display text-ink text-lg">Ask</h2>
              <p className="m-0 text-muted text-sm">
                POST /query — {MODE_HELP[mode]}
              </p>
              <label className="flex flex-col gap-1.5 text-sm">
                <span>Mode</span>
                <select
                  className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
                  disabled={pending}
                  {...askForm.register("mode")}
                >
                  <option value="think">think</option>
                  <option value="query">query</option>
                  <option value="search">search</option>
                </select>
              </label>
              <textarea
                className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
                rows={3}
                placeholder="What is the sandbox verification protocol codename?"
                disabled={pending}
                {...askForm.register("message")}
              />
              {askForm.formState.errors.message ? (
                <p className="m-0 text-danger text-sm">
                  {askForm.formState.errors.message.message}
                </p>
              ) : null}
              <button
                type="submit"
                className="self-start rounded border border-accent bg-accent px-3.5 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending || askForm.formState.isSubmitting}
              >
                Ask
              </button>
            </form>

            <ResponseView pending={pending} payload={payload} />

            <UserDataPanel key={active.id} active={active} />
          </div>
        </div>
      </div>
    </div>
  );
}

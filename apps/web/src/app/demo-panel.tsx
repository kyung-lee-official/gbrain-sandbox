"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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
import { modeLabel, tabByMode } from "@/lib/query-modes";
import { ActiveUserPanel } from "./active-user-panel";
import { QueryModeTabs } from "./query-mode-tabs";
import { type ApiPayload, ResponseView } from "./response-view";
import { SessionStatusChip } from "./session-status-chip";
import { UserDataPanel } from "./user-data-panel";

const messageSchema = z.object({
  message: z.string().trim().min(1, "message is required"),
});

type MessageValues = z.infer<typeof messageSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function DemoPanel({ mode }: { mode: AskMode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeUserId = useActiveUserStore((s) => s.activeUserId);
  const activeSessionId = useActiveUserStore((s) => s.activeSessionId);
  const setActiveUserId = useActiveUserStore((s) => s.setActiveUserId);
  const [storeReady, setStoreReady] = useState(false);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const tab = tabByMode(mode);

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

  const askForm = useForm<MessageValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: { message: "" },
  });

  const askMutation = useMutation({
    mutationFn: (values: MessageValues) => {
      if (!active) throw new Error("Select a signed-in user.");
      return postQuery({
        apiKey: active.apiKey,
        message: values.message,
        mode,
        sessionId: mode === "ask" ? activeSessionId : null,
      });
    },
    onSuccess: async (data) => {
      setPayload(data);
      askForm.reset({ message: "" });
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
  const submitLabel = modeLabel(mode);

  return (
    <div className="flex h-dvh overflow-hidden">
      <ActiveUserPanel active={active} />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute top-3 left-3 z-20">
          <div className="pointer-events-auto">
            <SessionStatusChip
              apiUrl={apiUrl}
              sessionId={activeSessionId}
              healthLoading={healthQuery.isLoading}
              healthOk={healthOk}
              healthError={healthError}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8 pb-4">
          <div className="mx-auto max-w-4xl">
            {mode === "ask" ? (
              <UserDataPanel
                key={active.id}
                active={active}
                sessionId={activeSessionId}
                lastResponse={payload}
              />
            ) : (
              <ResponseView pending={pending} payload={payload} />
            )}
          </div>
        </div>

        <div className="shrink-0 bg-canvas px-5 py-3">
          <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
            <QueryModeTabs mode={mode} />
            <form
              className="flex flex-col gap-2.5"
              onSubmit={askForm.handleSubmit((values) => {
                setPayload(null);
                askMutation.mutate(values);
              })}
            >
              <div className="relative rounded border border-line bg-surface">
                <textarea
                  className="w-full resize-none border-0 bg-transparent py-2 pr-20 pl-2.5 text-ink outline-none disabled:opacity-60"
                  rows={3}
                  placeholder="What is the sandbox verification protocol codename?"
                  disabled={pending}
                  {...askForm.register("message")}
                />
                <button
                  type="submit"
                  className="absolute right-2 bottom-2 rounded border border-accent bg-accent px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending || askForm.formState.isSubmitting}
                  title={tab.help}
                >
                  {pending ? "…" : submitLabel}
                </button>
              </div>
              {askForm.formState.errors.message ? (
                <p className="m-0 text-danger text-sm">
                  {askForm.formState.errors.message.message}
                </p>
              ) : null}
              {mode === "ask" && pending ? (
                <p className="m-0 text-muted text-sm">Calling Bun API…</p>
              ) : null}
              {mode === "ask" && payload?.error ? (
                <p className="m-0 text-danger text-sm">{payload.error}</p>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

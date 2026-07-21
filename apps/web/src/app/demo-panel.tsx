"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  type ApiUser,
  type AskMode,
  getHealth,
  listUsers,
  postQuery,
  postRemember,
  UserQueryKey,
} from "@/lib/api";
import { type ApiPayload, ResponseView } from "./response-view";
import { UserDataPanel } from "./user-data-panel";
import { UserSidebar } from "./user-sidebar";

const MODE_HELP: Record<AskMode, string> = {
  think:
    "query + get_page — full shared pages, DeepSeek synthesis (chat + personal memory)",
  query: "gbrain query — hybrid retrieval (vector + keyword), no LLM",
  search: "gbrain search — keyword / BM25 retrieval, no LLM",
};

const rememberSchema = z.object({
  content: z.string().trim().min(1, "content is required"),
});

const askSchema = z.object({
  mode: z.enum(["think", "query", "search"]),
  message: z.string().trim().min(1, "message is required"),
});

type RememberValues = z.infer<typeof rememberSchema>;
type AskValues = z.infer<typeof askSchema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function DemoPanel() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<ApiUser | null>(null);
  const [payload, setPayload] = useState<ApiPayload | null>(null);

  const healthQuery = useQuery({
    queryKey: UserQueryKey.Health,
    queryFn: getHealth,
  });

  const usersQuery = useQuery({
    queryKey: UserQueryKey.List,
    queryFn: listUsers,
  });

  useEffect(() => {
    if (active) return;
    const users = usersQuery.data;
    if (!users || users.length === 0) return;
    const lily = users.find((u) => u.id === "lily");
    setActive(lily ?? users[0] ?? null);
  }, [usersQuery.data, active]);

  const rememberForm = useForm<RememberValues>({
    resolver: zodResolver(rememberSchema),
    defaultValues: { content: "" },
  });

  const askForm = useForm<AskValues>({
    resolver: zodResolver(askSchema),
    defaultValues: { mode: "think", message: "" },
  });

  const mode = useWatch({ control: askForm.control, name: "mode" });

  const rememberMutation = useMutation({
    mutationFn: (values: RememberValues) => {
      if (!active) throw new Error("Select a signed-in user.");
      return postRemember({ apiKey: active.apiKey, content: values.content });
    },
    onSuccess: async (data) => {
      setPayload(data);
      rememberForm.reset({ content: "" });
      if (active) {
        await queryClient.invalidateQueries({
          queryKey: UserQueryKey.Data(active.id),
        });
      }
    },
    onError: (err) => setPayload({ error: errorMessage(err) }),
  });

  const askMutation = useMutation({
    mutationFn: (values: AskValues) => {
      if (!active) throw new Error("Select a signed-in user.");
      return postQuery({
        apiKey: active.apiKey,
        message: values.message,
        mode: values.mode,
      });
    },
    onSuccess: async (data) => {
      setPayload(data);
      askForm.reset({ mode: askForm.getValues("mode"), message: "" });
      if (active) {
        await queryClient.invalidateQueries({
          queryKey: UserQueryKey.Data(active.id),
        });
      }
    },
    onError: (err) => setPayload({ error: errorMessage(err) }),
  });

  const pending = rememberMutation.isPending || askMutation.isPending;
  const healthOk = healthQuery.data?.ok === true;
  const healthError = healthQuery.isError
    ? errorMessage(healthQuery.error)
    : null;

  return (
    <div>
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

      <div className="mt-6 grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
        <UserSidebar
          activeUserId={active?.id ?? null}
          onSelectUser={(user) => {
            setActive(user);
            setPayload(null);
          }}
        />

        <div className="flex flex-col gap-4">
          <p className="m-0 text-muted text-sm">
            Signed in as{" "}
            <strong className="text-ink">
              {active ? active.id : "nobody — pick a user in the sidebar"}
            </strong>
          </p>

          <form
            className="flex flex-col gap-2.5 rounded-md border border-line bg-surface p-4"
            onSubmit={rememberForm.handleSubmit((values) => {
              setPayload(null);
              rememberMutation.mutate(values);
            })}
          >
            <h2 className="m-0 font-display text-ink text-lg">Remember</h2>
            <p className="m-0 text-muted text-sm">
              POST /remember — personal note in app Postgres
            </p>
            <textarea
              className="w-full rounded border border-line bg-canvas px-2.5 py-2 text-ink disabled:opacity-60"
              rows={3}
              placeholder="My favorite coffee is oat latte."
              disabled={pending || !active}
              {...rememberForm.register("content")}
            />
            {rememberForm.formState.errors.content ? (
              <p className="m-0 text-danger text-sm">
                {rememberForm.formState.errors.content.message}
              </p>
            ) : null}
            <button
              type="submit"
              className="self-start rounded border border-accent bg-accent px-3.5 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                pending || !active || rememberForm.formState.isSubmitting
              }
            >
              Save note
            </button>
          </form>

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
                disabled={pending || !active}
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
              disabled={pending || !active}
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
              disabled={pending || !active || askForm.formState.isSubmitting}
            >
              Ask
            </button>
          </form>

          <ResponseView pending={pending} payload={payload} />

          <UserDataPanel active={active} />
        </div>
      </div>
    </div>
  );
}

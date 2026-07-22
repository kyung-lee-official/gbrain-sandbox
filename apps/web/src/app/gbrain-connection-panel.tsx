"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  clearGbrainAuth,
  GbrainAuthQueryKey,
  getGbrainAuth,
  saveGbrainAuth,
  testGbrainAuth,
} from "@/lib/api";

const schema = z.object({
  oauthClientId: z.string().trim().min(1, "Client ID is required"),
  oauthClientSecret: z.string().trim().min(1, "Client secret is required"),
});

type FormValues = z.infer<typeof schema>;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function GbrainConnectionPanel() {
  const queryClient = useQueryClient();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<boolean | null>(null);

  const authQuery = useQuery({
    queryKey: GbrainAuthQueryKey.Status,
    queryFn: getGbrainAuth,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { oauthClientId: "", oauthClientSecret: "" },
  });

  useEffect(() => {
    const data = authQuery.data;
    if (!data) return;
    if (data.configured) {
      form.reset({
        oauthClientId: data.oauthClientId,
        oauthClientSecret: data.oauthClientSecret,
      });
    } else {
      form.reset({ oauthClientId: "", oauthClientSecret: "" });
    }
  }, [authQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => saveGbrainAuth(values),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: GbrainAuthQueryKey.Status,
      });
      if (result.connection.ok) {
        setStatusOk(true);
        setStatusMessage("Saved. Token exchange with gbrain succeeded.");
      } else {
        setStatusOk(false);
        setStatusMessage(
          `Saved, but connection test failed: ${result.connection.error}`,
        );
      }
    },
    onError: (err) => {
      setStatusOk(false);
      setStatusMessage(errorMessage(err));
    },
  });

  const testMutation = useMutation({
    mutationFn: (values: FormValues) => testGbrainAuth(values),
    onSuccess: (result) => {
      if (result.ok && result.connection.ok) {
        setStatusOk(true);
        setStatusMessage("Connection OK — gbrain accepted client credentials.");
      } else {
        setStatusOk(false);
        setStatusMessage(
          result.connection.ok === false
            ? result.connection.error
            : (result.error ?? "Connection test failed"),
        );
      }
    },
    onError: (err) => {
      setStatusOk(false);
      setStatusMessage(errorMessage(err));
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearGbrainAuth(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: GbrainAuthQueryKey.Status,
      });
      form.reset({ oauthClientId: "", oauthClientSecret: "" });
      setStatusOk(true);
      setStatusMessage("Cleared app_gbrain_auth credentials.");
    },
    onError: (err) => {
      setStatusOk(false);
      setStatusMessage(errorMessage(err));
    },
  });

  const busy =
    authQuery.isLoading ||
    authQuery.isFetching ||
    saveMutation.isPending ||
    testMutation.isPending ||
    clearMutation.isPending ||
    form.formState.isSubmitting;

  const configured = authQuery.data?.configured === true;

  return (
    <section className="flex w-full max-w-md flex-col overflow-hidden rounded-md border border-line bg-surface shadow-sm">
      <div className="px-6 pt-6 pb-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="m-0 font-display text-2xl text-ink">
            Connect to gbrain
          </h1>
          <Link
            href="/auth"
            className="rounded border border-line bg-transparent px-2 py-0.5 text-muted text-xs hover:border-ink hover:text-ink"
          >
            Back
          </Link>
        </div>
        <p className="mt-0 mb-3 text-muted text-sm">
          Paste the OAuth client id and secret from{" "}
          <code className="font-mono text-xs">gbrain auth register-client</code>{" "}
          (run under <code className="font-mono text-xs">apps/gbrain</code>).
          Bun stores them in{" "}
          <code className="font-mono text-xs">app_gbrain_auth</code> and
          exchanges them at gbrain{" "}
          <code className="font-mono text-xs">/token</code>.
        </p>
        <p className="mt-0 mb-4 text-muted text-sm">
          Status:{" "}
          {authQuery.isLoading ? (
            <span>Loading…</span>
          ) : configured ? (
            <span className="text-ink">Configured</span>
          ) : (
            <span className="text-ink">Not configured</span>
          )}
        </p>
        {statusMessage ? (
          <p
            className={
              statusOk === false
                ? "mt-0 mb-3 text-danger text-sm"
                : "mt-0 mb-3 text-muted text-sm"
            }
          >
            {statusMessage}
          </p>
        ) : null}
        {authQuery.isError ? (
          <p className="mt-0 mb-3 text-danger text-sm">
            {errorMessage(authQuery.error)}
          </p>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-3 px-6 pb-6"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span>OAuth client ID</span>
          <input
            className="w-full rounded border border-line bg-canvas px-2.5 py-2 font-mono text-ink text-sm disabled:opacity-60"
            autoComplete="off"
            disabled={busy}
            {...form.register("oauthClientId")}
          />
        </label>
        {form.formState.errors.oauthClientId ? (
          <p className="m-0 text-danger text-sm">
            {form.formState.errors.oauthClientId.message}
          </p>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span>OAuth client secret</span>
          <input
            className="w-full rounded border border-line bg-canvas px-2.5 py-2 font-mono text-ink text-sm disabled:opacity-60"
            autoComplete="off"
            disabled={busy}
            {...form.register("oauthClientSecret")}
          />
        </label>
        {form.formState.errors.oauthClientSecret ? (
          <p className="m-0 text-danger text-sm">
            {form.formState.errors.oauthClientSecret.message}
          </p>
        ) : null}

        <div className="mt-2 flex flex-col gap-2">
          <button
            type="submit"
            className="w-full rounded border border-accent bg-accent px-3.5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
          >
            {saveMutation.isPending ? "Saving…" : "Save & test connection"}
          </button>
          <button
            type="button"
            className="w-full rounded border border-line bg-transparent px-3.5 py-2 text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => {
              void form.handleSubmit((values) => testMutation.mutate(values))();
            }}
          >
            {testMutation.isPending ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            className="w-full rounded border border-danger bg-transparent px-3.5 py-2 text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy || !configured}
            onClick={() => {
              if (
                !window.confirm(
                  "Clear stored gbrain OAuth credentials from the app DB?",
                )
              ) {
                return;
              }
              clearMutation.mutate();
            }}
          >
            {clearMutation.isPending ? "Clearing…" : "Clear connection"}
          </button>
        </div>
      </form>
    </section>
  );
}

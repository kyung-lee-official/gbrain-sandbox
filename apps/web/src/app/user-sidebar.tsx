"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import type { ApiUser } from "@/lib/api";
import {
  loadUsers,
  submitCreateUser,
  submitDeleteUser,
  submitRegenerateKey,
} from "./actions";

type Props = {
  activeUserId: string | null;
  onSelectUser: (user: ApiUser) => void;
  onUsersChange: (users: ApiUser[]) => void;
};

function displayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function UserSidebar({
  activeUserId,
  onSelectUser,
  onUsersChange,
}: Props) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newId, setNewId] = useState("");

  const activeApiKey = users.find((u) => u.id === activeUserId)?.apiKey ?? null;

  function refresh() {
    startTransition(async () => {
      const res = await loadUsers();
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      const next = res.users ?? [];
      setUsers(next);
      onUsersChange(next);
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = new FormData();
    if (activeApiKey) form.set("actorApiKey", activeApiKey);
    form.set("id", newId);
    startTransition(async () => {
      const res = await submitCreateUser(form);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNewId("");
      setError(null);
      refresh();
      if (res.user) onSelectUser(res.user);
    });
  }

  function onRegenerate(id: string) {
    if (!activeApiKey) {
      setError("Sign in as a user to regenerate keys.");
      return;
    }
    const form = new FormData();
    form.set("actorApiKey", activeApiKey);
    form.set("id", id);
    startTransition(async () => {
      const res = await submitRegenerateKey(form);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      refresh();
      if (res.user && res.user.id === activeUserId) onSelectUser(res.user);
    });
  }

  function onDelete(id: string) {
    if (!activeApiKey) {
      setError("Sign in as a user to delete.");
      return;
    }
    if (
      !window.confirm(`Delete user "${id}"? Memories and chat will cascade.`)
    ) {
      return;
    }
    const form = new FormData();
    form.set("actorApiKey", activeApiKey);
    form.set("id", id);
    startTransition(async () => {
      const res = await submitDeleteUser(form);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      if (id === activeUserId) {
        onSelectUser({ id: "", apiKey: "" });
      }
      refresh();
    });
  }

  return (
    <aside className="user-sidebar">
      <div className="user-sidebar-head">
        <h2>Users</h2>
        <button
          type="button"
          className="ghost"
          onClick={refresh}
          disabled={pending}
        >
          Refresh
        </button>
      </div>
      <p className="user-sidebar-hint">
        Click a user to sign in. Highlighted = current session.
      </p>
      {error ? <p className="err sidebar-err">{error}</p> : null}
      <ul className="user-list">
        {users.map((user) => {
          const active = user.id === activeUserId;
          return (
            <li key={user.id}>
              <button
                type="button"
                className={active ? "user-row active" : "user-row"}
                onClick={() => onSelectUser(user)}
                disabled={pending}
              >
                <span className="user-name">{displayName(user.id)}</span>
                <code className="user-key">{user.apiKey}</code>
              </button>
              <div className="user-row-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onRegenerate(user.id)}
                  disabled={pending || !activeApiKey}
                  title="Regenerate API key"
                >
                  New key
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => onDelete(user.id)}
                  disabled={pending || !activeApiKey}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <form className="user-create" onSubmit={onCreate}>
        <label className="field">
          <span>New user id</span>
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="e.g. mina"
            disabled={pending}
            required
          />
        </label>
        <button type="submit" disabled={pending || !newId.trim()}>
          Create user
        </button>
      </form>
    </aside>
  );
}

# Bun HTTP API

Base URL: `http://localhost:3132` (override with `PORT`).

All responses are JSON (`Content-Type: application/json`).

## Auth

| Endpoint                                | Auth                                                |
| --------------------------------------- | --------------------------------------------------- |
| `GET /health`                           | none                                                |
| `POST /admin/nuke`                      | none (sandbox; drops all app tables)                |
| `GET /users`, `GET /users/:id`          | none (sandbox convenience)                          |
| `GET /users/:id/data`                   | `Authorization: Bearer <api-key>`                   |
| `DELETE /users/:id/memories/:memoryId`  | `Authorization: Bearer <api-key>`                   |
| `GET /sessions`, `POST /sessions`       | `Authorization: Bearer <api-key>`                   |
| `POST /users`                           | Bearer if any users exist; open when table is empty |
| `PATCH /users/:id`, `DELETE /users/:id` | `Authorization: Bearer <api-key>`                   |
| `POST /query`, `POST /remember`         | `Authorization: Bearer <api-key>`                   |

Seed users (after `bun run setup:gbrain`; stored in `app_users`):

| User id    | Default API key     |
| ---------- | ------------------- |
| `lily`     | `demo-key-lily`     |
| `haewon`   | `demo-key-haewon`   |
| `sullyoon` | `demo-key-sullyoon` |
| `bae`      | `demo-key-bae`      |
| `jiwoo`    | `demo-key-jiwoo`    |
| `kyujin`   | `demo-key-kyujin`   |

Missing or unknown key → `401`:

```json
{ "error": "Unauthorized. Use Authorization: Bearer <api-key>." }
```

## Endpoints

### `GET /health`

Liveness check. No auth.

**200**

```json
{ "ok": true }
```

### `POST /admin/nuke`

Sandbox only: drop all `app_*` tables (`app_messages`, `app_sessions`, `app_memories`, `app_gbrain_auth`, `app_users`) and recreate empty schema. No auth. Does not re-seed users (restarting the API will seed when the table is empty).

**200**

```json
{ "ok": true, "nuked": true }
```

### `GET /users`

List all app users.

**200**

```json
{
  "users": [{ "id": "lily", "apiKey": "demo-key-lily", "createdAt": "..." }]
}
```

### `POST /users`

Create a user. Requires Bearer when users already exist.

**Request**

```json
{ "id": "mina", "apiKey": "optional-custom-key" }
```

| Field    | Required | Notes                                            |
| -------- | -------- | ------------------------------------------------ |
| `id`     | yes      | Lowercase; `^[a-z][a-z0-9_-]{0,63}$`             |
| `apiKey` | no       | Generated as `demo-key-<id>-<suffix>` if omitted |

**201** — same shape as a user object. **409** if id or key conflicts.

### `GET /users/:id`

**200** user object, or **404**.

### `PATCH /users/:id`

Requires Bearer. Body `{ "apiKey?" }` — omit `apiKey` to regenerate.

**200** updated user, or **404** / **409**.

### `DELETE /users/:id`

Requires Bearer. Cascades memories, sessions, and messages.

**200** `{ "deleted": true, "id": "..." }`, or **404**.

### `GET /users/:id/data`

Requires Bearer. Returns app Postgres rows for that user (`app_memories`, `app_sessions`, paginated `app_messages`). Any authenticated sandbox user may inspect any id.

Query:

| Param          | Default | Notes                                      |
| -------------- | ------- | ------------------------------------------ |
| `messagePage`  | `1`     | 1-based page of messages (50 per page)     |

Messages are ordered **newest first** (`created_at DESC`).

**200**

```json
{
  "user": { "id": "lily", "apiKey": "demo-key-lily", "createdAt": "..." },
  "memories": [
    { "id": 1, "slug": "memory/…", "content": "…", "createdAt": "…" }
  ],
  "sessions": [
    { "id": "uuid", "createdAt": "…", "updatedAt": "…" }
  ],
  "messages": {
    "items": [
      {
        "id": 1,
        "sessionId": "uuid",
        "role": "user",
        "content": "…",
        "createdAt": "…"
      }
    ],
    "total": 120,
    "page": 1,
    "pageSize": 50
  }
}
```

**404** if the user id does not exist.

### `DELETE /users/:id/memories/:memoryId`

Requires Bearer. Deletes one `app_memories` row owned by `:id`.

**200** `{ "deleted": true, "id": 1 }`, or **404**.

### `GET /sessions`

Requires Bearer. Lists the caller's chat sessions, newest activity first (`updated_at DESC`).

**200**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "createdAt": "2026-07-22T03:00:00.000Z",
      "updatedAt": "2026-07-22T03:10:00.000Z"
    }
  ]
}
```

### `POST /sessions`

Requires Bearer. Creates a new empty chat session for the caller.

**201** — one session object (same shape as list items).

### `POST /query`

Ask against shared gbrain knowledge. Optional `mode` selects the tool path.

**Request**

```json
{
  "message": "What is the sandbox verification protocol codename?",
  "mode": "think",
  "sessionId": "optional-uuid-for-think"
}
```

| Field       | Required | Notes                                                                |
| ----------- | -------- | -------------------------------------------------------------------- |
| `message`   | yes      | Trimmed; empty → `400`                                               |
| `mode`      | no       | `think` (default), `query` (hybrid retrieval), or `search` (keyword) |
| `sessionId` | no       | Think only; must belong to the caller. Omit → latest or new session  |

| Mode     | gbrain tool                        | Behavior                                                                             |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| `think`  | `query` + `get_page`, then Bun LLM | Hybrid retrieve, load full page(s), synthesize with DeepSeek; chat + personal memory |
| `query`  | `query`                            | Hybrid retrieval only (no LLM, no chat write)                                        |
| `search` | `search`                           | Keyword / BM25 retrieval only (no LLM, no chat write)                                |

**200** (`mode: "think"`)

```json
{
  "userId": "lily",
  "sessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "mode": "think",
  "answer": "..."
}
```

**200** (`mode: "query"` or `"search"`)

```json
{
  "userId": "lily",
  "mode": "query",
  "answer": "..."
}
```

| Field       | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| `userId`    | Authenticated user                                               |
| `sessionId` | Present for `think` only (selected or latest chat session)       |
| `mode`      | Echo of the selected mode                                        |
| `answer`    | Synthesis text (`think`) or retrieval payload (`query`/`search`) |

**Errors**

| Status | When                                                       |
| ------ | ---------------------------------------------------------- |
| `400`  | Invalid JSON, empty `message`, or invalid `mode`           |
| `401`  | Missing/invalid Bearer token                               |
| `502`  | gbrain OAuth/MCP tool failed, or DeepSeek synthesis failed |

### `POST /remember`

Save a personal note for the authenticated user only (`app_memories`). Does not call gbrain.

**Request**

```json
{ "content": "My favorite coffee is oat latte." }
```

| Field     | Required | Notes                  |
| --------- | -------- | ---------------------- |
| `content` | yes      | Trimmed; empty → `400` |

**200**

```json
{
  "userId": "lily",
  "slug": "memory/note-1729123456789",
  "saved": true
}
```

| Field  | Meaning                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------- |
| `slug` | Short unique id for this note per user (auto-assigned). Same `(user_id, slug)` updates the row. |

**Errors**

| Status | When                                     |
| ------ | ---------------------------------------- |
| `400`  | Invalid JSON, or `content` missing/empty |
| `401`  | Missing/invalid Bearer token             |

## Other responses

| Status | Body                       | When                   |
| ------ | -------------------------- | ---------------------- |
| `404`  | `{ "error": "Not found" }` | Unknown path or method |

## Examples

```bash
# Health
curl.exe -s --max-time 5 http://localhost:3132/health

# List users
curl.exe -s --max-time 5 http://localhost:3132/users

# Create user (signed in as lily)
curl.exe -s --max-time 10 -X POST http://localhost:3132/users \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"mina\"}"

# think (default) — query + get_page + Bun DeepSeek synthesis
curl.exe -s --max-time 60 -X POST http://localhost:3132/query \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is the sandbox verification protocol codename?\",\"mode\":\"think\"}"

# query — hybrid retrieval (no LLM)
curl.exe -s --max-time 30 -X POST http://localhost:3132/query \
  -H "Authorization: Bearer demo-key-haewon" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What passphrase unlocks the sandbox test vault?\",\"mode\":\"query\"}"

# Personal memory (app Postgres, Lily only)
curl.exe -s --max-time 10 -X POST http://localhost:3132/remember \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"My favorite coffee is oat latte.\"}"

# Haewon cannot see Lily's app_memories
curl.exe -s --max-time 60 -X POST http://localhost:3132/query \
  -H "Authorization: Bearer demo-key-haewon" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is Lily favorite coffee?\"}"
```

# Bun HTTP API

Base URL: `http://localhost:3000` (override with `PORT`).

All responses are JSON (`Content-Type: application/json`).

## Auth

| Endpoint         | Auth                              |
| ---------------- | --------------------------------- |
| `GET /health`    | none                              |
| `POST /query`    | `Authorization: Bearer <api-key>` |
| `POST /remember` | `Authorization: Bearer <api-key>` |

Demo keys (after `bun run setup:gbrain` from the repo root):

| User | API key         |
| ---- | --------------- |
| Lily | `demo-key-lily` |
| Bob  | `demo-key-bob`  |

Missing or unknown key → `401`:

```json
{ "error": "Unauthorized. Use Authorization: Bearer <demo-api-key>." }
```

## Endpoints

### `GET /health`

Liveness check. No auth.

**200**

```json
{ "ok": true }
```

### `POST /query`

Ask against shared gbrain knowledge. Optional `mode` selects the gbrain tool.

**Request**

```json
{
  "message": "What is the sandbox verification protocol codename?",
  "mode": "think"
}
```

| Field     | Required | Notes                                                                 |
| --------- | -------- | --------------------------------------------------------------------- |
| `message` | yes      | Trimmed; empty → `400`                                                |
| `mode`    | no       | `think` (default), `query` (hybrid retrieval), or `search` (keyword) |

| Mode     | gbrain tool | Behavior                                                                 |
| -------- | ----------- | ------------------------------------------------------------------------ |
| `think`  | `think`     | LLM synthesis; injects chat history + personal memories; stores the turn |
| `query`  | `query`     | Hybrid retrieval only (no LLM, no chat write)                            |
| `search` | `search`    | Keyword / BM25 retrieval only (no LLM, no chat write)                    |

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

| Field       | Meaning                                                      |
| ----------- | ------------------------------------------------------------ |
| `userId`    | Authenticated user                                           |
| `sessionId` | Present for `think` only (one active thread per user)        |
| `mode`      | Echo of the selected mode                                    |
| `answer`    | Synthesis text (`think`) or retrieval payload (`query`/`search`) |

**Errors**

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| `400`  | Invalid JSON, empty `message`, or invalid `mode`                  |
| `401`  | Missing/invalid Bearer token                                      |
| `502`  | gbrain OAuth/MCP tool failed (`error` is the message)             |

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
curl -s http://localhost:3000/health

# think (default) — LLM synthesis
curl -s -X POST http://localhost:3000/query \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is the sandbox verification protocol codename?\",\"mode\":\"think\"}"

# query — hybrid retrieval (no LLM)
curl -s -X POST http://localhost:3000/query \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What passphrase unlocks the sandbox test vault?\",\"mode\":\"query\"}"

# search — keyword retrieval (no LLM)
curl -s -X POST http://localhost:3000/query \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"cerulean-moth\",\"mode\":\"search\"}"

# Personal memory (app Postgres, Lily only)
curl -s -X POST http://localhost:3000/remember \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"My favorite coffee is oat latte.\"}"

curl -s -X POST http://localhost:3000/query \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is my favorite coffee?\"}"

# Bob cannot see Lily's app_memories
curl -s -X POST http://localhost:3000/query \
  -H "Authorization: Bearer demo-key-bob" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is Lily favorite coffee?\"}"
```

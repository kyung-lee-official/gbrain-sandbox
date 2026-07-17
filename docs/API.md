# Bun HTTP API

Base URL: `http://localhost:3000` (override with `PORT`).

All responses are JSON (`Content-Type: application/json`).

## Auth

| Endpoint         | Auth                              |
| ---------------- | --------------------------------- |
| `GET /health`    | none                              |
| `POST /query`    | `Authorization: Bearer <api-key>` |
| `POST /remember` | `Authorization: Bearer <api-key>` |

Demo keys (after `bun run setup:gbrain`):

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

Ask a question using shared gbrain knowledge plus this user's personal memories and recent chat.

**Request**

```json
{ "message": "What is the sandbox verification protocol codename?" }
```

| Field     | Required | Notes                  |
| --------- | -------- | ---------------------- |
| `message` | yes      | Trimmed; empty → `400` |

**200**

```json
{
  "userId": "lily",
  "sessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "answer": "..."
}
```

| Field       | Meaning                                        |
| ----------- | ---------------------------------------------- |
| `userId`    | Authenticated user                             |
| `sessionId` | Active chat thread (one per user in this demo) |
| `answer`    | gbrain `think` synthesis                       |

**Errors**

| Status | When                                                     |
| ------ | -------------------------------------------------------- |
| `400`  | Invalid JSON, or `message` missing/empty                 |
| `401`  | Missing/invalid Bearer token                             |
| `502`  | gbrain OAuth/MCP/`think` failed (`error` is the message) |

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

# Shared knowledge via gbrain think
curl -s -X POST http://localhost:3000/query \
  -H "Authorization: Bearer demo-key-lily" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is the sandbox verification protocol codename?\"}"

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

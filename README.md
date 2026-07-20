# gbrain-sandbox

Turborepo monorepo: Bun HTTP API (`apps/api`) with **shared knowledge in gbrain** and **personal memory in app Postgres**, plus a minimal Next.js UI (`apps/web`). No per-user git repos or per-user gbrain sources.

## Layout

```
gbrain-sandbox/
├── apps/
│   ├── api/                # Bun HTTP API (@gbrain-sandbox/api) :3000
│   └── web/                # Next.js UI (@gbrain-sandbox/web) :3001
├── packages/
│   └── typescript-config/  # Shared TSConfig
├── shared-source/          # Maintainer knowledge → one gbrain source (repo root)
├── docs/API.md             # Bun HTTP API contract
├── .env                    # gbrain + apps (see .env.example)
├── turbo.json
└── assets/                 # Images (optional)
```

Only `shared-source/` holds maintainer markdown for the shared gbrain source. It is a **normal subdirectory of this monorepo** (one git root — no nested `shared-source/.git`). Personal memory does **not** use git or gbrain sources. Keep `shared-source/` and `.env` at the **repo root** so project-scoped gbrain resolves them.

Requires **gbrain ≥ 0.42.62** (monorepo `--src-subpath` / subdir auto-discovery). On Windows, if `gbrain sync` errors with “resolves outside git repo”, your gbrain build still has a path-separator bug in the scope check — upgrade, or patch `sync.ts` to use `path.sep` instead of hardcoded `/`.

## Architecture

| Layer            | Storage                 | Scope                         | Git?                  |
| ---------------- | ----------------------- | ----------------------------- | --------------------- |
| Shared knowledge | gbrain `shared-source`  | Everyone                      | Yes (maintainer sync) |
| Personal memory  | Postgres `app_memories` | Owner only (`user_id` filter) | No                    |
| Chat turns       | Postgres `app_messages` | Per user (Bun)                | No                    |

```mermaid
%%{init: {'theme': 'neo-dark'}}%%
flowchart TB
  subgraph clients [Clients]
    Web[Next.js :3001]
    Lily[Lily / Bob]
  end

  subgraph bun [Bun API :3000]
    Auth[Auth demo-key]
    Remember["POST /remember"]
    Query["POST /query"]
    Mem[(app_memories FTS)]
    Chat[(app_sessions / app_messages)]
    Build[Build synthesis prompt<br/>chat + personal notes + full pages]
  end

  subgraph maintainer [Maintainer — offline]
    MD[shared-source/*.md]
    Sync["gbrain sync / embed"]
  end

  subgraph gbrain [gbrain serve --http :3131]
    Retrieve[query + get_page<br/>hybrid retrieve + full pages]
  end

  subgraph models [Models]
    Ollama["Ollama nomic-embed-text<br/>EMBEDDING"]
    DeepSeek["DeepSeek via Bun<br/>LLM synthesis"]
  end

  subgraph store [Postgres brain]
    Pages[shared-source pages / chunks]
    Embs[(chunk embeddings)]
  end

  Lily --> Web
  Web --> Auth
  Auth --> Remember
  Auth --> Query

  Remember --> Mem

  Query --> Chat
  Query --> Mem
  Query --> Build
  Build --> Retrieve
  Retrieve --> Pages
  Retrieve --> Embs
  Build --> DeepSeek
  DeepSeek --> Chat

  MD --> Sync
  Sync --> Pages
  Sync --> Ollama
  Ollama --> Embs
```

| Path                        | Embedding (Ollama)                                              | LLM (DeepSeek)                                 |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| Maintainer `sync` / `embed` | Yes — embed shared chunks into the brain                        | No                                             |
| `POST /query` mode `think`  | Yes — hybrid retrieve embeds the question                       | Yes — Bun calls DeepSeek with full page(s)     |
| `POST /remember`            | No — row in `app_memories` only                                 | No                                             |
| Personal notes on query     | No — Postgres FTS, then text injected into the synthesis prompt | Indirect — LLM sees them as part of the prompt |

**Think mode:** load chat history + this user's `app_memories` → gbrain `query` (hybrid) → score-based slug selection → `get_page` for each slug (full body) → Bun synthesizes with DeepSeek → store turn.

**Remember:** insert into `app_memories` for `user_id` only.

**New user:** insert `app_users` row → ready. No `sources add`, no `git init`, no OAuth client per user.

At scale, user count grows **rows** in `app_memories`, not filesystem repos or gbrain sources. Isolation is a hard `user_id` filter. One app-level OAuth client calls gbrain `query` / `get_page` (read scope).

## Prerequisites

- Postgres (`GBRAIN_DATABASE_URL`)
- `gbrain`, `bun`, Ollama (`nomic-embed-text`), DeepSeek API key
- `gbrain serve --http` on port **3131**

## Gbrain: project vs global

gbrain can run **globally** (`~/.gbrain`) or **per project** (`.env` + sources in a repo). This sandbox is **project-scoped** — run `gbrain` commands, including `gbrain serve --http --port 3131`, from **this repo root** so `.env` and `./shared-source` resolve correctly.

## Setup

### 1. Install

```bash
bun install
```

Uses Bun workspaces + Turborepo. From the repo root:

| Script                 | What it runs                                |
| ---------------------- | ------------------------------------------- |
| `bun run dev:api`      | Bun API (`apps/api`) on `:3000`             |
| `bun run dev:web`      | Next.js UI (`apps/web`) on `:3001`          |
| `bun run setup:gbrain` | Register shared-source + OAuth + demo users |
| `bun run check-types`  | Typecheck workspace packages                |

### 2. Environment

Copy `.env.example` to `.env` and fill in values (keep `.env` at the **repo root**).

### 3. Shared source + OAuth (one-time)

```bash
bun run setup:gbrain
```

Registers `shared-source`, syncs it, creates **one** OAuth client (`sandbox-shared`, `read` on shared), stores it in `app_gbrain_auth`, and seeds demo users Lily/Bob. Re-runs skip existing source/OAuth unless you pass `-- --force-oauth`.

### 4. Start gbrain (terminal 1)

```bash
gbrain serve --http --port 3131
```

### 5. Start Bun API (terminal 2)

```bash
bun run dev:api
```

Listens on `http://localhost:3000` (override with `PORT`).

### 6. Start Next.js UI (terminal 3)

```bash
bun run dev:web
```

Opens at `http://localhost:3001`. Server Actions call the Bun API (`API_URL`, default `http://localhost:3000`). Override via `apps/web/.env.local`.

## Bun API (demo auth)

| Endpoint         | Auth                                                    | Body                   |
| ---------------- | ------------------------------------------------------- | ---------------------- |
| `GET /health`    | none                                                    | —                      |
| `POST /query`    | `Authorization: Bearer demo-key-lily` or `demo-key-bob` | `{ "message": "..." }` |
| `POST /remember` | same                                                    | `{ "content": "..." }` |

Request/response shapes, errors, and curl examples: [`docs/API.md`](docs/API.md).

## Maintainer workflow (shared only)

Add or edit markdown under `shared-source/`, commit in **this** repo, then:

```bash
gbrain sync --source shared-source
gbrain embed --stale
```

gbrain walks up from `./shared-source` to the monorepo `.git` and imports only that subdirectory.

## Postgres tables (Bun)

| Table             | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `app_users`       | Demo users + API keys                           |
| `app_gbrain_auth` | One shared OAuth client for gbrain MCP (read)   |
| `app_memories`    | Personal notes (`user_id` + `slug` + `content`) |
| `app_sessions`    | One active thread per user                      |
| `app_messages`    | Chat history                                    |

**`slug`:** short unique id for one memory note per user (e.g. `memory/note-1729123456789`). Auto-assigned on `POST /remember`; same slug for that user updates the row. Injected into the synthesis prompt as `[slug]` for reference.

```sql
SELECT id, api_key FROM app_users;
SELECT user_id, slug, left(content, 80) FROM app_memories ORDER BY created_at DESC LIMIT 10;
SELECT role, left(content, 80) FROM app_messages ORDER BY created_at DESC LIMIT 10;
```

## Test demo

Demo markdown under `shared-source/` is tracked in this repo. After editing pages, commit at the monorepo root, then:

```bash
gbrain sync --source shared-source
gbrain embed --stale
```

**Single-file checks** (`shared-source/test-demo`): protocol codename, vault passphrase, Chief Archivist, etc.

**Cross-file hydrate** — answer is split across three pages (slugs are git-root-relative):

| Slug                             | Fact                                    |
| -------------------------------- | --------------------------------------- |
| `shared-source/north-quay-relay` | callsign `ORION-LATCH` (Pier 7)         |
| `shared-source/duty-roster`      | color token `violet-green` (Mira Quill) |
| `shared-source/heptagon-watch`   | watch count `7`                         |

Ask in **think** mode: _What is the full arming formula for the North Quay Relay?_  
Expected: `ORION-LATCH/violet-green/7`. API console logs every `query` hit (score, ratio vs top, factors) and marks hydrate-selected slugs.

Note: gbrain MCP `think` truncates gathered pages to ~600 characters for its internal LLM ([#2369](https://github.com/garrytan/gbrain/issues/2369)). This sandbox **think mode** avoids that by using `query` + `get_page` + Bun-side DeepSeek synthesis instead.

## Env vars

| Variable                      | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `GBRAIN_DATABASE_URL`         | gbrain + default app DB                                        |
| `APP_DATABASE_URL`            | Bun tables (optional; falls back to `GBRAIN_DATABASE_URL`)     |
| `DEEPSEEK_API_KEY`            | Bun think-mode synthesis (DeepSeek API)                        |
| `GBRAIN_CHAT_MODEL`           | Default synthesis model id (e.g. `deepseek:deepseek-v4-flash`) |
| `HYDRATE_SCORE_RATIO`         | Min score vs top hit to include a page (e.g. `0.65`)           |
| `HYDRATE_MAX_PAGES`           | Max pages to load per think request (e.g. `5`)                 |
| `HYDRATE_MAX_CHARS_PER_PAGE`  | Max chars per hydrated page (e.g. `8000`)                      |
| `HYDRATE_MAX_TOTAL_CHARS`     | Max total hydrated chars per think request (e.g. `24000`)      |
| `GBRAIN_EMBEDDING_MODEL`      | e.g. `ollama:nomic-embed-text`                                 |
| `GBRAIN_EMBEDDING_DIMENSIONS` | e.g. `768`                                                     |
| `GBRAIN_MCP_BASE_URL`         | Default `http://localhost:3131`                                |
| `PORT`                        | Bun API port (default `3000`)                                  |
| `API_URL`                     | Next.js → Bun base URL (default `http://localhost:3000`)       |

## gbrain CLI (direct)

```bash
gbrain sources list
gbrain sync --source shared-source
gbrain embed --stale
gbrain doctor
```

## Out of scope for this demo

- Real user login / signup API (JWT); demo uses hardcoded API keys
- Vector embeddings for personal memory (Postgres FTS + recent fallback)
- Multiple sessions per user
- Rate limits / quotas on `think`
- TLS / production deployment

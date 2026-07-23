# Gbrain setup (nested knowledge repo)

The Bun/web monorepo and the **gbrain knowledge tree** are separate git repositories.

| Repo                                 | Role                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| **This monorepo** (`gbrain-sandbox`) | API, web UI, architecture docs, demo markdown templates |
| **`apps/gbrain`** (nested clone)     | Pure gbrain project: `shared-source/` + local `.env`    |

Run every `gbrain` CLI command from **`apps/gbrain`** so `./.env` and `./shared-source` resolve correctly. The Bun API never reads that `.env`; it only uses root `GBRAIN_MCP_BASE_URL`.

Requires **gbrain ≥ 0.42.62**.

## Greenfield

1. Clone this monorepo and `bun install` at the root.
2. Clone the knowledge repo into `apps/gbrain` (directory must be named `gbrain`):

```bash
cd apps
git clone <YOUR_GBRAIN_KNOWLEDGE_REPO_URL> gbrain
cd ..
```

If you do not have a remote yet, bootstrap locally:

```bash
mkdir apps/gbrain
cd apps/gbrain
git init
cd ../..
```

3. Create `apps/gbrain/.env` from the template below.
4. Postgres: create the knowledge DB, `CREATE EXTENSION vector`, then from `apps/gbrain` run `gbrain apply-migrations --yes` (or `gbrain init --migrate-only`).
5. Inject sandbox demos (tracked in this monorepo under `demos/gbrain-shared-source/`):

```bash
bun run inject:gbrain-demos
```

6. Commit injected pages **inside** `apps/gbrain` (keeps that tree clean for migrations/sync):

```bash
cd apps/gbrain
git add shared-source
git commit -m "Add sandbox demo pages"
```

7. Register source, sync, embed, serve (all from `apps/gbrain`):

```bash
gbrain sources add shared-source --path ./shared-source --federated
gbrain sync --source shared-source --repo ./shared-source --full --no-pull
gbrain embed --stale
gbrain serve --http --port 3131
```

Root convenience (same commands, cwd forced to `apps/gbrain`):

```bash
bun run gbrain:sync
bun run gbrain:serve
```

8. Register an OAuth client, then paste id/secret in the web UI at **`/gbrain-connection`**.

```bash
gbrain auth register-client sandbox-shared \
  --grant-types client_credentials \
  --scopes read \
  --source shared-source \
  --federated-read shared-source
```

Point the Bun API at serve with `GBRAIN_MCP_BASE_URL=http://localhost:3131` in the **repo root** `.env`.

## Environment (`apps/gbrain/.env`)

Create this file locally (do not commit secrets). Template:

```env
# apps/gbrain/.env — gbrain CLI + serve only (not the Bun API)

# Knowledge DB (needs pgvector: CREATE EXTENSION vector;)
GBRAIN_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/gbrain

# Embeddings (Ollama) — shared-source sync/embed
GBRAIN_EMBEDDING_MODEL=ollama:nomic-embed-text
GBRAIN_EMBEDDING_DIMENSIONS=768
```

## Postgres + pgvector

On the **gbrain** database only:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then:

```bash
cd apps/gbrain
gbrain apply-migrations --yes
```

### Build Tools for Visual Studio (Windows)

gbrain embeddings use pgvector. On Windows you compile it with MSVC.

1. Download **[Build Tools for Visual Studio (latest)](https://visualstudio.microsoft.com/downloads)** (under _Tools for Visual Studio_).
2. Select the **Desktop development with C++** workload.
3. Also select **MSVC** x64/x86 Build Tools and a **Windows 11 SDK**.

### Compile pgvector (Windows)

Open **x64 Native Tools Command Prompt for VS** as administrator:

```cmd
set "PGROOT=C:\Program Files\PostgreSQL\18"
cd %TEMP%
git clone --branch v0.8.5 https://github.com/pgvector/pgvector.git
cd pgvector
nmake /F Makefile.win
nmake /F Makefile.win install
```

Adjust `PGROOT` and the clone tag for your Postgres major version and a [pgvector release](https://github.com/pgvector/pgvector/releases). Then `CREATE EXTENSION vector;` on the gbrain database.

If compile fails with missing `postgres.h`, check `PGROOT`. Architecture/`case value` errors: use the **x64** Native Tools prompt, `nmake /F Makefile.win clean`, rebuild.

### Migration tip (`v0.32.2` silent failure)

`gbrain apply-migrations` can print `Migration v0.32.2 reported status=failed` with no detail when the **knowledge** git tree is dirty ([gbrain#921](https://github.com/garrytan/gbrain/issues/921)). Keep commits clean **inside** `apps/gbrain` (this is why that folder is its own repo). Monorepo WIP under the root no longer affects that check.

## Nested repo layout

After clone + inject:

```
apps/gbrain/          # separate .git (ignored by monorepo)
├── .env              # local only
└── shared-source/    # knowledge markdown
    ├── duty-roster.md
    ├── heptagon-watch.md
    ├── north-quay-relay.md
    └── test-demo.md
```

The knowledge remote should contain **`shared-source/`** at its root (what becomes `apps/gbrain/shared-source` after clone). Do not nest `apps/gbrain/...` paths inside that remote.

Demo markdown **source of truth** for this sandbox lives in the monorepo at `demos/gbrain-shared-source/`. Re-run `bun run inject:gbrain-demos` after updating demos, then commit inside `apps/gbrain` and sync.

## OAuth client → Bun

gbrain does not push credentials to the app. After `register-client`, open **`/auth` → Connect to gbrain** (`/gbrain-connection`) and save the client id/secret. Bun stores them in `app_gbrain_auth` and verifies with gbrain `POST /token` (not `/health`).

These credentials are **not** app user API keys and are **not** the Admin Token from `gbrain serve`.

## Wipe gbrain database (manual)

No gbrain “nuke” CLI. Drop/recreate the knowledge DB in pgAdmin / `psql`, then `CREATE EXTENSION vector`, `apply-migrations`, sync, and re-register OAuth if needed. Bun **Nuke App DB** only wipes `APP_DATABASE_URL`; re-enter OAuth on `/gbrain-connection` afterward.

## Demo pages

Slugs are relative to the **nested** git root (e.g. `shared-source/test-demo`).

| Slug                             | Fact                                    |
| -------------------------------- | --------------------------------------- |
| `shared-source/test-demo`        | protocol codename, vault passphrase, …  |
| `shared-source/north-quay-relay` | callsign `ORION-LATCH` (Pier 7)         |
| `shared-source/duty-roster`      | color token `violet-green` (Mira Quill) |
| `shared-source/heptagon-watch`   | watch count `7`                         |

Ask-mode check: _What is the full arming formula for the North Quay Relay?_ → `ORION-LATCH/violet-green/7`.

This sandbox does **not** call gbrain MCP `think` (its gather path truncates page bodies to about 600 characters). Ask mode uses `query` + `get_page` + Bun/DeepSeek (see root README).

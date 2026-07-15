# gbrain-sandbox

Project-level gbrain brain repo. Run all `gbrain` commands from this root (Bun auto-loads `.env` from cwd).

## Layout

```
gbrain-sandbox/
├── .env              # gbrain-readable config (see below)
├── knowledge/        # Markdown docs
├── assets/           # Images referenced from knowledge/
└── README.md
```

Put all markdown in `knowledge/` only — gbrain sync is scoped to that folder, not the project root. Reference images from `assets/` like:

```markdown
![diagram](../assets/diagram.png)
```

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Pull the embedding model: `ollama pull nomic-embed-text`
3. Register `knowledge/` and do the first import:

```bash
gbrain sources add sandbox --path ./knowledge
gbrain sync
```

## Commands

**`gbrain sources add sandbox --path ./knowledge`** — register `knowledge/` as source `sandbox` (tells `sync` where markdown lives). Does not import content.

**`gbrain sources remove sandbox --confirm-destructive`** — delete source `sandbox` and all its pages from the brain DB. Use when re-registering with a different path; does not delete files on disk.

**`gbrain import ./knowledge`** — one-shot bulk import of `knowledge/` (alternative to `sync` for first load).

**`gbrain embed --stale`** — generate vector embeddings for imported chunks that don't have them yet (required for semantic search).

**`gbrain sync`** — incremental sync of `knowledge/`. Picks up added/changed/deleted markdown since the last run, imports the diff, then embeds stale chunks. Use for day-to-day updates. Run `gbrain sync --watch` to keep syncing on an interval.

## Env vars gbrain reads

| Variable | Purpose |
|---|---|
| `GBRAIN_DATABASE_URL` | Postgres connection (use this, not `DATABASE_URL`) |
| `DEEPSEEK_API_KEY` | Chat API key |
| `GBRAIN_CHAT_MODEL` | Chat model (e.g. `deepseek:deepseek-v4-flash`) |
| `GBRAIN_EMBEDDING_MODEL` | Embedding model (e.g. `ollama:nomic-embed-text`) |
| `GBRAIN_EMBEDDING_DIMENSIONS` | Embedding dimensions (e.g. `768`) |

## Local image storage (optional)

For `gbrain files upload` / binary storage, configure once:

```bash
gbrain config set storage '{"backend":"local","bucket":"brain-files","localPath":"./assets"}'
```

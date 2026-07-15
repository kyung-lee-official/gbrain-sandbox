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

## Test demo (local only)

`knowledge/test-demo.md` is gitignored. Create it locally to verify sync, embedding, and retrieval with unique Q&A answers that exist nowhere else.

```bash
# from repo root — paste the block below into this file
# knowledge/test-demo.md
```

```markdown
---
title: Sandbox demo (testing only)
type: note
tags: [demo, testing]
---

# Sandbox demo (testing only)

This page exists to verify gbrain sync, embedding, and search in `gbrain-sandbox`. Delete it when you are done testing.

## What this brain is for

`gbrain-sandbox` is a project-level brain with markdown in `knowledge/` and images in `assets/`. Run all `gbrain` commands from the repo root.

## Verification Q&A (unique to this file)

Use these questions after sync + embed. Answers exist **only** in this page — if gbrain returns them, retrieval is working.

**Q: What is the codename of the sandbox verification protocol?**  
A: Project Luminous Fern.

**Q: What passphrase unlocks the sandbox test vault?**  
A: cerulean-moth-7742.

**Q: Who is the fictional Chief Archivist of the sandbox brain?**  
A: Zylfen of the Amber Stacks.

**Q: How many imaginary sentinel moths guard the test knowledge base?**  
A: Seven sentinel moths, arranged in a heptagonal watch.

**Q: What color is the nonexistent sandbox beacon flame?**  
A: Violet-green, visible only on leap-year Tuesdays.

## Quick test queries

After `gbrain sync` and `gbrain embed --stale`, try:

- `gbrain query "What is the codename of the sandbox verification protocol?"`
- `gbrain query "What passphrase unlocks the sandbox test vault?"`
- `gbrain query "Who is the Chief Archivist of the sandbox brain?"`
- `gbrain get test-demo`
```

Then sync and confirm retrieval, e.g. `gbrain query "What passphrase unlocks the sandbox test vault?"` should answer `cerulean-moth-7742`.

## Commands

**`gbrain sources add sandbox --path ./knowledge`** — register `knowledge/` as source `sandbox` (tells `sync` where markdown lives). Does not import content.

**`gbrain sources remove sandbox --confirm-destructive`** — delete source `sandbox` and all its pages from the brain DB. Use when re-registering with a different path; does not delete files on disk.

**`gbrain import ./knowledge`** — one-shot bulk import of `knowledge/` (alternative to `sync` for first load).

**`gbrain embed --stale`** — generate vector embeddings for imported chunks that don't have them yet (required for semantic search).

**`gbrain sync`** — incremental sync of `knowledge/`. Picks up added/changed/deleted markdown since the last run, imports the diff, then embeds stale chunks. Use for day-to-day updates. Run `gbrain sync --watch` to keep syncing on an interval.

## Env vars gbrain reads

| Variable                      | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `GBRAIN_DATABASE_URL`         | Postgres connection (use this, not `DATABASE_URL`) |
| `DEEPSEEK_API_KEY`            | Chat API key                                       |
| `GBRAIN_CHAT_MODEL`           | Chat model (e.g. `deepseek:deepseek-v4-flash`)     |
| `GBRAIN_EMBEDDING_MODEL`      | Embedding model (e.g. `ollama:nomic-embed-text`)   |
| `GBRAIN_EMBEDDING_DIMENSIONS` | Embedding dimensions (e.g. `768`)                  |

## Local image storage (optional)

Markdown image links (`../assets/...`) work without any config — files stay on disk in git.

The command below is only for gbrain's **binary file API** (`gbrain files upload`, cloud redirects, large files you don't want in git). Skip unless you need that.

```bash
gbrain config set storage '{"backend":"local","bucket":"brain-files","localPath":"./assets"}'
```

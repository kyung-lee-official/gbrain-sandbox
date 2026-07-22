---
title: Sandbox demo (testing only)
type: note
tags: [demo, testing]
---

# Sandbox demo (testing only)

This page exists to verify gbrain sync, embedding, and search in `gbrain-sandbox`. Delete it when you are done testing.

## What this brain is for

`gbrain-sandbox` keeps knowledge markdown in the nested **gbrain** git checkout at `apps/gbrain/shared-source/`. Run all `gbrain` commands from `apps/gbrain`. Demo pages are copied here by `bun run inject:gbrain-demos` from the monorepo.

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
- `gbrain get shared-source/test-demo`

## Cross-file arming (separate pages)

Knowledge for the North Quay Relay is **split** across `north-quay-relay.md`, `duty-roster.md`, and `heptagon-watch.md`.

**Q: What is the full arming formula for the North Quay Relay?**  
A: `ORION-LATCH/violet-green/7` (callsign + color token + watch count; one piece per file).

Use think mode after sync + embed — hydrate should load multiple slugs when scores stay above `HYDRATE_SCORE_RATIO`.

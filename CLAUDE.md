# CLAUDE.md

Project name: **dailydigest** (personal foreign policy and political science intelligence app).

Read `SPEC.md` before any task. It is the source of truth for scope, data model, pipeline and milestones. If a request conflicts with the spec, flag it before coding.

## Stack

- Web app: Next.js (App Router, TypeScript, strict mode), deployed on Netlify
- Database, auth, storage: Supabase (Postgres, pgvector, pg_trgm, Row Level Security)
- Pipeline worker: TypeScript package in `/worker`, run by GitHub Actions (scheduled and `workflow_dispatch`)
- Email: Resend with React Email templates
- LLMs: Anthropic (primary) and OpenAI (optional), behind a provider abstraction in `/packages/llm`
- Embeddings: multilingual model, configurable (see SPEC section 7)

## Repo layout

```
/apps/web          Next.js app
/worker            ingestion and processing pipeline
/packages/db       schema, migrations, typed queries
/packages/llm      provider abstraction, prompts, JSON schemas
/packages/email    React Email templates
/config            models.yaml, sources.seed.yaml, limits.yaml
/evals             golden sets and evaluation scripts
```

## Rules

1. Never hardcode model names, prices or thresholds. They live in `/config/*.yaml`.
2. Every LLM call goes through `/packages/llm`, returns JSON validated with Zod, and is logged to `llm_calls` with tokens and cost.
3. Every pipeline stage is idempotent and resumable. Re-running a stage for the same day must not duplicate rows or emails.
4. Pipeline stages work in batches through the `jobs` table. No single step may assume it can process everything in one call.
5. Store embeddings for every item from day one, even before features use them.
6. Respect paywalls and robots.txt. Store extracted text privately for analysis only; the UI and emails show our own summary plus a link to the original.
7. Migrations only via `/packages/db/migrations`. Never edit the database by hand.
8. Every table has `owner_id` and RLS, even though there is one user today.
9. Write tests for parsers, dedup, clustering and scoring logic. Add an eval run before changing any prompt.

## Writing rules for generated content (briefs, summaries, emails)

- Output language: Turkish by default (configurable per user). Keep original headlines in their source language.
- No em dashes. Use commas, colons or full stops.
- Plain, analytical tone. No hype, no filler openers, no "in today's fast-moving world" phrasing. It must not read as AI-generated.
- Never state a claim that is not in the source items. Every factual sentence in a brief must be traceable to at least one item id.
- UI copy and code comments: British English where English is used.

## Commands

- `pnpm dev` web app locally
- `pnpm worker:run --stage=<name> --date=<YYYY-MM-DD>` run one pipeline stage
- `pnpm worker:run --all` full daily run
- `pnpm eval --suite=<name>` run evals
- `pnpm db:migrate` apply migrations

## Working style

- Build milestone by milestone (SPEC section 14). Finish acceptance criteria before moving on.
- Before large changes, write a short plan in the PR description.
- When unsure about product behaviour, ask. Do not invent features outside the spec.

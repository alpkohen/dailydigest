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
4. Pipeline stages work in batches (bounded LLM batch sizes, paged reads, chunked writes). No single step may assume it can process everything in one call. The daily path is ingest → match → group → compose_brief → deliver (2026-10-04 rebuild); do not reintroduce per-item full-text extraction, per-item × per-topic LLM scoring, or the `jobs` queue on that path.
5. Never drop an article silently: items are stored with feed metadata only, and unmatched items stay searchable until retention. Topic matching: one batched AI call decides ("include when unsure"); keyword hits are only recorded as the reason, and count on their own only when the AI call fails (2026-10-06: broad keywords like "Erdoğan" were pulling domestic news into unrelated topics). Embeddings are optional, not required for every item.
5a. Only one AI coding agent works on this repo at a time. Test pipeline changes locally (`pnpm worker:run`) before relying on scheduled CI runs.
6. Respect paywalls and robots.txt. Store extracted text privately for analysis only; the UI and emails show our own summary plus a link to the original.
7. Migrations only via `/packages/db/migrations`. Never edit the database by hand.
8. Every table has `owner_id` and RLS, even though there is one user today.
9. Write tests for parsers, dedup, clustering and scoring logic. Add an eval run before changing any prompt.

## Current setup (decided with the owner, keep unless they change it)

- Top priority: never miss an article from a source on a chosen topic. Every source we don't collect is listed, with reason and option, on the Sources page (`not_collected` in `config/sources.seed.yaml`, plus failing or muted sources). Update that list when a source breaks or is fixed.
- The app is the main product; the email (fixed 05:30 Istanbul) is secondary.
- Schedule: collect every 2 hours fetches sources only (no AI; some feeds hold just 2 to 6 hours of articles). AI stages (match, group, suggest_sources) run every `ai_interval_hours` (6). The daily run at 02:30 UTC does everything plus the brief and email.
- Sources: RSS, sitemap (with optional `link_pattern`) and listing-page connectors. Respect robots.txt and site terms; never bypass Cloudflare or IP blocks (Reuters, AP, Lawfare, IISS, ISW, EDAM, ORSAM are blocked; the agreed route for them is an email-newsletter inbox, not built yet).
- Topics: the owner or Evren adds topics in the app. `suggest_sources` proposes checked feeds per topic (topic page, Add / Dismiss); coverage-gap warnings show on the topics pages and in the email.
- App shows "Updated <day time>" and New / Updated badges per event, and "Why it's here" (AI / keywords) on the event page. The framing is one line per topic from event titles (no AI paragraph). No lead card and no side rail on the Today page; watch_ingest is off (its search results were mostly unrelated sites, Exa is paid).
- Costs: daily LLM cap 2 USD (`limits.yaml`); typical spend is about 0.07 to 0.10 USD a day.
- Production and local share one Supabase database: seed changes and scripts hit production immediately. The owner merges PRs; merging can close a PR stacked on the merged branch, so base new PRs on `main`.
- Keep things simple: the owner prefers small, working changes over elaborate ones.

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

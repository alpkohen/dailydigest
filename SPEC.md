# dailydigest: Product and Technical Specification

Version 1.0 | Owner: Alp | Status: ready for build

## 1. Purpose

dailydigest is a personal intelligence desk for foreign policy and political science. Every night it reads domestic and international news, think tank output and academic journals, keeps only what matters for the owner's topics and questions, groups coverage of the same event across outlets and languages, and produces a Turkish morning brief by email plus a richer web app for depth, history and questions.

It is not a news feed. The unit of value is a **story** (one development, many sources), explained in context, compared across perspectives and remembered over time.

### Design principles

1. **Signal over volume.** A good day is 6 to 12 stories, not 60 links.
2. **Nothing without a source.** Every sentence in a brief traces back to stored items.
3. **Memory.** The system knows what it told you yesterday and last month.
4. **Perspective.** The same event as seen by Turkish and foreign outlets, and by different camps within each.
5. **Owner in control.** Topics, questions, sources and weights are all editable. Feedback changes behaviour.
6. **Cost aware.** Cheap models filter, strong models think. Hard budget caps.

## 2. Users and tenancy

- One owner today. Supabase Auth (magic link) with an email allowlist.
- Schema is multi-tenant ready: every row has `owner_id`, RLS on every table. Opening to other users later must require no schema change.
- User settings: output language (default `tr`), time zone (default `Europe/Istanbul`), brief delivery time (default 07:00), quiet hours for alerts, daily LLM budget.

## 3. Core concepts

| Concept | Meaning |
|---|---|
| Source | A publication, feed or API endpoint (e.g. Foreign Affairs RSS, OpenAlex journal query) |
| Item | One article, report, paper or post fetched from a source |
| Story | A cluster of items about the same development |
| Topic | A standing area of interest, defined by a description, queries and exclusions |
| Question | An analytical question the owner wants tracked over time |
| Watch | A person or institution whose new output is always surfaced |
| Perspective group | A user-defined label on sources, used for framing comparison (e.g. "TR government-leaning", "TR opposition/independent", "Western", "Regional", "Russian/Chinese state") |
| Brief | A generated daily, weekly or alert document built from stories |
| Dossier | An on-demand deep research report on a story, topic or question |

## 4. Feature set

### 4.1 Topics

- Create a topic by typing one sentence. The system drafts: a description (what is in, what is out), Turkish and English search queries, suggested sources, exclusion terms. Owner edits and saves.
- Per topic settings: priority (high, normal, low), frequency (daily, weekly digest only, alerts only), alert on critical (yes/no), languages, active/paused.
- Topic detail page: current summary, timeline of stories, most cited sources, feedback history, precision stats (what share of surfaced items were marked relevant).
- Delete archives the topic; items stay in the archive.

### 4.2 Questions (thesis tracking)

- Owner writes an analytical question, e.g. "Is Europe building defence capacity independent of the US?"
- Each run, stories are tested for relevance to each question. Relevant stories are logged as evidence with a short note on how they bear on the question (supports, complicates, neutral context).
- Weekly, the system writes a question update: what new evidence arrived, how the picture shifted, what remains unknown. It must present the evidence, not deliver a verdict; confidence language is required ("limited evidence", "several independent sources").
- Question page: evidence log, weekly updates history, linked stories.

### 4.3 Watches (people and institutions)

- Follow an author, think tank, journal or official (e.g. a named scholar, Chatham House, a foreign ministry).
- Implemented via their feeds, author pages, OpenAlex author ids, or search queries.
- New output appears in a "From your watchlist" section regardless of topic scoring.

### 4.4 Sources

- Source registry with: name, type (rss, api_openalex, api_gdelt, api_exa, sitemap, scrape), URL or query, country, language, perspective group, quality weight (0 to 1), paywall flag, fetch frequency, active flag, health status.
- Seeded from `/config/sources.seed.yaml`. Owner can add, edit, mute and re-weight in the UI.
- Source health: last successful fetch, error count, items per day. Broken feeds are flagged on the System page.
- Source suggestions: monthly, the system proposes new sources that appeared frequently in Exa or GDELT results for the owner's topics.

### 4.5 Ingestion

Channels:

1. **RSS/Atom** for news, magazines, think tanks, Substack newsletters.
2. **Exa** semantic search per topic query, for analysis pieces outside the registry.
3. **GDELT** document API per topic, for broad and regional press coverage.
4. **OpenAlex** for new journal articles by concept, journal and watched author. Crossref as fallback for metadata.
5. **Brave Search** (optional) as a second web search provider.

Rules: fetch window since last successful run plus overlap; respect robots.txt and rate limits; store raw payload; extract full text where freely available (Readability based extractor); for paywalled items keep title, standfirst and metadata only.

### 4.6 Processing

See section 6 for the pipeline. Outputs per item: language, cleaned text, embedding, topic relevance scores, story assignment. Outputs per story: title, summary, importance tier, novelty flag, perspective comparison, key entities, timeline links.

### 4.7 Daily brief (email and app)

Delivered at the owner's time. Structure:

1. **Headline block:** the day in three sentences.
2. **Critical stories** (tier 1): for each, what happened, why it matters, what changed since last coverage, what to watch next, source count and perspective note.
3. **Follow-up stories** (tier 2): shorter, two to three sentences each.
4. **Worth reading:** best analysis and long reads of the day, each with a one-sentence reason.
5. **New research:** journal articles from OpenAlex, with one-sentence plain summary of the argument.
6. **From your watchlist.**
7. **Outside your radar:** one item outside current topics that the system judges relevant to the owner's interests, with a reason.
8. **Question pulse:** one line per question that received new evidence today.

Email is short and scannable; each story links to its app page. One-click actions in email via signed links: save, not relevant, less like this, mute source.

### 4.8 Story page (app)

- Executive summary
- What changed since the previous related story
- Timeline of related stories (linked via entity and embedding similarity over past 90 days)
- **Framing comparison:** how each perspective group covered it, what each emphasised or left out. Shown only when at least two groups have coverage.
- All source items with language, outlet, perspective group, link
- Linked topics and questions
- **Ask about this story:** chat grounded in the story items plus archive retrieval
- Actions: save, add to weekend reading, request dossier, feedback

### 4.9 Instant alerts

- Hourly light run on high-priority topics with alerts enabled.
- Sends an email only when a new story scores tier 1 and is not a continuation already covered.
- Limits: maximum 3 alerts per day, none during quiet hours (queued into the morning brief instead).

### 4.10 Weekly review (Sunday morning)

- Topics that heated up or went quiet (story counts and tiers versus four-week average)
- Top five stories of the week
- Question updates
- Weekend reading list: saved items plus up to five system picks, each with estimated reading time and why it is worth it

### 4.11 Archive and Ask

- Full archive of items and stories, searchable with hybrid search: pgvector similarity plus Postgres full text (Turkish and English configurations) plus filters (topic, date, source, perspective group, language).
- **Ask the archive:** natural language questions answered only from stored items, with inline citations to item ids and dates. If the archive lacks evidence, the answer says so.
- Example: "How has EU language on Turkey's accession changed over the last six months?"

### 4.12 Dossiers

- On-demand deep report on a story, topic or question.
- Combines archive retrieval with live web research (Claude web search tool or Exa), runs as a background job, stores the result as a document with sources.
- Structure: background, current state, key actors and positions, competing interpretations, open questions, sources.

### 4.13 Reading list

- Saved items and stories, tags, read/unread, notes.
- Export to Markdown.

### 4.14 Feedback and learning

- Signals: relevant, not relevant, less like this, more from this source, mute source, saved, opened, time on page.
- Effects:
  - Per topic, the most recent 20 positive and 20 negative items are injected as few-shot examples into the relevance prompt.
  - Source weights drift slowly with feedback (bounded, owner can lock a weight).
  - Topic precision is tracked and shown; a topic falling below 50 percent precision triggers a suggestion to refine its description.

### 4.15 System page

- Pipeline runs with stage status, durations, errors, retry button
- LLM usage and cost by day, stage and model; budget remaining
- Source health
- Eval results history

## 5. Architecture

```
            ┌────────────────────────── GitHub Actions ──────────────────────────┐
 Sources →  │ ingest → extract → embed → dedup → cluster → score → enrich → brief │ → Resend
 (RSS, Exa, │                     (batched via jobs table)                        │
 GDELT,     └───────────────────────────────┬────────────────────────────────────┘
 OpenAlex)                                  │
                                   Supabase Postgres
                              (pgvector, full text, RLS)
                                            │
                             Next.js on Netlify (app, Ask, settings)
                                            │
                       Netlify background functions (Ask, dossier trigger)
```

Decisions:

- **Worker on GitHub Actions**, not Netlify scheduled functions (short execution limit) and not a single Edge Function (time limits on long LLM batches). Actions gives long runtimes and logs for free at this scale.
- Schedule: nightly full run starting around 04:30 Istanbul time; hourly alert run 06:00 to 23:00. GitHub cron can start late, so the brief is generated early and the email is sent with Resend scheduled delivery at the owner's chosen time.
- The app triggers on-demand jobs (dossier, reprocess) via the GitHub `workflow_dispatch` API, or via a Netlify background function for short tasks such as Ask.
- `jobs` table acts as a queue: each stage enqueues batches, workers claim with `FOR UPDATE SKIP LOCKED`, failed batches retry with backoff up to 3 times.

## 6. Pipeline

Each stage reads from and writes to the database, is idempotent, and processes batches.

1. **Ingest.** Fetch all active sources and topic queries. Insert items with canonical URL (tracking parameters stripped). Unique constraint on `(owner_id, canonical_url)`.
2. **Extract.** Full text extraction for non-paywalled items. Detect language. Compute text hash and SimHash.
3. **Embed.** Multilingual embedding of title plus first ~500 words.
4. **Dedup.** Mark near duplicates (same wire copy republished): SimHash distance below threshold or cosine above 0.95 within 48 hours. Duplicates are kept but linked to a canonical item.
5. **Relevance.** Cheap model scores each canonical item against each active topic whose embedding pre-filter passes (cosine above a per-topic threshold, to avoid scoring everything against everything). Output per topic: score 0 to 10, one-line reason. Items scoring below threshold everywhere are archived as not relevant (still searchable).
6. **Cluster.** For each relevant item, find candidate stories from the last 72 hours by embedding similarity to story centroid. Above high threshold: attach. Between thresholds: mid-tier model confirms "same development or not". Below: new story. Cross-lingual matching is required, so the embedding model must be multilingual.
7. **Score stories.** Mid-tier model assigns importance tier (1 critical, 2 follow, 3 interesting) and novelty (new development, continuation with new facts, repetition). Final rank combines tier, novelty, topic priority, source weights and source count. Repetitions with no new facts are dropped from the brief.
8. **Enrich.** For stories that will appear in the brief: summary, what changed (compared with linked prior stories), what to watch, entities, framing comparison, question evidence notes. Strong model.
9. **Research layer.** OpenAlex results scored and summarised separately (argument, method, relevance), since academic items rarely cluster with news.
10. **Compose brief.** Strong model writes the headline block and orders sections from structured story data. A validator checks that every story referenced exists and every citation id is real, and scans for banned patterns (em dashes, hype phrases).
11. **Deliver.** Render React Email, send via Resend, store the brief and delivery status.

Target volumes: 500 to 2,000 items fetched per day, 100 to 300 scored as relevant, 20 to 40 stories, 6 to 12 in the brief.

## 7. LLM and embedding layer

- Provider abstraction with three roles, configured in `/config/models.yaml`:
  - `fast`: classification, relevance, language, extraction (e.g. Claude Haiku class)
  - `mid`: cluster confirmation, story scoring
  - `strong`: enrichment, brief composition, question updates, dossiers, Ask
- Anthropic is the default for all roles; OpenAI can be assigned per role. Switching must be a config change.
- Embeddings: a multilingual model that handles Turkish and English in one vector space. Candidates to evaluate: Voyage multilingual, OpenAI text-embedding-3-large, Cohere multilingual. Pick by eval (section 12), store the model name with every vector, support re-embedding.
- All calls use structured output (JSON schema), validated with Zod; one retry on validation failure.
- Prompt caching for stable system prompts and topic definitions.
- Budget: daily cap in settings; when 80 percent is reached, enrichment falls back to `mid`; at 100 percent, the pipeline completes scoring and sends a reduced brief.

### Prompt inventory (`/packages/llm/prompts`)

| Prompt | Role | Input | Output |
|---|---|---|---|
| topic_draft | strong | one-sentence topic | description, queries_tr, queries_en, exclusions, suggested sources |
| relevance | fast | item, topic definition, few-shot feedback examples | score, reason |
| same_story | mid | item, story summary and sample items | same: bool, confidence |
| story_score | mid | story items, prior related stories | tier, novelty, rationale |
| story_enrich | strong | story items, prior stories, perspective groups | summary, what_changed, why_it_matters, watch_next, framing[], entities[] |
| question_evidence | mid | story, question | relevant, stance, note |
| question_update | strong | week's evidence log | update text with confidence language |
| research_summary | fast | paper metadata and abstract | argument, method, relevance |
| brief_compose | strong | ranked structured stories | headline block, section ordering, final text |
| outside_radar | mid | candidate stories not in topics, owner interest profile | pick, reason |
| ask | strong | question, retrieved items | answer with citations |
| dossier | strong | subject, archive retrieval, web results | structured report |

## 8. Data model (Postgres)

All tables: `id uuid pk`, `owner_id uuid`, `created_at`, `updated_at`, RLS by `owner_id`.

- `profiles`: language, timezone, brief_time, quiet_hours, daily_budget_usd, interest_profile (text, generated and editable)
- `sources`: name, type, url_or_query, country, language, perspective_group_id, weight, weight_locked, paywalled, fetch_interval, active, health_status, last_fetched_at, error_count
- `perspective_groups`: name, description, colour
- `topics`: name, description, queries_tr[], queries_en[], exclusions[], priority, frequency, alerts_enabled, languages[], active, embedding, relevance_threshold
- `questions`: text, active, embedding
- `watches`: kind (person, institution, journal), name, identifiers jsonb (feeds, openalex ids, queries)
- `items`: source_id, canonical_url, url, title, standfirst, author, published_at, language, text, text_hash, simhash, paywalled, raw jsonb, embedding vector, embedding_model, canonical_item_id (for duplicates), status
- `item_topic_scores`: item_id, topic_id, score, reason, model
- `stories`: title, summary, what_changed, why_it_matters, watch_next, framing jsonb, entities jsonb, tier, novelty, rank_score, centroid vector, first_seen_at, last_updated_at, status
- `story_items`: story_id, item_id
- `story_links`: story_id, related_story_id, relation (continuation, related)
- `story_topics`: story_id, topic_id
- `question_evidence`: question_id, story_id, stance, note
- `question_updates`: question_id, period_start, period_end, text
- `research_items`: item_id, openalex_id, doi, journal, authors jsonb, argument, method, relevance
- `briefs`: kind (daily, weekly, alert), period_date, content jsonb, html, sent_at, resend_id, status
- `brief_stories`: brief_id, story_id, section, position
- `feedback`: target_type (item, story, source), target_id, signal, context (email, app)
- `reading_list`: item_id or story_id, tags[], notes, read_at
- `dossiers`: subject_type, subject_id, prompt, content jsonb, status
- `ask_threads`, `ask_messages`: scope (archive, story), messages with citations jsonb
- `jobs`: stage, run_id, payload jsonb, status, attempts, error, locked_at
- `pipeline_runs`: kind, started_at, finished_at, status, stats jsonb
- `llm_calls`: run_id, stage, prompt_name, model, input_tokens, output_tokens, cost_usd, latency_ms, ok
- `evals`: suite, config jsonb, metrics jsonb

Indexes: HNSW on embeddings, GIN full text on items (Turkish and English configs), trigram on titles, btree on published_at and status.

## 9. Email

- React Email templates: daily, weekly, alert. Turkish copy. Plain-text alternative always included.
- Subject pattern: `dailydigest | 27 Eylül | 3 kritik gelişme` (numbers and counts from data).
- Width and typography for comfortable phone reading; no images required; dark-mode safe.
- Signed feedback links (HMAC, expiry 14 days) hit an API route and redirect to a small confirmation page.
- Deliverability: verified sending domain, SPF, DKIM, DMARC.

## 10. App screens

1. **Today:** the current brief as interactive cards; filters by topic and tier.
2. **Story:** as in 4.8.
3. **Topics:** list with priority, frequency, precision, last activity; add, edit, pause, delete. Topic detail page.
4. **Questions:** list, evidence log, weekly updates.
5. **Watchlist.**
6. **Sources:** registry, health, perspective groups, weights, suggestions.
7. **Archive:** search and filters; Ask the archive.
8. **Reading list** and weekend picks.
9. **Dossiers.**
10. **Briefs history:** past daily, weekly and alert briefs.
11. **Settings:** language, time zone, delivery time, quiet hours, budget, models per role.
12. **System:** runs, costs, errors, evals.

Responsive, mobile first, light and dark themes. Keyboard shortcuts on desktop (j/k to move between stories, s to save, x for not relevant).

## 11. Non-functional requirements

- **Reliability:** a failed stage never blocks the brief entirely; the composer works with whatever stories are ready and notes gaps on the System page.
- **Latency:** app pages under 1 second for cached data; Ask answers stream.
- **Cost:** target monthly LLM plus API spend is set in `limits.yaml`; the System page shows projected month-end cost.
- **Security:** secrets in GitHub and Netlify environment variables; service role key only in the worker; RLS tested.
- **Legal and ethics:** personal use; no redistribution of full text; respect robots.txt and paywalls; attribute every item.
- **Observability:** structured logs per run; alert email to the owner if the nightly run fails.

## 12. Evaluation

- `/evals/relevance`: 100 to 200 labelled items per topic (owner labels in a simple UI). Metrics: precision and recall at the chosen threshold.
- `/evals/clustering`: labelled pairs (same story or not), including Turkish-English pairs. Metric: pairwise F1.
- `/evals/embeddings`: compare candidate embedding models on the clustering set before choosing.
- `/evals/brief`: checklist grader on stored briefs: every claim cited, no banned patterns, no duplicate stories, length within limits.
- Any prompt or model change must run the relevant eval and store the result.

## 13. Configuration files

- `models.yaml`: roles to provider and model, embedding model, prices per million tokens (owner updates), fallbacks.
- `limits.yaml`: daily budget, max items per source per run, thresholds (relevance, clustering high and low, dedup), alert caps.
- `sources.seed.yaml`: initial source registry (feed URLs must be verified during milestone 1).

## 14. Build plan (milestones)

Full scope is built in order. Each milestone ends with its acceptance criteria met and a working deploy.

| # | Milestone | Acceptance criteria |
|---|---|---|
| M0 | Scaffold | Monorepo, Supabase project, migrations for all tables, RLS, auth with allowlist, Netlify deploy, GitHub Actions skeleton, config loading, `llm_calls` logging |
| M1 | Sources and ingestion | Seed sources imported and verified, RSS, Exa, GDELT, OpenAlex connectors, canonical URL dedup, extraction, language detection, source health; one night's run stores 500+ items |
| M2 | Embeddings, dedup, relevance | Embedding eval done and model chosen, near-duplicate linking, topic pre-filter and relevance scoring, topic creation flow with drafted queries |
| M3 | Stories | Incremental clustering with cross-lingual matching, story scoring, links to prior stories; clustering eval F1 recorded |
| M4 | Daily brief | Enrichment, research layer, composer with validator, React Email template, scheduled Resend delivery at owner time |
| M5 | Core app | Today, Story, Topics, Sources, Briefs history, Settings screens |
| M6 | Feedback loop | Email and app feedback, few-shot injection, source weight drift, topic precision stats |
| M7 | Questions, watchlist, outside radar, reading list | Evidence logging, weekly question updates, watchlist section, outside radar pick, reading list and weekend picks |
| M8 | Archive and Ask | Hybrid search, Ask the archive with citations, Ask about this story |
| M9 | Alerts and weekly review | Hourly alert run with caps and quiet hours, Sunday weekly review |
| M10 | Dossiers | On-demand research job, report page |
| M11 | System and hardening | System page, cost projection, failure alerts, eval dashboard, performance pass |

## 15. Open decisions for the owner

1. Perspective groups: final list and which sources belong to each.
2. Initial topics and questions (5 to 10 topics, 2 to 4 questions).
3. Monthly budget ceiling.
4. Brief language: fully Turkish, or Turkish with English research summaries.
5. Whether Brave Search is added alongside Exa.
6. Custom domain and sending domain.

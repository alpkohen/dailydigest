/**
 * One-off cleanup for the 2026-10-06 matching change (AI decides, keywords
 * are only the reason). Re-asks the AI about every article matched by a
 * keyword in the last N days and keeps the topic only where the AI agrees.
 * Events left without any topic are closed and their articles become
 * 'not_relevant' (still searchable). Dry run by default.
 *
 * Usage: pnpm exec tsx scripts/rematchKeywordOnly.ts [--days=7] [--apply]
 */
import { createServiceRoleClient } from "@dailydigest/db";
import { buildTopicMatchPrompt, callLlm, topicMatchSchema } from "@dailydigest/llm";
import { loadWorkerConfig } from "../src/config.js";
import { loadEnv } from "../src/env.js";
import { compileKeywords, matchedKeywords } from "../src/lib/keywordMatch.js";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`));
const DAYS = Number(arg("days")?.split("=")[1] ?? 7);
const APPLY = Boolean(arg("apply"));

async function main() {
  const env = loadEnv();
  const { models, limits } = await loadWorkerConfig();
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  const { data: topicRows } = await db.from("topics").select("id, name, description, keywords, exclusions").eq("owner_id", env.OWNER_ID).eq("active", true);
  const topics = (topicRows ?? []).map((t) => ({ ...t, compiled: compileKeywords(t.keywords ?? [], t.exclusions ?? []) }));

  // Keyword-only scores (the old rule wrote reason 'keyword').
  const scores: { item_id: string; topic_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("item_topic_scores")
      .select("item_id, topic_id")
      .eq("owner_id", env.OWNER_ID)
      .eq("reason", "keyword")
      .gte("created_at", since)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    scores.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const itemIds = [...new Set(scores.map((s) => s.item_id))];
  console.log(`${scores.length} keyword-only matches on ${itemIds.length} articles in the last ${DAYS} days`);

  const items: { id: string; title: string; standfirst: string | null }[] = [];
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data } = await db.from("items").select("id, title, standfirst").in("id", itemIds.slice(i, i + 200));
    items.push(...(data ?? []));
  }

  const aiPicks = new Map<string, Set<string>>();
  const batchSize = limits.pipeline.match_batch_size;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const result = await callLlm({
      role: "fast",
      promptName: "topic_match",
      prompt: buildTopicMatchPrompt({
        topics: topics.map((t, index) => ({ index, name: t.name, description: t.description })),
        items: batch.map((it, index) => ({ index, title: it.title, standfirst: it.standfirst })),
      }),
      schema: topicMatchSchema,
      modelsConfig: models,
      apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
      db,
      ownerId: env.OWNER_ID,
      stage: "rematch",
      maxTokens: 2000,
    });
    for (const m of result.matches) {
      const it = batch[m.i];
      if (!it) continue;
      aiPicks.set(it.id, new Set(m.t.map((t) => topics[t]?.id).filter((x): x is string => Boolean(x))));
    }
  }

  const itemById = new Map(items.map((it) => [it.id, it]));
  const keep: { item_id: string; topic_id: string; reason: string }[] = [];
  const drop: { item_id: string; topic_id: string }[] = [];
  for (const s of scores) {
    if (aiPicks.get(s.item_id)?.has(s.topic_id)) {
      const it = itemById.get(s.item_id)!;
      const topic = topics.find((t) => t.id === s.topic_id);
      const words = topic ? matchedKeywords(topic.compiled, `${it.title} ${it.standfirst ?? ""}`) : [];
      keep.push({ ...s, reason: words.length ? `ai; keywords: ${words.join(", ")}` : "ai" });
    } else drop.push(s);
  }
  // Topics the AI picked that the article had no score for at all: added,
  // so an article moved to a better-fitting topic isn't lost.
  const existing = new Set<string>();
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data } = await db.from("item_topic_scores").select("item_id, topic_id").in("item_id", itemIds.slice(i, i + 200));
    for (const r of data ?? []) existing.add(`${r.item_id}:${r.topic_id}`);
  }
  const add: { item_id: string; topic_id: string; reason: string }[] = [];
  for (const [itemId, picked] of aiPicks) {
    for (const topicId of picked) {
      if (existing.has(`${itemId}:${topicId}`)) continue;
      const it = itemById.get(itemId)!;
      const topic = topics.find((t) => t.id === topicId);
      const words = topic ? matchedKeywords(topic.compiled, `${it.title} ${it.standfirst ?? ""}`) : [];
      add.push({ item_id: itemId, topic_id: topicId, reason: words.length ? `ai; keywords: ${words.join(", ")}` : "ai" });
    }
  }
  console.log(`${add.length} new AI matches to add`);
  for (const a of add.slice(0, 15)) console.log(`  + ${topics.find((t) => t.id === a.topic_id)?.name}: ${itemById.get(a.item_id)?.title.slice(0, 90)}`);

  const byTopic = new Map<string, { kept: number; dropped: number }>();
  for (const [list, key] of [[keep, "kept"], [drop, "dropped"]] as const) {
    for (const s of list) {
      const name = topics.find((t) => t.id === s.topic_id)?.name ?? s.topic_id;
      const c = byTopic.get(name) ?? { kept: 0, dropped: 0 };
      c[key]++;
      byTopic.set(name, c);
    }
  }
  console.table(Object.fromEntries(byTopic));

  // A sample of what would be removed, per topic, to check by eye.
  for (const t of topics) {
    const sample = drop.filter((d) => d.topic_id === t.id).slice(0, 12);
    if (sample.length === 0) continue;
    console.log(`\nWould remove from "${t.name}":`);
    for (const d of sample) console.log(`  - ${itemById.get(d.item_id)?.title.slice(0, 110)}`);
  }

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write.");
    process.exit(0);
  }

  for (const k of keep) {
    await db.from("item_topic_scores").update({ reason: k.reason }).eq("item_id", k.item_id).eq("topic_id", k.topic_id);
  }
  for (const d of drop) {
    await db.from("item_topic_scores").delete().eq("item_id", d.item_id).eq("topic_id", d.topic_id);
  }
  for (let i = 0; i < add.length; i += 200) {
    await db
      .from("item_topic_scores")
      .upsert(add.slice(i, i + 200).map((a) => ({ owner_id: env.OWNER_ID, ...a, score: 7 })), { onConflict: "item_id,topic_id" });
  }
  // Events whose articles gained a topic get that topic too.
  const addedStoryLinks: { owner_id: string; story_id: string; topic_id: string }[] = [];
  for (const a of add) {
    const { data } = await db.from("story_items").select("story_id").eq("item_id", a.item_id);
    for (const r of data ?? []) addedStoryLinks.push({ owner_id: env.OWNER_ID, story_id: r.story_id as string, topic_id: a.topic_id });
  }
  if (addedStoryLinks.length) await db.from("story_topics").upsert(addedStoryLinks, { onConflict: "story_id,topic_id" });

  // Unlink topics from events where no article supports them any more.
  const touchedItems = [...new Set(drop.map((d) => d.item_id))];
  const storyIds = new Set<string>();
  for (let i = 0; i < touchedItems.length; i += 200) {
    const { data } = await db.from("story_items").select("story_id").in("item_id", touchedItems.slice(i, i + 200));
    for (const r of data ?? []) storyIds.add(r.story_id as string);
  }
  let unlinked = 0;
  let closed = 0;
  for (const storyId of storyIds) {
    const { data: links } = await db.from("story_items").select("item_id").eq("story_id", storyId);
    const ids = (links ?? []).map((l) => l.item_id as string);
    const { data: remaining } = await db.from("item_topic_scores").select("item_id, topic_id").in("item_id", ids);
    const supported = new Set((remaining ?? []).map((r) => r.topic_id as string));
    const { data: storyTopics } = await db.from("story_topics").select("topic_id").eq("story_id", storyId);
    for (const st of storyTopics ?? []) {
      if (!supported.has(st.topic_id as string)) {
        await db.from("story_topics").delete().eq("story_id", storyId).eq("topic_id", st.topic_id);
        unlinked++;
      }
    }
    if (supported.size === 0) {
      await db.from("stories").update({ status: "closed" }).eq("id", storyId);
      const scored = new Set((remaining ?? []).map((r) => r.item_id as string));
      const orphaned = ids.filter((x) => !scored.has(x));
      if (orphaned.length) await db.from("items").update({ status: "not_relevant" }).in("id", orphaned);
      closed++;
    }
  }
  // Articles not in any event that lost their last topic.
  const keepIds = new Set<string>();
  for (let i = 0; i < touchedItems.length; i += 200) {
    const { data } = await db.from("item_topic_scores").select("item_id").in("item_id", touchedItems.slice(i, i + 200));
    for (const r of data ?? []) keepIds.add(r.item_id as string);
  }
  const orphans = touchedItems.filter((x) => !keepIds.has(x));
  for (let i = 0; i < orphans.length; i += 200) {
    await db.from("items").update({ status: "not_relevant" }).in("id", orphans.slice(i, i + 200)).eq("status", "scored");
  }

  console.log(`Applied: ${keep.length} kept, ${drop.length} removed, ${unlinked} event-topic links removed, ${closed} events closed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

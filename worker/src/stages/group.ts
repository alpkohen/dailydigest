import { createServiceRoleClient, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import { buildEventGroupPrompt, callLlm, eventGroupSchema, type EventGroupResult } from "@dailydigest/llm";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";

const PAGE_SIZE = 1000;
const MAX_EVENTS_IN_PROMPT = 80;
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

interface ScoredItem {
  id: string;
  title: string;
  standfirst: string | null;
  sources: { name: string } | null;
}

interface TopicRow {
  id: string;
  name: string;
  priority: string;
}

interface NewStory {
  title: string;
  summary: string;
  tier: number;
  itemIds: string[];
}

/** Generated text must not carry em/en dashes (CLAUDE.md writing rules). */
function clean(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").trim();
}

/**
 * Turns the model's grouping into concrete writes. Anything the model left
 * out, referenced twice, or pointed at a non-existent event becomes its own
 * single-article story, so no matched article can ever go missing.
 */
export function resolveGrouping(
  items: { id: string; title: string; standfirst: string | null }[],
  eventIds: string[],
  result: EventGroupResult | null,
): { attach: { itemId: string; storyId: string }[]; created: NewStory[] } {
  const used = new Set<number>();
  const attach: { itemId: string; storyId: string }[] = [];
  const created: NewStory[] = [];

  for (const a of result?.assign ?? []) {
    const item = items[a.i];
    const storyId = eventIds[a.e];
    if (!item || !storyId || used.has(a.i)) continue;
    used.add(a.i);
    attach.push({ itemId: item.id, storyId });
  }

  for (const e of result?.new_events ?? []) {
    const memberIdx = e.items.filter((i) => items[i] && !used.has(i));
    if (memberIdx.length === 0) continue;
    memberIdx.forEach((i) => used.add(i));
    created.push({
      title: clean(e.title) || items[memberIdx[0]!]!.title,
      summary: clean(e.summary),
      tier: e.tier,
      itemIds: memberIdx.map((i) => items[i]!.id),
    });
  }

  items.forEach((item, i) => {
    if (used.has(i)) return;
    created.push({ title: item.title, summary: item.standfirst?.slice(0, 280) ?? item.title, tier: 3, itemIds: [item.id] });
  });

  return { attach, created };
}

async function loadScoredItems(db: SupabaseClient, ownerId: string): Promise<ScoredItem[]> {
  const all: ScoredItem[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("items")
      .select("id, title, standfirst, sources(name)")
      .eq("owner_id", ownerId)
      .eq("status", "scored")
      .order("created_at", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load scored items: ${error.message}`);
    all.push(...((data ?? []) as unknown as ScoredItem[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

async function loadItemTopics(db: SupabaseClient, itemIds: string[]): Promise<Map<string, string[]>> {
  const byItem = new Map<string, string[]>();
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data, error } = await db
      .from("item_topic_scores")
      .select("item_id, topic_id")
      .in("item_id", itemIds.slice(i, i + 200));
    if (error) throw new Error(`Failed to load item topics: ${error.message}`);
    for (const row of data ?? []) {
      const list = byItem.get(row.item_id as string) ?? [];
      list.push(row.topic_id as string);
      byItem.set(row.item_id as string, list);
    }
  }
  return byItem;
}

async function loadRecentEvents(db: SupabaseClient, topicId: string, windowHours: number): Promise<{ id: string; title: string }[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("story_topics")
    .select("stories!inner(id, title, last_updated_at, status)")
    .eq("topic_id", topicId)
    .eq("stories.status", "open")
    .gte("stories.last_updated_at", since)
    .limit(500);
  if (error) throw new Error(`Failed to load recent events: ${error.message}`);
  return ((data ?? []) as unknown as { stories: { id: string; title: string; last_updated_at: string } }[])
    .map((r) => r.stories)
    .sort((a, b) => b.last_updated_at.localeCompare(a.last_updated_at))
    .slice(0, MAX_EVENTS_IN_PROMPT)
    .map((s) => ({ id: s.id, title: s.title }));
}

/**
 * Group: matched items are attached to a recent event (story) of their
 * primary topic or start a new one, with a one-line Turkish title/summary
 * and a 1-3 tier from the same call. One call per topic per batch.
 */
export async function runGroupStage(env: Env, models: ModelsConfig, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "group", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const items = await loadScoredItems(db, env.OWNER_ID);
  if (items.length === 0) {
    console.log("group: nothing to group");
    await db.from("pipeline_runs").update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "group", date, items: 0 } }).eq("id", run.id);
    return;
  }

  const { data: topicRows } = await db.from("topics").select("id, name, priority").eq("owner_id", env.OWNER_ID);
  const topics = new Map(((topicRows ?? []) as TopicRow[]).map((t) => [t.id, t]));
  const itemTopics = await loadItemTopics(db, items.map((i) => i.id));

  // Each item is grouped once, under its highest-priority topic; its story
  // still gets tagged with every topic the item matched.
  const byPrimary = new Map<string, ScoredItem[]>();
  const orphanIds: string[] = [];
  for (const item of items) {
    const topicIds = (itemTopics.get(item.id) ?? []).filter((id) => topics.has(id));
    if (topicIds.length === 0) {
      // Its topic was deleted since matching; it's no longer matched.
      orphanIds.push(item.id);
      continue;
    }
    topicIds.sort((a, b) => (PRIORITY_RANK[topics.get(a)!.priority] ?? 1) - (PRIORITY_RANK[topics.get(b)!.priority] ?? 1));
    const list = byPrimary.get(topicIds[0]!) ?? [];
    list.push(item);
    byPrimary.set(topicIds[0]!, list);
  }

  if (orphanIds.length > 0) {
    await db.from("items").update({ status: "not_relevant" }).in("id", orphanIds.slice(0, 1000));
  }

  let attachedCount = 0;
  let createdCount = 0;
  let aiFailures = 0;

  for (const [topicId, topicItems] of byPrimary) {
    const topic = topics.get(topicId)!;
    for (let i = 0; i < topicItems.length; i += limits.pipeline.group_batch_size) {
      const batch = topicItems.slice(i, i + limits.pipeline.group_batch_size);
      const events = await loadRecentEvents(db, topicId, limits.pipeline.group_window_hours);

      let result: EventGroupResult | null = null;
      try {
        result = await callLlm({
          role: "mid",
          promptName: "event_group",
          prompt: buildEventGroupPrompt({
            topicName: topic.name,
            events: events.map((e, index) => ({ index, title: e.title })),
            items: batch.map((item, index) => ({ index, title: item.title, standfirst: item.standfirst, source: item.sources?.name ?? null })),
          }),
          schema: eventGroupSchema,
          modelsConfig: models,
          apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
          db,
          ownerId: env.OWNER_ID,
          runId: run.id,
          stage: "group",
          maxTokens: 4000,
        });
      } catch (err) {
        aiFailures++;
        console.error(`group: AI grouping for "${topic.name}" failed, each article becomes its own event: ${(err as Error).message}`);
      }

      const { attach, created } = resolveGrouping(batch, events.map((e) => e.id), result);
      await writeGrouping(db, env.OWNER_ID, attach, created, itemTopics);
      attachedCount += attach.length;
      createdCount += created.length;
    }
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: aiFailures > 0 ? "partial" : "ok",
      stats: { stage: "group", date, items: items.length, attached: attachedCount, newStories: createdCount, aiFailures },
    })
    .eq("id", run.id);

  console.log(`group stage done: ${items.length} items, ${attachedCount} attached to existing events, ${createdCount} new events`);
}

async function writeGrouping(
  db: SupabaseClient,
  ownerId: string,
  attach: { itemId: string; storyId: string }[],
  created: NewStory[],
  itemTopics: Map<string, string[]>,
): Promise<void> {
  const now = new Date().toISOString();
  const links: { story_id: string; item_id: string }[] = attach.map((a) => ({ story_id: a.storyId, item_id: a.itemId }));

  if (created.length > 0) {
    const { data: inserted, error } = await db
      .from("stories")
      .insert(created.map((s) => ({ owner_id: ownerId, title: s.title, summary: s.summary, tier: s.tier, status: "open" })))
      .select("id");
    if (error || !inserted || inserted.length !== created.length) throw new Error(`Failed to insert stories: ${error?.message}`);
    created.forEach((s, idx) => s.itemIds.forEach((itemId) => links.push({ story_id: inserted[idx]!.id as string, item_id: itemId })));
  }

  if (links.length === 0) return;

  const { error: linkError } = await db
    .from("story_items")
    .upsert(links.map((l) => ({ owner_id: ownerId, ...l })), { onConflict: "story_id,item_id" });
  if (linkError) throw new Error(`Failed to link story items: ${linkError.message}`);

  const topicRows = new Map<string, { owner_id: string; story_id: string; topic_id: string }>();
  for (const l of links) {
    for (const topicId of itemTopics.get(l.item_id) ?? []) {
      topicRows.set(`${l.story_id}:${topicId}`, { owner_id: ownerId, story_id: l.story_id, topic_id: topicId });
    }
  }
  if (topicRows.size > 0) {
    const { error } = await db.from("story_topics").upsert([...topicRows.values()], { onConflict: "story_id,topic_id" });
    if (error) throw new Error(`Failed to tag story topics: ${error.message}`);
  }

  const touchedExisting = [...new Set(attach.map((a) => a.storyId))];
  if (touchedExisting.length > 0) {
    await db.from("stories").update({ last_updated_at: now }).in("id", touchedExisting);
  }

  const itemIds = links.map((l) => l.item_id);
  for (let i = 0; i < itemIds.length; i += 200) {
    const { error } = await db.from("items").update({ status: "grouped" }).in("id", itemIds.slice(i, i + 200));
    if (error) throw new Error(`Failed to mark items grouped: ${error.message}`);
  }
}

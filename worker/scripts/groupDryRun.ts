/**
 * Grouping dry run: sends real matched items of one topic through the
 * event_group prompt and prints the result. Writes nothing except the
 * llm_calls log. Usage (from worker/, with .env loaded):
 *   pnpm exec tsx scripts/groupDryRun.ts "Rusya-Ukrayna Savaşı" 40
 */
import { createServiceRoleClient } from "@dailydigest/db";
import { buildEventGroupPrompt, callLlm, eventGroupSchema } from "@dailydigest/llm";
import { loadWorkerConfig } from "../src/config.js";
import { loadEnv } from "../src/env.js";
import { resolveGrouping } from "../src/stages/group.js";

async function main() {
  const topicName = process.argv[2] ?? "Rusya-Ukrayna Savaşı";
  const limit = Number(process.argv[3] ?? 40);
  const env = loadEnv();
  const { models, limits } = await loadWorkerConfig();
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: topic } = await db.from("topics").select("id, name").eq("name", topicName).single();
  if (!topic) throw new Error(`topic not found: ${topicName}`);
  const { data: rows } = await db
    .from("item_topic_scores")
    .select("items(id, title, standfirst, sources(name))")
    .eq("topic_id", topic.id)
    .limit(limit);
  const items = ((rows ?? []) as unknown as { items: { id: string; title: string; standfirst: string | null; sources: { name: string } | null } }[]).map((r) => r.items);

  const size = limits.pipeline.group_batch_size;
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const t0 = Date.now();
    try {
      const result = await callLlm({
        role: "fast",
        promptName: "event_group_dry_run",
        prompt: buildEventGroupPrompt({
          topicName: topic.name,
          events: [],
          items: batch.map((it, index) => ({ index, title: it.title, standfirst: it.standfirst, source: it.sources?.name ?? null })),
        }),
        schema: eventGroupSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        stage: "group_dry_run",
        maxTokens: 8000,
      });
      const { created } = resolveGrouping(batch, [], result);
      console.log(`\nbatch ${i / size + 1}: ${batch.length} articles -> ${created.length} events in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      for (const e of created.filter((c) => c.itemIds.length > 1)) {
        console.log(`  [tier ${e.tier}] ${e.title} (${e.itemIds.length} articles)\n     ${e.summary}`);
      }
      const singles = created.filter((c) => c.itemIds.length === 1).slice(0, 3);
      for (const e of singles) console.log(`  [tier ${e.tier}] ${e.title}\n     ${e.summary}`);
    } catch (err) {
      console.log(`\nbatch ${i / size + 1}: FAILED in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${(err as Error).message.slice(0, 150)}`);
    }
  }
  process.exit(0);
}

main();

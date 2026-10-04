/**
 * Source health dry run: fetches every RSS feed in config/sources.seed.yaml
 * and reports item counts, failures and timing. Touches no database, so it's
 * safe to run any time: `pnpm --filter @dailydigest/worker exec tsx scripts/feedCheck.ts`.
 */
import { loadWorkerConfig } from "../src/config.js";
import { fetchRssFeed } from "../src/connectors/rss.js";

async function main() {
  const { sourcesSeed } = await loadWorkerConfig();
  const feeds = sourcesSeed.sources.filter((s) => s.type === "rss") as { name: string; url?: string | null }[];
  const started = Date.now();

  const results: { name: string; count: number; newest: string | null; error?: string; ms: number }[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < feeds.length) {
        const source = feeds[next++]!;
        const t0 = Date.now();
        if (!source.url) {
          results.push({ name: source.name, count: 0, newest: null, error: "no feed url", ms: 0 });
          continue;
        }
        try {
          const items = await Promise.race([
            fetchRssFeed(source.url),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout 45s")), 45_000)),
          ]);
          const newest = items.map((i) => i.publishedAt).filter(Boolean).sort().at(-1) ?? null;
          results.push({ name: source.name, count: items.length, newest, ms: Date.now() - t0 });
        } catch (err) {
          results.push({ name: source.name, count: 0, newest: null, error: (err as Error).message.slice(0, 80), ms: Date.now() - t0 });
        }
      }
    }),
  );

  results.sort((a, b) => a.name.localeCompare(b.name));
  for (const r of results) {
    console.log(`${r.error ? "FAIL" : "ok  "} ${r.name.padEnd(36)} ${String(r.count).padStart(4)} items  newest=${r.newest?.slice(0, 16) ?? "-"}  ${r.ms}ms${r.error ? `  (${r.error})` : ""}`);
  }
  const ok = results.filter((r) => !r.error);
  console.log(`\n${ok.length}/${results.length} feeds ok, ${ok.reduce((s, r) => s + r.count, 0)} items total, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main();

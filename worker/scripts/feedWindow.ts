/**
 * How many hours of articles each RSS feed holds (newest minus oldest item).
 * A feed whose window is shorter than the time between collect runs drops
 * articles before we read them. Writes nothing.
 * Usage: pnpm exec tsx scripts/feedWindow.ts [minHours]
 */
import { loadWorkerConfig } from "../src/config.js";
import { fetchRssFeed } from "../src/connectors/rss.js";

async function main() {
  const minHours = Number(process.argv[2] ?? 12);
  const { sourcesSeed } = await loadWorkerConfig();
  const feeds = sourcesSeed.sources.filter((s) => s.type === "rss" && s.url);
  const rows: { name: string; count: number; hours: number | null }[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < feeds.length) {
        const f = feeds[next++]!;
        try {
          const items = await Promise.race([fetchRssFeed(f.url!), new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 45_000))]);
          const times = items.map((i) => Date.parse(i.publishedAt ?? "")).filter(Number.isFinite).sort((a, b) => a - b);
          const hours = times.length > 1 ? (times.at(-1)! - times[0]!) / 3_600_000 : null;
          rows.push({ name: f.name, count: items.length, hours });
        } catch {
          rows.push({ name: f.name, count: -1, hours: null });
        }
      }
    }),
  );
  rows.sort((a, b) => (a.hours ?? 1e9) - (b.hours ?? 1e9));
  for (const r of rows) {
    const flag = r.hours !== null && r.hours < minHours ? "  <-- short" : "";
    console.log(`${r.name.padEnd(36)} ${String(r.count).padStart(4)} items  ${r.hours === null ? "   -" : r.hours.toFixed(1).padStart(6)} h${flag}`);
  }
  process.exit(0);
}
main();

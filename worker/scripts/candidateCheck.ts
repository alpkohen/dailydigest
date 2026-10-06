/**
 * Checks candidate RSS sources before they're added: does the feed parse,
 * does robots.txt allow it, how fresh is it. Writes nothing.
 * Usage: pnpm exec tsx scripts/candidateCheck.ts <candidates.json>
 * candidates.json: [{ "name": "...", "url": "..." }, ...]
 */
import { readFile } from "node:fs/promises";
import { fetchRssFeed } from "../src/connectors/rss.js";
import { isAllowed } from "../src/connectors/web.js";

interface Candidate {
  name: string;
  url: string;
}

async function check(c: Candidate) {
  const t0 = Date.now();
  try {
    const allowed = await isAllowed(c.url);
    if (!allowed) return `ROBOTS ${c.name.padEnd(30)} robots.txt disallows ${c.url}`;
    const items = await Promise.race([
      fetchRssFeed(c.url),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout 30s")), 30_000)),
    ]);
    const newest = items.map((i) => i.publishedAt).filter(Boolean).sort().at(-1) ?? null;
    const ageDays = newest ? (Date.now() - Date.parse(newest)) / 86_400_000 : null;
    const status = items.length === 0 ? "EMPTY " : ageDays != null && ageDays > 7 ? "STALE " : "ok    ";
    return `${status} ${c.name.padEnd(30)} ${String(items.length).padStart(3)} items newest=${newest?.slice(0, 10) ?? "-"} ${Date.now() - t0}ms`;
  } catch (err) {
    return `FAIL   ${c.name.padEnd(30)} ${(err as Error).message.slice(0, 70)}`;
  }
}

async function main() {
  const candidates = JSON.parse(await readFile(process.argv[2]!, "utf-8")) as Candidate[];
  const results: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < candidates.length) results.push(await check(candidates[next++]!));
    }),
  );
  console.log(results.sort().join("\n"));
  process.exit(0);
}

main();

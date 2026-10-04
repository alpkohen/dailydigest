/**
 * Live check of the sitemap connector against given sitemap URLs. Writes
 * nothing. Usage: pnpm exec tsx scripts/sitemapCheck.ts <url> [<url> ...]
 */
import { fetchSitemapItems } from "../src/connectors/sitemap.js";

async function main() {
  for (const url of process.argv.slice(2)) {
    const t0 = Date.now();
    try {
      const items = await fetchSitemapItems(url, 3, async () => new Set(), 8);
      console.log(`\nok ${url}: ${items.length} items in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      for (const i of items.slice(0, 3)) console.log(`   ${i.publishedAt?.slice(0, 10) ?? "-"}  ${i.title.slice(0, 90)}`);
    } catch (err) {
      console.log(`\nFAIL ${url}: ${(err as Error).message}`);
    }
  }
  process.exit(0);
}

main();

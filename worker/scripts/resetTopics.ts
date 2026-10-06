/**
 * One-off fresh start (owner's request, 2026-10-06): deletes every topic and
 * everything built on them (events, briefs, matches, suggestions), plus the
 * trial question and watch, then adds the agreed topics. Sources and
 * collected articles stay; matched articles go back to 'not_relevant' so
 * the next match run backfills the new topics over the last 7 days.
 * Dry run by default.
 *
 * Usage: pnpm exec tsx scripts/resetTopics.ts [--apply]
 */
import { createServiceRoleClient } from "@dailydigest/db";
import { loadEnv } from "../src/env.js";

const APPLY = process.argv.includes("--apply");

const TOPICS: { name: string; description: string }[] = [
  { name: "Türk Dış Politikası ve Büyük Güçler", description: "Türkiye'nin ABD, Rusya, AB ve Çin ile ilişkileri, al-verci dış politikası ve stratejik otonomi arayışı." },
  { name: "Türkiye-Rusya İlişkileri", description: "Türkiye ile Rusya arasındaki enerji, Akkuyu, S-400, Suriye, Kafkasya ve Karadeniz eksenindeki ilişkiler ve karşılıklı bağımlılık." },
  { name: "Rusya-Ukrayna Savaşı", description: "Rusya-Ukrayna savaşının askeri, diplomatik ve ekonomik seyri, barış müzakereleri ve Rusya'nın savaş ekonomisi." },
  { name: "Demokratik Gerileme ve Rekabetçi Otoriterlik", description: "Dünyada ve Türkiye'de demokratik gerileme, yürütmenin güçlenmesi, yargı bağımsızlığı ve rekabetçi otoriter rejimler." },
  { name: "Trump Dönemi ABD Dış Politikası", description: "Trump yönetiminin dış politikası, NATO ve müttefiklerle ilişkiler, tarifeler ve demokrasi desteğinden geri çekilme." },
  { name: "Orta Güçler ve Çok Kutuplu Düzen", description: "Türkiye, Hindistan, Brezilya, Suudi Arabistan gibi orta güçlerin stratejik otonomi arayışı, BRICS ve çok kutuplu dünya düzeni." },
  { name: "Popülizm, Göç ve Aşırı Sağ", description: "Avrupa ve ABD'de göçmen karşıtı popülist partilerin yükselişi, seçim sonuçları ve göç politikaları." },
  { name: "Teknoloji Jeopolitiği", description: "ABD-Çin teknoloji rekabeti, çip ve yapay zeka ihracat kontrolleri, tedarik zinciri ve ekonomik karşılıklı bağımlılığın silahlaştırılması." },
  { name: "Türkiye-AB İlişkileri", description: "Türkiye ile Avrupa Birliği arasındaki üyelik süreci, Gümrük Birliği, vize serbestisi, göç işbirliği ve siyasi ilişkiler." },
];

async function main() {
  const env = loadEnv();
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const owner = env.OWNER_ID;

  const count = async (table: string, filter?: (q: any) => any) => {
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("owner_id", owner);
    if (filter) q = filter(q);
    const { count: n } = await q;
    return n ?? 0;
  };
  console.log("Will delete:");
  for (const t of ["topics", "stories", "briefs", "questions", "watches", "item_topic_scores", "topic_source_suggestions"]) {
    console.log(`  ${t}: ${await count(t)}`);
  }
  console.log(`  items with no source (watchlist search results): ${await count("items", (q) => q.is("source_id", null))}`);
  console.log(`Will reset to not_relevant: ${await count("items", (q) => q.in("status", ["scored", "grouped"]))} matched articles`);
  console.log(`Will add ${TOPICS.length} topics: ${TOPICS.map((t) => t.name).join(", ")}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    process.exit(0);
  }

  const run = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) throw new Error(`${label}: ${error.message}`);
    console.log(`done: ${label}`);
  };
  // Cascades remove brief_stories, brief_content_refs, story_items,
  // story_topics, story_links, feedback, question_evidence, watch_items,
  // item_topic_scores and topic_source_suggestions.
  await run("briefs", db.from("briefs").delete().eq("owner_id", owner));
  await run("stories", db.from("stories").delete().eq("owner_id", owner));
  await run("questions", db.from("questions").delete().eq("owner_id", owner));
  await run("watches", db.from("watches").delete().eq("owner_id", owner));
  await run("topics", db.from("topics").delete().eq("owner_id", owner));
  await run("watchlist search items", db.from("items").delete().eq("owner_id", owner).is("source_id", null));
  await run("reset matched items", db.from("items").update({ status: "not_relevant" }).eq("owner_id", owner).in("status", ["scored", "grouped"]));
  await run(
    "add topics",
    db.from("topics").insert(
      TOPICS.map((t) => ({
        owner_id: owner,
        name: t.name,
        description: t.description,
        priority: "normal",
        frequency: "daily",
        languages: ["tr", "en"],
        active: true,
      })),
    ),
  );
  console.log("\nFresh start done. The next AI run generates keywords, backfills 7 days and suggests sources.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { z } from "zod";

/** SPEC.md section 7: ask | strong | question, retrieved items | answer with citations. */
export const askSchema = z.object({
  answer: z.string(),
  citation_indices: z.array(z.number()),
  has_evidence: z.boolean(),
});
export type AskResult = z.infer<typeof askSchema>;

/**
 * Lets the "Ask" widget also answer questions about World Brief itself
 * (how the pipeline classifies/scores stories, what a feature does) instead
 * of only the news archive. Kept short and factual, grounded in SPEC.md and
 * the actual pipeline stage order - update this if that changes materially.
 */
const APP_INFO = `World Brief, sahibinin kişisel dış politika/siyaset bilimi brifing uygulaması. Her sabah otomatik çalışan bir pipeline var:
1. Ingest: RSS, akademik veritabanları ve API'lerden haber/makale çekilir.
2. Extract/Embed: metin temizlenir, çok dilli embedding çıkarılır.
3. Relevance: her haber, kullanıcının tanımladığı her "Topic" (konu) ile ucuz bir model tarafından 0-10 puanla skorlanır; konunun eşiğini (varsayılan 5) geçen olursa haber alakalı sayılır, geçmezse arşive kaldırılır (silinmez).
4. Cluster: aynı gelişmeyi anlatan farklı kaynaklardaki haberler tek bir "story" altında birleştirilir (embedding benzerliği + gerekirse LLM doğrulaması).
5. Score: her story'ye tier (1=kritik, 2=takip edilecek, 3=okumaya değer) ve novelty (yeni/devam/tekrar) atanır; tekrar (yeni bilgi yok) olanlar brifingden düşürülür. Nihai sıralama puanı tier + novelty + konu önceliği + kaynak güvenilirliği + kaynak sayısını birleştirir.
6. Enrich: seçilen story'ler için özet, "ne değişti", "neden önemli", farklı bakış açılarına göre çerçeveleme (framing) ve "sonra ne izlenmeli" yazılır.
7. Compose/Deliver: gün brifingi oluşturulup her sabah 05:30 (İstanbul saati) e-posta ile gönderilir.

Diğer özellikler: Topics (takip edilen konular, öncelik/eşik ayarlanabilir), Questions (uzun vadeli takip edilen analitik sorular), Watchlist (belirli kişi/kurumların çıktısı), Sources (kaynak kayıt defteri, güvenilirlik ağırlığı), Archive + Ask (arşivde hibrit arama ve soru-cevap), Reading list, geri bildirim (relevant/not relevant/save) zamanla hem alaka skorlamasını hem kaynak ağırlığını etkiler.`;

export function buildAskPrompt(params: {
  question: string;
  items: { index: number; title: string; standfirst: string | null; publishedAt: string | null }[];
}): string {
  const itemsBlock = params.items
    .map((i) => `[${i.index}] (${i.publishedAt ?? "tarih bilinmiyor"}) ${i.title}${i.standfirst ? ` — ${i.standfirst}` : ""}`)
    .join("\n");

  return `ABOUT WORLD BRIEF (use this only for questions about the app/software itself, not for news questions):
${APP_INFO}

Archive items retrieved for this question:
${itemsBlock || "(no items retrieved)"}

Question: ${params.question}

If the question is about World Brief itself (how it works, what a feature does, how classification/scoring works), answer directly from the "ABOUT WORLD BRIEF" section above - no citation numbers needed for that, set citation_indices to [] and has_evidence to true.

Otherwise, treat it as a news/coverage question and answer ONLY using facts present in the archive items above (SPEC.md section 4.11: "answered only from stored items"). Cite every factual claim inline using its bracketed number, e.g. "... oldu [2]." If the items above do not contain enough evidence to answer, say so explicitly in Turkish rather than guessing.

Respond with only a JSON object: {"answer": "<Turkish answer with inline [n] citations when citing archive items>", "citation_indices": [<the item numbers actually cited, [] for app-info answers>], "has_evidence": <boolean>}.`;
}

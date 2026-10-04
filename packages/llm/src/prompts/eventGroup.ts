import { z } from "zod";

/**
 * Groups newly matched articles of one topic into events (stories): each
 * article either joins an existing recent event or starts a new one. The
 * caller treats any article the model leaves out as its own new event, so a
 * bad response can never hide an article.
 */
export const eventGroupSchema = z.object({
  assign: z.array(z.object({ i: z.number().int(), e: z.number().int() })),
  new_events: z.array(
    z.object({
      items: z.array(z.number().int()).min(1),
      title: z.string(),
      summary: z.string(),
      tier: z.number().int().min(1).max(3),
    }),
  ),
});
export type EventGroupResult = z.infer<typeof eventGroupSchema>;

export function buildEventGroupPrompt(params: {
  topicName: string;
  events: { index: number; title: string }[];
  items: { index: number; title: string; standfirst: string | null; source: string | null }[];
}): string {
  const eventsBlock = params.events.length
    ? params.events.map((e) => `E${e.index}: ${e.title}`).join("\n")
    : "(none yet)";
  const itemsBlock = params.items
    .map(
      (i) =>
        `${i.index}. [${i.source ?? "?"}] ${i.title}${i.standfirst ? ` | ${i.standfirst.slice(0, 300)}` : ""}`,
    )
    .join("\n");

  return `Topic: ${params.topicName}

Events already being tracked (last 48 hours):
${eventsBlock}

New articles:
${itemsBlock}

Group the new articles by the real-world event they report.
- If an article reports an event already listed above, assign it to that event.
- Otherwise put it in a new event. Articles about the same new event go in the same new event. When unsure whether two articles are the same event, keep them separate.
- Every article number must appear exactly once, either in "assign" or in one "new_events" entry.
- For each new event write, in Turkish: a neutral title of at most 10 words and one plain sentence of at most 25 words saying what happened. Use only facts present in the articles. No em dashes, no hype.
- Output only the JSON object, nothing before or after it.
- tier: 1 = major development with significant consequences, 2 = notable development worth following, 3 = minor or routine.

Respond with only a JSON object: {"assign": [{"i": <article>, "e": <event number without the E>}], "new_events": [{"items": [<article numbers>], "title": "...", "summary": "...", "tier": 1}]}`;
}

/** One short Turkish overview paragraph for the daily email and the brief page. */
export const dailyOverviewSchema = z.object({
  overview: z.string(),
});
export type DailyOverviewResult = z.infer<typeof dailyOverviewSchema>;

export function buildDailyOverviewPrompt(params: {
  stories: { title: string; summary: string; topic: string | null; sourceCount: number }[];
}): string {
  const block = params.stories
    .map((s) => `- [${s.topic ?? "?"}] ${s.title}: ${s.summary} (${s.sourceCount} kaynak)`)
    .join("\n");

  return `Bugünün en önemli gelişmeleri:
${block}

Bunları 2 ile 4 cümlelik, sade ve analitik bir Türkçe paragrafta özetle. Sadece yukarıdaki bilgileri kullan. Em dash kullanma, abartılı ifade ve giriş cümlesi kullanma.

Respond with only a JSON object: {"overview": "..."}`;
}

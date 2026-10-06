/**
 * The day's framing, one line per topic: the topic's most important event
 * (lowest tier, then most sources) and how many events it has. Built from
 * event titles, not written by a model, so it can't state anything the
 * events don't and it stays current as events change during the day.
 */
export interface TopicLine {
  topic: string;
  storyId: string;
  title: string;
  events: number;
}

export function buildTopicLines(stories: { id: string; title: string; tier: number; sourceCount: number; topics: string[] }[]): TopicLine[] {
  const ranked = [...stories].sort((a, b) => a.tier - b.tier || b.sourceCount - a.sourceCount);
  const byTopic = new Map<string, typeof ranked>();
  for (const s of ranked) for (const topic of s.topics) byTopic.set(topic, [...(byTopic.get(topic) ?? []), s]);

  // Busiest topics first; each shows its best event not already shown on
  // another line, so one big event doesn't repeat down the list.
  const used = new Set<string>();
  return [...byTopic.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([topic, list]) => {
      const pick = list.find((s) => !used.has(s.id)) ?? list[0]!;
      used.add(pick.id);
      return { topic, storyId: pick.id, title: pick.title, events: list.length };
    });
}

import { cosineSimilarity } from "./dedup.js";

export interface StoryCandidate {
  id: string;
  centroid: number[];
  lastUpdatedAt: number;
}

export type ClusterDecision =
  | { action: "attach"; storyId: string; cosine: number }
  | { action: "confirm"; storyId: string; cosine: number }
  | { action: "new" };

/**
 * SPEC.md section 6, stage 6 "Cluster": find candidate stories from the
 * last 72h by embedding similarity to the story centroid. Above the high
 * threshold: attach directly. Between thresholds: needs an LLM
 * confirmation ("same development or not") before attaching. Below: a new
 * story.
 */
export function decideCluster(
  itemEmbedding: number[],
  itemPublishedAt: number,
  candidates: StoryCandidate[],
  windowMs: number,
  highThreshold: number,
  lowThreshold: number,
): ClusterDecision {
  let best: { id: string; cosine: number } | null = null;

  for (const story of candidates) {
    if (Math.abs(itemPublishedAt - story.lastUpdatedAt) > windowMs) continue;
    const cosine = cosineSimilarity(itemEmbedding, story.centroid);
    if (!best || cosine > best.cosine) best = { id: story.id, cosine };
  }

  if (!best) return { action: "new" };
  if (best.cosine >= highThreshold) return { action: "attach", storyId: best.id, cosine: best.cosine };
  if (best.cosine >= lowThreshold) return { action: "confirm", storyId: best.id, cosine: best.cosine };
  return { action: "new" };
}

/** Running-average centroid update as a new item joins a story. */
export function updateCentroid(centroid: number[], itemCount: number, newEmbedding: number[]): number[] {
  return centroid.map((value, i) => (value * itemCount + newEmbedding[i]!) / (itemCount + 1));
}

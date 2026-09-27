import { hammingDistance } from "./hash.js";

export interface DedupCandidate {
  id: string;
  publishedAt: number;
  simhash: string | null;
  embedding: number[] | null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * SPEC.md section 6, stage 4 "Dedup": same wire copy republished within 48h
 * is a near-duplicate when its SimHash distance is below threshold OR its
 * embedding cosine similarity is above threshold. Returns the earliest
 * matching canonical candidate's id, or null when the item is itself
 * canonical.
 */
export function findCanonicalMatch(
  item: DedupCandidate,
  canonicalPool: DedupCandidate[],
  windowMs: number,
  simhashThreshold: number,
  cosineThreshold: number,
): string | null {
  let best: DedupCandidate | null = null;

  for (const candidate of canonicalPool) {
    if (candidate.id === item.id) continue;
    if (Math.abs(item.publishedAt - candidate.publishedAt) > windowMs) continue;

    const simhashMatch =
      item.simhash != null &&
      candidate.simhash != null &&
      hammingDistance(item.simhash, candidate.simhash) <= simhashThreshold;
    const embeddingMatch =
      item.embedding != null &&
      candidate.embedding != null &&
      cosineSimilarity(item.embedding, candidate.embedding) >= cosineThreshold;

    if (!simhashMatch && !embeddingMatch) continue;
    if (!best || candidate.publishedAt < best.publishedAt) best = candidate;
  }

  return best?.id ?? null;
}

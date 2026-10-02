import { hammingDistance } from "./hash.js";

export interface DedupCandidate {
  id: string;
  publishedAt: number;
  simhash: string | null;
  embedding: number[] | null;
  // Unit-length copy of embedding. With both sides normalized, cosine
  // similarity is a plain dot product - no per-pair norm/sqrt work.
  unit?: Float32Array | null;
}

export function toUnitVector(v: number[] | null): Float32Array | null {
  if (!v) return null;
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i]! * v[i]!;
  if (norm === 0) return null;
  const inv = 1 / Math.sqrt(norm);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! * inv;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
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
  // Pool entries before this index are known to be outside the window (the
  // caller processes items in publication order, so the cutoff only moves
  // forward) - skipping them avoids a full scan of the pool per item.
  startIndex = 0,
): string | null {
  let best: DedupCandidate | null = null;

  for (let i = startIndex; i < canonicalPool.length; i++) {
    const candidate = canonicalPool[i]!;
    if (candidate.id === item.id) continue;
    if (Math.abs(item.publishedAt - candidate.publishedAt) > windowMs) continue;

    const simhashMatch =
      item.simhash != null &&
      candidate.simhash != null &&
      hammingDistance(item.simhash, candidate.simhash) <= simhashThreshold;
    const embeddingMatch =
      !simhashMatch &&
      (item.unit && candidate.unit
        ? dot(item.unit, candidate.unit) >= cosineThreshold
        : item.embedding != null &&
          candidate.embedding != null &&
          cosineSimilarity(item.embedding, candidate.embedding) >= cosineThreshold);

    if (!simhashMatch && !embeddingMatch) continue;
    if (!best || candidate.publishedAt < best.publishedAt) best = candidate;
  }

  return best?.id ?? null;
}

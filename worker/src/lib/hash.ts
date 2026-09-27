import { createHash } from "node:crypto";

/** SHA-256 of the text, for exact-duplicate detection (items.text_hash). */
export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function tokenHash64(token: string): bigint {
  const digest = createHash("sha256").update(token).digest();
  return digest.readBigUInt64BE(0);
}

/**
 * 64-bit SimHash over word tokens (SPEC.md section 6, extract stage: "Compute
 * text hash and SimHash"). Near-duplicate wire copy tends to produce a small
 * Hamming distance between simhashes; the dedup stage (M2) will use that.
 * Returned as a decimal string since it can exceed Number.MAX_SAFE_INTEGER
 * and Postgres bigint is transported as text over PostgREST.
 */
export function computeSimhash(text: string): string {
  const tokens = tokenize(text);
  const weights = new Map<string, number>();
  for (const token of tokens) {
    weights.set(token, (weights.get(token) ?? 0) + 1);
  }

  const bitSums = new Array<number>(64).fill(0);
  for (const [token, weight] of weights) {
    const hash = tokenHash64(token);
    for (let bit = 0; bit < 64; bit++) {
      const isSet = (hash >> BigInt(bit)) & 1n;
      bitSums[bit]! += isSet ? weight : -weight;
    }
  }

  let result = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (bitSums[bit]! > 0) result |= 1n << BigInt(bit);
  }

  // Interpret as Postgres' signed int8.
  const signed = result >= 1n << 63n ? result - (1n << 64n) : result;
  return signed.toString();
}

export function hammingDistance(a: string, b: string): number {
  const toUnsigned = (v: string) => {
    const n = BigInt(v);
    return n < 0n ? n + (1n << 64n) : n;
  };
  let x = toUnsigned(a) ^ toUnsigned(b);
  let distance = 0;
  while (x > 0n) {
    distance += Number(x & 1n);
    x >>= 1n;
  }
  return distance;
}

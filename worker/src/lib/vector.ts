/**
 * PostgREST returns pgvector columns as the text literal "[0.1,0.2,...]",
 * not a JSON array, so supabase-js hands back a string. Indexing and doing
 * arithmetic on that string yields NaN: every cosine comparison was NaN, so
 * dedup found nothing, cluster never attached an item to an existing story
 * (every item became its own story), and relevance's cosine pre-filter
 * (`NaN < threshold` is false) let every item/topic pair through to the LLM.
 */
export function parseEmbedding(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

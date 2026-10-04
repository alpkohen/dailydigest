/**
 * Deterministic half of topic matching. Case- and accent-insensitive and
 * anchored at a word start, so "Ukrayna" matches "UKRAYNA'nın" and "İran"
 * matches "Iran", while "AB" never matches inside "about". Short all-caps
 * terms (EU, AB, NATO) match case-sensitively against the original text so
 * they don't collide with ordinary words.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CompiledTerm {
  re: RegExp;
  onOriginal: boolean;
}

export interface CompiledKeywords {
  include: CompiledTerm[];
  exclude: CompiledTerm[];
}

const NOT_WORD = "[^\\p{L}\\p{N}]";

function compileTerm(term: string): CompiledTerm | null {
  const trimmed = term.trim();
  if (trimmed.length < 2) return null;
  const acronym = trimmed.length <= 4 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  if (acronym) {
    return { re: new RegExp(`(^|${NOT_WORD})${escapeRegExp(trimmed)}($|${NOT_WORD})`, "u"), onOriginal: true };
  }
  // Only the start is anchored, so Turkish suffixes still match
  // ("Rusya'ya", "Kremlin'den").
  return { re: new RegExp(`(^|${NOT_WORD})${escapeRegExp(normalizeText(trimmed))}`, "u"), onOriginal: false };
}

export function compileKeywords(keywords: string[], exclusions: string[]): CompiledKeywords {
  return {
    include: keywords.map(compileTerm).filter((t): t is CompiledTerm => t !== null),
    exclude: exclusions.map(compileTerm).filter((t): t is CompiledTerm => t !== null),
  };
}

export function matchesKeywords(compiled: CompiledKeywords, text: string): boolean {
  if (compiled.include.length === 0) return false;
  const normalized = normalizeText(text);
  const hit = (t: CompiledTerm) => t.re.test(t.onOriginal ? text : normalized);
  if (compiled.exclude.some(hit)) return false;
  return compiled.include.some(hit);
}

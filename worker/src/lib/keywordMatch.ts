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
  term: string;
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
    return { term: trimmed, re: new RegExp(`(^|${NOT_WORD})${escapeRegExp(trimmed)}($|${NOT_WORD})`, "u"), onOriginal: true };
  }
  // Only the start is anchored, so Turkish suffixes still match
  // ("Rusya'ya", "Kremlin'den").
  return { term: trimmed, re: new RegExp(`(^|${NOT_WORD})${escapeRegExp(normalizeText(trimmed))}`, "u"), onOriginal: false };
}

/**
 * Generated keyword lists pair languages and abbreviations in one entry
 * ("Türkiye / Turkey", "European Union (EU) / Avrupa Birliği (AB)"). As a
 * single term those never match anything, so each part is its own term.
 */
export function expandKeyword(keyword: string): string[] {
  return keyword
    .split(/\s+\/\s+/)
    .flatMap((part) => {
      const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(part.trim());
      return m ? [m[1]!, m[2]!] : [part];
    })
    .map((t) => t.trim())
    .filter(Boolean);
}

export function compileKeywords(keywords: string[], exclusions: string[]): CompiledKeywords {
  return {
    include: keywords.flatMap(expandKeyword).map(compileTerm).filter((t): t is CompiledTerm => t !== null),
    exclude: exclusions.flatMap(expandKeyword).map(compileTerm).filter((t): t is CompiledTerm => t !== null),
  };
}

/** The keywords found in the text (none if an exclusion term is present). */
export function matchedKeywords(compiled: CompiledKeywords, text: string): string[] {
  if (compiled.include.length === 0) return [];
  const normalized = normalizeText(text);
  const hit = (t: CompiledTerm) => t.re.test(t.onOriginal ? text : normalized);
  if (compiled.exclude.some(hit)) return [];
  return [...new Set(compiled.include.filter(hit).map((t) => t.term))];
}

export function matchesKeywords(compiled: CompiledKeywords, text: string): boolean {
  return matchedKeywords(compiled, text).length > 0;
}

/**
 * Postgres text/json rejects \u0000 and unpaired UTF-16 surrogates
 * ("unsupported Unicode escape sequence"). Source article text and
 * rendered email output both occasionally carry these through from
 * garbled source encoding - strip them at every boundary that writes
 * to Postgres rather than trusting upstream text to already be clean.
 */
export function sanitizeForPostgres(value: string): string {
  return value.replace(/\u0000/g, "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

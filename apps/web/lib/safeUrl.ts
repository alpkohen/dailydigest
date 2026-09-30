/**
 * outsideRadar/watchlist urls trace back to items.url, populated from
 * third-party RSS/HTML sources during ingest with no scheme check
 * upstream - reject anything that isn't a plain http(s) link before it
 * reaches an href.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

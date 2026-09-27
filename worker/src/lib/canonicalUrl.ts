const TRACKING_PARAM_PATTERNS = [
  /^utm_/,
  /^fbclid$/,
  /^gclid$/,
  /^mc_(cid|eid)$/,
  /^ref$/,
  /^ref_src$/,
  /^ref_url$/,
  /^igshid$/,
  /^spm$/,
  /^si$/,
  /^cmpid$/,
  /^icid$/,
];

/**
 * Strips tracking parameters, drops the fragment, lowercases the host, and
 * removes a trailing slash so re-syndicated links with different tracking
 * tags collapse to the same canonical_url (SPEC.md section 6, ingest stage).
 */
export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  const keep = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key.toLowerCase()))) {
      keep.append(key, value);
    }
  }
  keep.sort();
  url.search = keep.toString();

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

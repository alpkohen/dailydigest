import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * SSRF guard for user-supplied feed URLs (SPEC.md 4.1's owner-added RSS
 * sources, worker/src/connectors/rss.ts). A full-system audit found only a
 * bare http(s):// regex check at the point sources are created - nothing
 * stopped an owner (or anyone who could reach the form) from adding
 * "http://169.254.169.254/latest/meta-data/..." or "http://localhost:5432"
 * and having the worker fetch it server-side on a schedule.
 *
 * Checks both the literal hostname (if it's an IP) and, for hostnames,
 * every address they resolve to - a hostname that resolves to a private IP
 * (DNS rebinding) is rejected just as a literal private IP would be.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  // WHATWG URL keeps the brackets on an IPv6 literal hostname ("[::1]"),
  // which net.isIP() doesn't recognize - strip them before any IP check.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Local addresses are not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error("Private or reserved IP addresses are not allowed.");
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve host.");
  }
  if (addresses.length === 0) throw new Error("Could not resolve host.");
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) throw new Error("Host resolves to a private or reserved IP address.");
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  if (isIP(address) === 4) return isPrivateOrReservedIpv4(address);
  if (isIP(address) === 6) return isPrivateOrReservedIpv6(address);
  return true;
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments / 192.0.0.0/24 (incl. 192.0.0.169 metadata alias)
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT, RFC6598
  if (a >= 224) return true; // multicast (224/4) and reserved (240/4)

  return false;
}

function isPrivateOrReservedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local (RFC4193)
  // IPv4-mapped ("::ffff:a.b.c.d") - check the embedded IPv4 address too.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPrivateOrReservedIpv4(mapped[1]!);

  return false;
}

import { createHmac, timingSafeEqual } from "node:crypto";

export interface FeedbackLinkPayload {
  targetType: "item" | "story" | "source";
  targetId: string;
  signal: string;
  exp: number; // unix seconds
}

function encode(payload: FeedbackLinkPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/**
 * SPEC.md section 9: "Signed feedback links (HMAC, expiry 14 days) hit an
 * API route and redirect to a small confirmation page."
 */
export function createFeedbackLink(payload: Omit<FeedbackLinkPayload, "exp">, secret: string, ttlDays = 14): string {
  const full: FeedbackLinkPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 };
  const data = encode(full);
  const sig = sign(data, secret);
  return `${data}.${sig}`;
}

export function verifyFeedbackLink(token: string, secret: string): FeedbackLinkPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expectedSig = sign(data, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8")) as FeedbackLinkPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

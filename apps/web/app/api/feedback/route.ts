import { createServiceRoleClient, verifyFeedbackLink } from "@dailydigest/db";
import { NextResponse, type NextRequest } from "next/server";

/**
 * SPEC.md section 9: one-click feedback links from email. This is the one
 * deliberate, narrow exception to "service role key only in the worker"
 * (NFR, section 11): a click from an email client carries no Supabase
 * session, so there is no anon-key + RLS path available, and the HMAC
 * signature (verified below, 14-day expiry) is what stands in for auth
 * here instead of a session cookie.
 *
 * GET never mutates anything - a code review found the old version
 * changing data on GET, which mail clients' link-prescanning/safe-links
 * bots can trigger without the recipient ever clicking. GET only
 * validates the token and hands off to a confirmation page; the actual
 * write happens in POST, triggered by a real form submission there.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const secret = process.env.HMAC_SECRET;
  if (!token || !secret || !verifyFeedbackLink(token, secret)) {
    return NextResponse.redirect(new URL("/feedback-confirmed?ok=false", request.url));
  }

  return NextResponse.redirect(new URL(`/feedback-confirm?token=${encodeURIComponent(token)}`, request.url));
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const secret = process.env.HMAC_SECRET;
  if (!token || !secret) {
    return NextResponse.redirect(new URL("/feedback-confirmed?ok=false", request.url));
  }

  const payload = verifyFeedbackLink(token, secret);
  if (!payload) {
    return NextResponse.redirect(new URL("/feedback-confirmed?ok=false", request.url));
  }

  const ownerId = process.env.OWNER_ID;
  if (!ownerId) {
    return NextResponse.redirect(new URL("/feedback-confirmed?ok=false", request.url));
  }

  const db = createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  await db.from("feedback").insert({
    owner_id: ownerId,
    target_type: payload.targetType,
    target_id: payload.targetId,
    signal: payload.signal,
    context: "email",
  });

  if (payload.signal === "mute_source" && payload.targetType === "source") {
    await db.from("sources").update({ active: false }).eq("id", payload.targetId);
  }

  // Mirrors submitStoryFeedbackAction: "saved" also lands on the reading
  // list, and ignoreDuplicates keeps a re-click from wiping tags/notes.
  if (payload.signal === "saved" && payload.targetType === "story") {
    await db
      .from("reading_list")
      .upsert({ owner_id: ownerId, story_id: payload.targetId }, { onConflict: "owner_id,story_id", ignoreDuplicates: true });
  }

  return NextResponse.redirect(new URL(`/feedback-confirmed?ok=true&signal=${payload.signal}`, request.url));
}

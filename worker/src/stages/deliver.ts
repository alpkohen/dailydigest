import { createFeedbackLink, createServiceRoleClient } from "@dailydigest/db";
import { renderDailyBrief, type BriefContent } from "@dailydigest/email";
import { Resend } from "resend";
import type { Env } from "../env.js";

function withFeedbackLinks(content: BriefContent, env: Env): BriefContent {
  if (!env.HMAC_SECRET) return content;
  const secret = env.HMAC_SECRET;

  return {
    ...content,
    sections: content.sections.map((section) => {
      if (section.section === "new_research") return section;
      return {
        ...section,
        items: section.items.map((item) => ({
          ...item,
          links: {
            save: `${env.WEB_APP_URL}/api/feedback?token=${createFeedbackLink({ targetType: "story", targetId: item.id, signal: "saved" }, secret)}`,
            notRelevant: `${env.WEB_APP_URL}/api/feedback?token=${createFeedbackLink({ targetType: "story", targetId: item.id, signal: "not_relevant" }, secret)}`,
            lessLikeThis: `${env.WEB_APP_URL}/api/feedback?token=${createFeedbackLink({ targetType: "story", targetId: item.id, signal: "less_like_this" }, secret)}`,
          },
        })),
      };
    }),
  };
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => EMAIL_PATTERN.test(s));
}

function subjectFor(content: BriefContent, dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const critical = content.sections.find((s: BriefContent["sections"][number]) => s.section === "critical")?.items.length ?? 0;
  return `World Brief | ${day} | ${critical} critical`;
}

/**
 * SPEC.md section 6, stage 11 "Deliver": render React Email, send via
 * Resend, store the brief and delivery status. Skips sending (leaving the
 * brief "ready") when RESEND_API_KEY isn't configured yet, rather than
 * failing the whole run — matches the NFR that a missing piece never
 * blocks the rest of the pipeline.
 */
export async function runDeliverStage(env: Env, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: brief, error } = await db
    .from("briefs")
    .select("id, content")
    .eq("owner_id", env.OWNER_ID)
    .eq("kind", "daily")
    .eq("period_date", date)
    .eq("status", "ready")
    .single();
  if (error || !brief) {
    console.log(`deliver: no ready brief for ${date}, nothing to send`);
    return;
  }

  const content = withFeedbackLinks(brief.content as BriefContent, env);
  const dateLabel = formatDateLabel(date);
  const { html, text } = await renderDailyBrief(content, dateLabel);

  const recipients = env.BRIEF_RECIPIENT_EMAIL ? parseRecipients(env.BRIEF_RECIPIENT_EMAIL) : [];
  if (!env.RESEND_API_KEY || recipients.length === 0) {
    console.log("deliver: RESEND_API_KEY or BRIEF_RECIPIENT_EMAIL not set, storing rendered html without sending");
    await db.from("briefs").update({ html }).eq("id", brief.id);
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    // GitHub Actions injects an unset secret as an empty string, not
    // undefined, so `?? default` silently passed "" as the from address
    // (Resend's actual error: "The domain is invalid"). `||` catches both.
    from: env.RESEND_FROM_EMAIL || "World Brief <onboarding@resend.dev>",
    to: recipients,
    subject: subjectFor(content, date),
    html,
    text,
  });

  if (result.error) {
    const { error: markFailedError } = await db.from("briefs").update({ html, status: "failed" }).eq("id", brief.id);
    if (markFailedError) console.error(`deliver: failed to mark brief ${brief.id} as failed: ${markFailedError.message}`);
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  // A real send with no error checking here once left the brief stuck on
  // "ready" - the email sent (confirmed by a Resend id) but the DB never
  // recorded it, so deliver would have resent it on the next run. Check
  // the error and the affected row count explicitly rather than trusting
  // an unchecked await.
  const { data: updated, error: markSentError } = await db
    .from("briefs")
    .update({ html, sent_at: new Date().toISOString(), resend_id: result.data?.id, status: "sent" })
    .eq("id", brief.id)
    .select("id");
  if (markSentError || !updated || updated.length === 0) {
    throw new Error(
      `deliver: email sent (resend id ${result.data?.id}) but failed to mark brief ${brief.id} as sent: ${markSentError?.message ?? "no rows updated"}`,
    );
  }

  console.log(`deliver stage done: brief ${brief.id} sent (resend id ${result.data?.id})`);
}

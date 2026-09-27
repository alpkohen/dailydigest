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

  if (!env.RESEND_API_KEY || !env.BRIEF_RECIPIENT_EMAIL) {
    console.log("deliver: RESEND_API_KEY or BRIEF_RECIPIENT_EMAIL not set, storing rendered html without sending");
    await db.from("briefs").update({ html }).eq("id", brief.id);
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL ?? "World Brief <onboarding@resend.dev>",
    to: env.BRIEF_RECIPIENT_EMAIL,
    subject: subjectFor(content, date),
    html,
    text,
  });

  if (result.error) {
    await db.from("briefs").update({ html, status: "failed" }).eq("id", brief.id);
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  await db
    .from("briefs")
    .update({ html, sent_at: new Date().toISOString(), resend_id: result.data?.id, status: "sent" })
    .eq("id", brief.id);

  console.log(`deliver stage done: brief ${brief.id} sent (resend id ${result.data?.id})`);
}

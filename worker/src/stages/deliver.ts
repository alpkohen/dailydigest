import { createServiceRoleClient } from "@dailydigest/db";
import { renderDailyBrief, type BriefContent } from "@dailydigest/email";
import { Resend } from "resend";
import type { Env } from "../env.js";

const DAY_NAMES_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${DAY_NAMES_TR[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES_TR[d.getUTCMonth()]}`;
}

function subjectFor(content: BriefContent, dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const critical = content.sections.find((s: BriefContent["sections"][number]) => s.section === "critical")?.items.length ?? 0;
  return `dailydigest | ${d.getUTCDate()} ${MONTH_NAMES_TR[d.getUTCMonth()]} | ${critical} kritik gelişme`;
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

  const content = brief.content as BriefContent;
  const dateLabel = formatDateLabel(date);
  const { html, text } = await renderDailyBrief(content, dateLabel);

  if (!env.RESEND_API_KEY || !env.BRIEF_RECIPIENT_EMAIL) {
    console.log("deliver: RESEND_API_KEY or BRIEF_RECIPIENT_EMAIL not set, storing rendered html without sending");
    await db.from("briefs").update({ html }).eq("id", brief.id);
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL ?? "dailydigest <onboarding@resend.dev>",
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

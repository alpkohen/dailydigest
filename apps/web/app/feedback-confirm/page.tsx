import Image from "next/image";
import { verifyFeedbackLink } from "@dailydigest/db";

const SIGNAL_QUESTIONS: Record<string, string> = {
  relevant: "Mark this as relevant?",
  not_relevant: "Mark this as not relevant?",
  less_like_this: "See less like this?",
  saved: "Save this to your reading list?",
  mute_source: "Mute this source?",
};

/**
 * The one confirmation step between a GET (which a mail client's link
 * scanner can trigger unattended) and the actual write, which only ever
 * happens from a real form POST triggered by the recipient clicking here.
 */
export default async function FeedbackConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const secret = process.env.HMAC_SECRET;
  const payload = token && secret ? verifyFeedbackLink(token, secret) : null;

  return (
    <main style={{ padding: "80px 24px", textAlign: "center" }}>
      <Image
        src="/brand/world-brief-full.webp"
        alt="World Brief. The world's daily briefing, minus the drama."
        width={1248}
        height={299}
        style={{ width: "100%", maxWidth: 340, height: "auto", margin: "0 auto" }}
        priority
      />
      {payload ? (
        <>
          <p className="dek" style={{ color: "var(--text)" }}>{SIGNAL_QUESTIONS[payload.signal] ?? "Apply this feedback?"}</p>
          <form action="/api/feedback" method="POST" style={{ marginTop: 16 }}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn btn-primary">
              Confirm
            </button>
          </form>
        </>
      ) : (
        <p className="text-danger">This link is invalid or has expired.</p>
      )}
    </main>
  );
}

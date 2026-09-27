import Image from "next/image";

const SIGNAL_LABELS: Record<string, string> = {
  relevant: "Marked as relevant.",
  not_relevant: "Marked as not relevant.",
  less_like_this: "You'll see less like this.",
  saved: "Saved.",
  mute_source: "Source muted.",
};

export default async function FeedbackConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; signal?: string }>;
}) {
  const { ok, signal } = await searchParams;

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
      {ok === "true" ? (
        <p className="dek" style={{ color: "var(--text)" }}>{(signal && SIGNAL_LABELS[signal]) ?? "Your feedback was recorded."}</p>
      ) : (
        <p className="text-danger">This link is invalid or has expired.</p>
      )}
    </main>
  );
}

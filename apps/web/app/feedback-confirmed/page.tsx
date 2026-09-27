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
      <h1 className="h1-serif">
        <span className="text-accent">World</span> Brief<span className="text-accent">.</span>
      </h1>
      {ok === "true" ? (
        <p className="dek" style={{ color: "var(--text)" }}>{(signal && SIGNAL_LABELS[signal]) ?? "Your feedback was recorded."}</p>
      ) : (
        <p className="text-danger">This link is invalid or has expired.</p>
      )}
    </main>
  );
}

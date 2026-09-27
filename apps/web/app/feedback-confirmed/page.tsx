const SIGNAL_LABELS: Record<string, string> = {
  relevant: "İlgili olarak işaretlendi.",
  not_relevant: "İlgisiz olarak işaretlendi.",
  less_like_this: "Bunun gibi daha az içerik göreceksin.",
  saved: "Kaydedildi.",
  mute_source: "Kaynak susturuldu.",
};

export default async function FeedbackConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; signal?: string }>;
}) {
  const { ok, signal } = await searchParams;

  return (
    <main style={{ padding: "80px 24px", textAlign: "center" }}>
      <h1 className="h1-serif">dailydigest.</h1>
      {ok === "true" ? (
        <p className="dek" style={{ color: "var(--text)" }}>{(signal && SIGNAL_LABELS[signal]) ?? "Geri bildirimin kaydedildi."}</p>
      ) : (
        <p className="text-danger">Bu link geçersiz veya süresi dolmuş.</p>
      )}
    </main>
  );
}

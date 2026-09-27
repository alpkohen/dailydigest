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
    <main style={{ fontFamily: "-apple-system, Helvetica, Arial, sans-serif", padding: "3rem 1.5rem", textAlign: "center" }}>
      <h1 style={{ fontSize: 18 }}>dailydigest</h1>
      {ok === "true" ? (
        <p>{(signal && SIGNAL_LABELS[signal]) ?? "Geri bildirimin kaydedildi."}</p>
      ) : (
        <p>Bu link geçersiz veya süresi dolmuş.</p>
      )}
    </main>
  );
}

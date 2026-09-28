import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WatchForm } from "./WatchForm";
import { WatchRow } from "./WatchRow";

export default async function WatchlistPage() {
  const supabase = await createServerSupabaseClient();
  const { data: watches } = await supabase
    .from("watches")
    .select("id, name, kind, active")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: recentItems } = await supabase
    .from("watch_items")
    .select("watches(name), items(id, title, url, published_at, sources(name))")
    .order("created_at", { ascending: false })
    .limit(20);

  type Row = {
    watches: { name: string } | null;
    items: { id: string; title: string; url: string; published_at: string | null; sources: { name: string } | null } | null;
  };
  const recent = ((recentItems ?? []) as unknown as Row[]).filter((r) => r.items);

  function sourceLabel(item: NonNullable<Row["items"]>): string {
    if (item.sources?.name) return item.sources.name;
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      return "Unknown source";
    }
  }

  return (
    <main>
      <h1 className="h1-serif">Watchlist</h1>
      <WatchForm />
      {(watches ?? []).map((w) => (
        <WatchRow key={w.id} id={w.id} name={w.name} kind={w.kind} active={w.active} />
      ))}
      {(watches ?? []).length === 0 && <p className="empty">Nothing tracked yet.</p>}

      <section className="section">
        <h2 className="h2-section">Recently captured</h2>
        <div className="link-list">
          {recent.map((r, i) => (
            <a key={i} href={r.items!.url} target="_blank" rel="noreferrer">
              <div className="row-title" style={{ fontSize: 13 }}>{r.items!.title}</div>
              <div className="row-meta">
                Watch: {r.watches?.name ?? "Unknown"} · Source: {sourceLabel(r.items!)}
              </div>
            </a>
          ))}
        </div>
        {recent.length === 0 && <p className="empty">Nothing captured yet.</p>}
      </section>
    </main>
  );
}

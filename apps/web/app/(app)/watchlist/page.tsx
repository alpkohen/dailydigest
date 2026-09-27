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
    .select("watches(name), items(id, title, url, published_at)")
    .order("created_at", { ascending: false })
    .limit(20);

  type Row = { watches: { name: string } | null; items: { id: string; title: string; url: string; published_at: string | null } | null };
  const recent = ((recentItems ?? []) as unknown as Row[]).filter((r) => r.items);

  return (
    <main>
      <h1 style={{ fontSize: 20 }}>Takip listesi</h1>
      <WatchForm />
      {(watches ?? []).map((w) => (
        <WatchRow key={w.id} id={w.id} name={w.name} kind={w.kind} active={w.active} />
      ))}
      {(watches ?? []).length === 0 && <p style={{ color: "#888", fontSize: 14 }}>Henüz takip yok.</p>}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 15 }}>Son yakalananlar</h2>
        {recent.map((r, i) => (
          <a key={i} href={r.items!.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: "inherit", textDecoration: "none" }}>
            <span style={{ fontSize: 13 }}>{r.items!.title}</span>
            <span style={{ fontSize: 11, color: "#999" }}> — {r.watches?.name}</span>
          </a>
        ))}
        {recent.length === 0 && <p style={{ color: "#888", fontSize: 13 }}>Henüz bir şey yakalanmadı.</p>}
      </section>
    </main>
  );
}

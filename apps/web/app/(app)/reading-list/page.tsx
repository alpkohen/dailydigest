import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReadingListRow } from "./ReadingListRow";

export default async function ReadingListPage() {
  const supabase = await createServerSupabaseClient();
  const { data: rows } = await supabase
    .from("reading_list")
    .select("id, tags, notes, read_at, stories(id, title), items(id, title, url)")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    tags: string[];
    notes: string | null;
    read_at: string | null;
    stories: { id: string; title: string } | null;
    items: { id: string; title: string; url: string } | null;
  };

  const entries = ((rows ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.stories?.title ?? r.items?.title ?? "(untitled)",
    href: r.stories ? `/story/${r.stories.id}` : (r.items?.url ?? "#"),
    isRead: Boolean(r.read_at),
    notes: r.notes ?? "",
    tags: r.tags ?? [],
  }));

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Okuma listesi</h1>
        <a href="/api/reading-list/export" style={{ fontSize: 12 }}>
          Markdown olarak dışa aktar
        </a>
      </div>
      {entries.map((e) => (
        <ReadingListRow key={e.id} {...e} />
      ))}
      {entries.length === 0 && <p style={{ color: "#888", fontSize: 14 }}>Henüz kaydedilen bir şey yok. Story sayfasından &quot;Kaydet&quot; ile ekleyebilirsin.</p>}
    </main>
  );
}

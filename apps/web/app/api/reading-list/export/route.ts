import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** SPEC.md section 4.13: "Export to Markdown." */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: rows } = await supabase
    .from("reading_list")
    .select("tags, notes, read_at, stories(title, summary), items(title, url)")
    .order("created_at", { ascending: false });

  type Row = {
    tags: string[];
    notes: string | null;
    read_at: string | null;
    stories: { title: string; summary: string | null } | null;
    items: { title: string; url: string } | null;
  };

  const lines = ["# Okuma listesi", ""];
  for (const row of (rows ?? []) as unknown as Row[]) {
    const title = row.stories?.title ?? row.items?.title ?? "(untitled)";
    lines.push(`## ${title}`);
    if (row.items?.url) lines.push(`${row.items.url}`);
    if (row.stories?.summary) lines.push("", row.stories.summary);
    if (row.tags?.length) lines.push("", `Etiketler: ${row.tags.join(", ")}`);
    if (row.notes) lines.push("", `Not: ${row.notes}`);
    lines.push("", row.read_at ? "Okundu" : "Okunmadı", "", "---", "");
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="okuma-listesi.md"',
    },
  });
}

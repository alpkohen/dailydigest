import type { ReactNode } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name")
    .eq("active", true)
    .order("name");

  const { count: unreadCount } = await supabase
    .from("reading_list")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return (
    <div className="app-shell">
      <Sidebar topics={topics ?? []} unreadCount={unreadCount ?? 0} />
      <div className="app-content">
        <div className="page">{children}</div>
      </div>
    </div>
  );
}

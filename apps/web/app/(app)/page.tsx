import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TodayView } from "@/components/TodayView";
import { loadTodayViewProps } from "./briefData";
import { OWNER_FIRST_NAME } from "@/lib/ownerProfile";

export default async function TodayPage() {
  const supabase = await createServerSupabaseClient();

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, period_date, content")
    .eq("kind", "daily")
    .order("period_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!brief) {
    return (
      <main>
        <h1 className="h1-serif">Günaydın, {OWNER_FIRST_NAME}.</h1>
        <p className="empty">Henüz bir brief oluşturulmadı.</p>
      </main>
    );
  }

  const props = await loadTodayViewProps(supabase, brief);
  return <TodayView {...props} />;
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TodayView } from "@/components/TodayView";
import { loadTodayViewProps } from "./briefData";

// The home page lists live data (the last 24 hours of events), so it must
// not be served from a build-time cache.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createServerSupabaseClient();

  const { data: brief } = await supabase
    .from("briefs")
    .select("id, period_date, content")
    .eq("kind", "daily")
    .order("period_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const props = await loadTodayViewProps(supabase, brief, { live: true });
  return <TodayView {...props} />;
}

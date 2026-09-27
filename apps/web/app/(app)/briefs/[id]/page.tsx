import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TodayView } from "@/components/TodayView";
import { loadTodayViewProps } from "../../briefData";

export default async function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: brief } = await supabase.from("briefs").select("id, period_date, content").eq("id", id).maybeSingle();
  if (!brief) notFound();

  const props = await loadTodayViewProps(supabase, brief);
  return <TodayView {...props} />;
}

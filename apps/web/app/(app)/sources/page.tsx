import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SourceRow } from "./SourceRow";

export default async function SourcesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, type, weight, health_status, active, perspective_groups(name)")
    .order("name");

  type Row = {
    id: string;
    name: string;
    type: string;
    weight: number;
    health_status: string;
    active: boolean;
    perspective_groups: { name: string } | null;
  };

  return (
    <main>
      <h1 className="h1-serif">Sources</h1>
      {((sources ?? []) as unknown as Row[]).map((s) => (
        <SourceRow
          key={s.id}
          id={s.id}
          name={s.name}
          type={s.type}
          weight={s.weight}
          healthStatus={s.health_status}
          perspectiveGroup={s.perspective_groups?.name ?? null}
          active={s.active}
        />
      ))}
    </main>
  );
}

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>dailydigest</h1>
      <p>Signed in as {user?.email}.</p>
      <p>
        Owner id (copy this into the worker&apos;s <code>OWNER_ID</code> secret):
      </p>
      <pre style={{ background: "#f4f4f4", padding: "0.75rem", borderRadius: 4 }}>{user?.id}</pre>
      <p>Nothing else is built yet — this is the M0 scaffold.</p>
    </main>
  );
}

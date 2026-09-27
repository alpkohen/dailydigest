"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "80px 20px" }}>
      <h1 className="h1-serif">dailydigest.</h1>
      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
        <label className="field">
          <span className="field-label">E-posta</span>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </label>
        <button type="submit" className="btn btn-primary">
          Giriş linki gönder
        </button>
      </form>
      {status === "sent" && <p className="text-accent" style={{ fontSize: 13, marginTop: 16 }}>Giriş linki için gelen kutunu kontrol et.</p>}
      {status === "error" && <p className="text-danger" style={{ fontSize: 13, marginTop: 16 }}>Link gönderilirken bir sorun oluştu.</p>}
    </main>
  );
}

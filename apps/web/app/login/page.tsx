"use client";

import Image from "next/image";
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
      <Image src="/brand/world-brief-full.webp" alt="World Brief. The world's daily briefing, minus the drama." width={1248} height={299} style={{ width: "100%", height: "auto" }} priority />
      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
        <label className="field">
          <span className="field-label">Email</span>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </label>
        <button type="submit" className="btn btn-primary">
          Send sign-in link
        </button>
      </form>
      {status === "sent" && <p className="text-accent" style={{ fontSize: 13, marginTop: 16 }}>Check your inbox for the sign-in link.</p>}
      {status === "error" && <p className="text-danger" style={{ fontSize: 13, marginTop: 16 }}>Something went wrong sending the link.</p>}
    </main>
  );
}

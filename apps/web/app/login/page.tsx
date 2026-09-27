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
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 400 }}>
      <h1>dailydigest</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: "block", width: "100%", margin: "0.5rem 0", padding: "0.5rem" }}
        />
        <button type="submit">Send magic link</button>
      </form>
      {status === "sent" && <p>Check your inbox for the sign-in link.</p>}
      {status === "error" && <p>Something went wrong sending the link.</p>}
    </main>
  );
}

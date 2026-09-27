"use client";

import { useRef, useState, useTransition } from "react";
import { createWatchAction } from "./actions";

export function WatchForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createWatchAction(formData);
          if (result.error) setError(result.error);
          else formRef.current?.reset();
        });
      }}
      style={{ margin: "16px 0", display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      <input name="name" placeholder="İsim (kişi, kurum, dergi)" required disabled={pending} style={{ padding: "8px 10px", fontSize: 14 }} />
      <select name="kind" disabled={pending} style={{ padding: "8px 10px", fontSize: 14 }}>
        <option value="person">Kişi</option>
        <option value="institution">Kurum</option>
        <option value="journal">Dergi</option>
      </select>
      <input name="query" placeholder="Arama sorgusu (opsiyonel, boşsa isim kullanılır)" disabled={pending} style={{ flex: 1, minWidth: 200, padding: "8px 10px", fontSize: 14 }} />
      <button type="submit" disabled={pending}>
        {pending ? "Ekleniyor..." : "Ekle"}
      </button>
      {error && <span style={{ color: "#c00", fontSize: 12, alignSelf: "center" }}>{error}</span>}
    </form>
  );
}

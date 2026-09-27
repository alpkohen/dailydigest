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
      className="form-row"
    >
      <input name="name" className="input" placeholder="İsim (kişi, kurum, dergi)" required disabled={pending} />
      <select name="kind" className="select" disabled={pending}>
        <option value="person">Kişi</option>
        <option value="institution">Kurum</option>
        <option value="journal">Dergi</option>
      </select>
      <input name="query" className="input grow" placeholder="Arama sorgusu (opsiyonel, boşsa isim kullanılır)" disabled={pending} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Ekleniyor..." : "Ekle"}
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12 }}>{error}</span>}
    </form>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { createTopicAction } from "./actions";

export function TopicForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createTopicAction(formData);
          if (result.error) setError(result.error);
          else formRef.current?.reset();
        });
      }}
      style={{ margin: "16px 0", display: "flex", gap: 8 }}
    >
      <input
        name="sentence"
        placeholder="Bir cümleyle yeni bir konu tanımla..."
        required
        disabled={pending}
        style={{ flex: 1, padding: "8px 10px", fontSize: 14 }}
      />
      <button type="submit" disabled={pending}>
        {pending ? "Oluşturuluyor..." : "Ekle"}
      </button>
      {error && <span style={{ color: "#c00", fontSize: 12, alignSelf: "center" }}>{error}</span>}
    </form>
  );
}

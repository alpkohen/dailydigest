"use client";

import { useTransition } from "react";
import { deleteTopicAction, setTopicActiveAction } from "./actions";

export function TopicRow({
  id,
  name,
  priority,
  frequency,
  active,
}: {
  id: string;
  name: string;
  priority: string;
  frequency: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div>
        <a href={`/topics/${id}`} style={{ fontWeight: 600, fontSize: 14, color: "inherit", textDecoration: "none" }}>
          {name}
        </a>
        <div style={{ fontSize: 11, color: "#888" }}>
          {priority} · {frequency} · {active ? "aktif" : "pasif"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={pending} onClick={() => startTransition(() => setTopicActiveAction(id, !active))}>
          {active ? "Duraklat" : "Etkinleştir"}
        </button>
        {active && (
          <button disabled={pending} onClick={() => startTransition(() => deleteTopicAction(id))}>
            Sil
          </button>
        )}
      </div>
    </div>
  );
}

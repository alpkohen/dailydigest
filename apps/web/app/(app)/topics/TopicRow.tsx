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
    <div className="row-flex">
      <div>
        <a href={`/topics/${id}`} className="row-title" style={{ textDecoration: "none", display: "block" }}>
          {name}
        </a>
        <div className="row-meta">
          {priority} · {frequency} · {active ? "aktif" : "pasif"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => setTopicActiveAction(id, !active))}>
          {active ? "Duraklat" : "Etkinleştir"}
        </button>
        {active && (
          <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => deleteTopicAction(id))}>
            Sil
          </button>
        )}
      </div>
    </div>
  );
}

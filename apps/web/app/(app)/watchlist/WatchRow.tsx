"use client";

import { useTransition } from "react";
import { setWatchActiveAction } from "./actions";

const KIND_LABELS: Record<string, string> = { person: "Kişi", institution: "Kurum", journal: "Dergi" };

export function WatchRow({ id, name, kind, active }: { id: string; name: string; kind: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
        <div style={{ fontSize: 11, color: "#888" }}>
          {KIND_LABELS[kind] ?? kind} · {active ? "aktif" : "pasif"}
        </div>
      </div>
      <button disabled={pending} onClick={() => startTransition(() => setWatchActiveAction(id, !active))}>
        {active ? "Duraklat" : "Etkinleştir"}
      </button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { setWatchActiveAction } from "./actions";

const KIND_LABELS: Record<string, string> = { person: "Person", institution: "Institution", journal: "Journal" };

export function WatchRow({ id, name, kind, active }: { id: string; name: string; kind: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="row-flex">
      <div>
        <span className="row-title">{name}</span>
        <div className="row-meta">
          {KIND_LABELS[kind] ?? kind} · {active ? "active" : "inactive"}
        </div>
      </div>
      <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => setWatchActiveAction(id, !active))}>
        {active ? "Pause" : "Activate"}
      </button>
    </div>
  );
}

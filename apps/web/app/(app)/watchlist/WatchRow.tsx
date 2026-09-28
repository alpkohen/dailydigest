"use client";

import { useState, useTransition } from "react";
import { setWatchActiveAction } from "./actions";

const KIND_LABELS: Record<string, string> = { person: "Person", institution: "Institution", journal: "Journal" };

export function WatchRow({ id, name, kind, active }: { id: string; name: string; kind: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="row-flex">
      <div>
        <span className="row-title">{name}</span>
        <div className="row-meta">
          {KIND_LABELS[kind] ?? kind} · {active ? "active" : "inactive"}
        </div>
        {error && <div className="text-danger" style={{ fontSize: 12 }}>{error}</div>}
      </div>
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setWatchActiveAction(id, !active);
            if (!result.ok) setError(result.error ?? "Could not update.");
          })
        }
      >
        {active ? "Pause" : "Activate"}
      </button>
    </div>
  );
}

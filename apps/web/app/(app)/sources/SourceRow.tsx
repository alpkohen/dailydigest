"use client";

import { useState, useTransition } from "react";
import { setSourceActiveAction } from "./actions";

const HEALTH_BADGE: Record<string, string> = {
  ok: "badge-accent",
  degraded: "badge-critical",
  broken: "badge-danger",
  unknown: "badge-neutral",
};

export function SourceRow({
  id,
  name,
  type,
  weight,
  healthStatus,
  perspectiveGroup,
  active,
}: {
  id: string;
  name: string;
  type: string;
  weight: number;
  healthStatus: string;
  perspectiveGroup: string | null;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="row-flex">
      <div>
        <span className="row-title" style={{ marginRight: 8 }}>{name}</span>
        <span className={`badge ${HEALTH_BADGE[healthStatus] ?? "badge-neutral"}`}>{healthStatus}</span>
        <div className="row-meta">
          {type} · weight {weight} {perspectiveGroup ? `· ${perspectiveGroup}` : ""}
        </div>
        {error && <div className="text-danger" style={{ fontSize: 12 }}>{error}</div>}
      </div>
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setSourceActiveAction(id, !active);
            if (!result.ok) setError(result.error ?? "Could not update.");
          })
        }
      >
        {active ? "Mute" : "Activate"}
      </button>
    </div>
  );
}

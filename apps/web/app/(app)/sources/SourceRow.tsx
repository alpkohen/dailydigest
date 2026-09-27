"use client";

import { useTransition } from "react";
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

  return (
    <div className="row-flex">
      <div>
        <span className="row-title" style={{ marginRight: 8 }}>{name}</span>
        <span className={`badge ${HEALTH_BADGE[healthStatus] ?? "badge-neutral"}`}>{healthStatus}</span>
        <div className="row-meta">
          {type} · ağırlık {weight} {perspectiveGroup ? `· ${perspectiveGroup}` : ""}
        </div>
      </div>
      <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => setSourceActiveAction(id, !active))}>
        {active ? "Sustur" : "Etkinleştir"}
      </button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { setSourceActiveAction } from "./actions";

const HEALTH_COLOR: Record<string, string> = {
  ok: "#2a7",
  degraded: "#c90",
  broken: "#c33",
  unknown: "#999",
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
        <span
          style={{
            marginLeft: 8,
            fontSize: 10,
            color: "#fff",
            background: HEALTH_COLOR[healthStatus] ?? "#999",
            borderRadius: 3,
            padding: "1px 5px",
          }}
        >
          {healthStatus}
        </span>
        <div style={{ fontSize: 11, color: "#888" }}>
          {type} · ağırlık {weight} {perspectiveGroup ? `· ${perspectiveGroup}` : ""}
        </div>
      </div>
      <button disabled={pending} onClick={() => startTransition(() => setSourceActiveAction(id, !active))}>
        {active ? "Sustur" : "Etkinleştir"}
      </button>
    </div>
  );
}

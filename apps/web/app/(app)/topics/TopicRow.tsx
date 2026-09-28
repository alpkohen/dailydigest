"use client";

import { useState, useTransition } from "react";
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
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="row-flex">
      <div>
        <a href={`/topics/${id}`} className="row-title" style={{ textDecoration: "none", display: "block" }}>
          {name}
        </a>
        <div className="row-meta">
          {priority} · {frequency} · {active ? "active" : "inactive"}
        </div>
        {error && <div className="text-danger" style={{ fontSize: 12 }}>{error}</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await setTopicActiveAction(id, !active);
              if (!result.ok) setError(result.error ?? "Could not update.");
            })
          }
        >
          {active ? "Pause" : "Activate"}
        </button>
        {active && (
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await deleteTopicAction(id);
                if (!result.ok) setError(result.error ?? "Could not delete.");
              })
            }
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

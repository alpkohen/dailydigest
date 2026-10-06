"use client";

import { useState, useTransition } from "react";
import { requestMoreSourcesAction } from "./actions";

export function MoreSourcesButton({ topicId, queued }: { topicId: string; queued: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (queued) return <p className="text-faint" style={{ fontSize: 12 }}>Looking for sources: results arrive with the next collect run (within two hours).</p>;
  return (
    <div>
      <button
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await requestMoreSourcesAction(topicId);
            if (!result.ok) setError(result.error ?? "Could not queue.");
          })
        }
      >
        Find more sources
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12, marginLeft: 8 }}>{error}</span>}
    </div>
  );
}

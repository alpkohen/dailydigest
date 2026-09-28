"use client";

import { useState, useTransition } from "react";
import { submitStoryFeedbackAction } from "./actions";

const SIGNALS: { signal: string; label: string }[] = [
  { signal: "relevant", label: "Relevant" },
  { signal: "not_relevant", label: "Not relevant" },
  { signal: "less_like_this", label: "Show less like this" },
  { signal: "saved", label: "Save" },
];

export function FeedbackButtons({ storyId }: { storyId: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ margin: "18px 0" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SIGNALS.map(({ signal, label }) => (
          <button
            key={signal}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await submitStoryFeedbackAction(storyId, signal);
                if (result.ok) setSent(signal);
                else setError(result.error ?? "Could not record feedback.");
              })
            }
            className={`btn btn-sm${sent === signal ? " btn-primary" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-danger" style={{ fontSize: 12, marginTop: 6 }}>{error}</p>}
    </div>
  );
}

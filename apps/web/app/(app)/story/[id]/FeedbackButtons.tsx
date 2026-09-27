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

  return (
    <div style={{ display: "flex", gap: 8, margin: "18px 0", flexWrap: "wrap" }}>
      {SIGNALS.map(({ signal, label }) => (
        <button
          key={signal}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await submitStoryFeedbackAction(storyId, signal);
              setSent(signal);
            })
          }
          className={`btn btn-sm${sent === signal ? " btn-primary" : ""}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

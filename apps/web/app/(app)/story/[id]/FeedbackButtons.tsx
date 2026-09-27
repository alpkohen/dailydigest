"use client";

import { useState, useTransition } from "react";
import { submitStoryFeedbackAction } from "./actions";

const SIGNALS: { signal: string; label: string }[] = [
  { signal: "relevant", label: "İlgili" },
  { signal: "not_relevant", label: "İlgisiz" },
  { signal: "less_like_this", label: "Bunun gibi az göster" },
  { signal: "saved", label: "Kaydet" },
];

export function FeedbackButtons({ storyId }: { storyId: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
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
          style={{
            fontSize: 12,
            padding: "5px 10px",
            background: sent === signal ? "#e6f4ea" : "#f4f4f4",
            border: "1px solid #ddd",
            borderRadius: 4,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

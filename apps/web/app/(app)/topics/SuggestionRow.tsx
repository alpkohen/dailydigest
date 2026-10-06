"use client";

import { useState, useTransition } from "react";
import { addSuggestedSourceAction, dismissSuggestionAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  ok: "feed checked",
  stale: "feed quiet lately",
  no_feed: "no feed found",
  blocked: "blocked",
  added: "added",
  dismissed: "dismissed",
};

export function SuggestionRow({
  id,
  topicId,
  name,
  homepage,
  reason,
  sourceType,
  recentItems,
  status,
  note,
}: {
  id: string;
  topicId: string;
  name: string;
  homepage: string | null;
  reason: string | null;
  sourceType: string | null;
  recentItems: number | null;
  status: string;
  note: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const addable = status === "ok" || status === "stale";
  const badge = status === "ok" ? "badge-accent" : status === "added" ? "badge-neutral" : status === "stale" ? "badge-critical" : "badge-danger";

  return (
    <div className="row-flex">
      <div>
        {homepage && /^https?:\/\//i.test(homepage) ? (
          <a href={homepage} target="_blank" rel="noreferrer" className="row-title" style={{ marginRight: 8 }}>
            {name}
          </a>
        ) : (
          <span className="row-title" style={{ marginRight: 8 }}>{name}</span>
        )}
        <span className={`badge ${badge}`}>{STATUS_LABEL[status] ?? status}</span>
        {reason && <div className="row-summary">{reason}</div>}
        <div className="row-meta">
          {sourceType ? `${sourceType}` : ""}
          {recentItems !== null && sourceType ? ` · ${recentItems} recent items` : ""}
          {note ? `${sourceType ? " · " : ""}${note}` : ""}
        </div>
        {error && <div className="text-danger" style={{ fontSize: 12 }}>{error}</div>}
      </div>
      {(addable || status === "no_feed" || status === "blocked") && (
        <div style={{ display: "flex", gap: 8 }}>
          {addable && (
            <button
              className="btn btn-sm btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await addSuggestedSourceAction(id);
                  if (!result.ok) setError(result.error ?? "Could not add.");
                })
              }
            >
              Add
            </button>
          )}
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await dismissSuggestionAction(id, topicId);
                if (!result.ok) setError(result.error ?? "Could not dismiss.");
              })
            }
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setQuestionActiveAction } from "./actions";

export function QuestionRow({ id, text, active, createdAt, evidenceCount, lastUpdatedAt }: { id: string; text: string; active: boolean; createdAt: string; evidenceCount: number; lastUpdatedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const addedLabel = new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
  const updatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" })
    : null;

  return (
    <div className="row-flex">
      <Link href={`/questions/${id}`} style={{ flex: 1, textDecoration: "none" }}>
        <div className="row-title">{text}</div>
        <div className="row-meta" style={{ marginTop: 5 }}>
          Tracking since {addedLabel} · {evidenceCount === 0 ? "No evidence yet" : `${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"}`}
          {updatedLabel ? ` · Updated ${updatedLabel}` : ""}
        </div>
      </Link>
      <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => setQuestionActiveAction(id, !active))}>
        {active ? "Pause" : "Activate"}
      </button>
    </div>
  );
}

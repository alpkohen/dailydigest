"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setQuestionActiveAction } from "./actions";

export function QuestionRow({ id, text, active }: { id: string; text: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="row-flex">
      <Link href={`/questions/${id}`} className="row-title" style={{ flex: 1, textDecoration: "none" }}>
        {text}
      </Link>
      <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => setQuestionActiveAction(id, !active))}>
        {active ? "Pause" : "Activate"}
      </button>
    </div>
  );
}

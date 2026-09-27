"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setQuestionActiveAction } from "./actions";

export function QuestionRow({ id, text, active }: { id: string; text: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <Link href={`/questions/${id}`} style={{ fontSize: 14, color: "inherit", textDecoration: "none", flex: 1 }}>
        {text}
      </Link>
      <button disabled={pending} onClick={() => startTransition(() => setQuestionActiveAction(id, !active))}>
        {active ? "Duraklat" : "Etkinleştir"}
      </button>
    </div>
  );
}

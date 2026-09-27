"use client";

import { useState, useTransition } from "react";
import { askStoryAction } from "./askAction";

export function AskStory({ storyId }: { storyId: string }) {
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section style={{ margin: "16px 0" }}>
      <h2 style={{ fontSize: 15 }}>Bu story hakkında sor</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setAnswer(null);
          startTransition(async () => {
            const r = await askStoryAction(storyId, question);
            if (r.error) setError(r.error);
            else setAnswer(r.answer ?? null);
          });
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="bir soru yaz..." style={{ flex: 1, padding: "6px 8px", fontSize: 13 }} />
        <button type="submit" disabled={pending}>
          {pending ? "..." : "Sor"}
        </button>
      </form>
      {answer && <p style={{ fontSize: 13, lineHeight: "20px", marginTop: 8 }}>{answer}</p>}
      {error && <p style={{ fontSize: 12, color: "#c00" }}>{error}</p>}
    </section>
  );
}

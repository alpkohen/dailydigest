"use client";

import { useState, useTransition } from "react";
import { askStoryAction } from "./askAction";

export function AskStory({ storyId }: { storyId: string }) {
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="section">
      <h2 className="h2-section">Bu story hakkında sor</h2>
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
        className="form-row"
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="bir soru yaz..." className="input grow" />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "..." : "Sor"}
        </button>
      </form>
      {answer && <p className="dek" style={{ color: "var(--text)", marginTop: 10 }}>{answer}</p>}
      {error && <p className="text-danger" style={{ fontSize: 12 }}>{error}</p>}
    </section>
  );
}

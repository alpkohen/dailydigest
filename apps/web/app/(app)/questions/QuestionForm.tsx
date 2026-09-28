"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuestionAction } from "./actions";

export function QuestionForm() {
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        setWarning(null);
        startTransition(async () => {
          const result = await createQuestionAction(formData);
          if (result.error) setError(result.error);
          else if (result.warning) {
            formRef.current?.reset();
            setWarning(result.warning);
            router.refresh();
          } else if (result.questionId) {
            formRef.current?.reset();
            router.push(`/questions/${result.questionId}`);
          }
        });
      }}
      className="form-row"
    >
      <input name="text" className="input grow" placeholder="An analytical question you want to track..." required disabled={pending} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Building assessment..." : "Add"}
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12 }}>{error}</span>}
      {warning && <span className="text-warning" style={{ fontSize: 12 }}>{warning}</span>}
    </form>
  );
}

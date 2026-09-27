"use client";

import { useRef, useState, useTransition } from "react";
import { createQuestionAction } from "./actions";

export function QuestionForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createQuestionAction(formData);
          if (result.error) setError(result.error);
          else formRef.current?.reset();
        });
      }}
      className="form-row"
    >
      <input name="text" className="input grow" placeholder="An analytical question you want to track..." required disabled={pending} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12 }}>{error}</span>}
    </form>
  );
}

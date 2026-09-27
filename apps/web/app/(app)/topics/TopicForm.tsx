"use client";

import { useRef, useState, useTransition } from "react";
import { createTopicAction } from "./actions";

export function TopicForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createTopicAction(formData);
          if (result.error) setError(result.error);
          else formRef.current?.reset();
        });
      }}
      className="form-row"
    >
      <input name="sentence" className="input grow" placeholder="Define a new topic in one sentence..." required disabled={pending} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating..." : "Add"}
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12 }}>{error}</span>}
    </form>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { createWatchAction } from "./actions";

export function WatchForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createWatchAction(formData);
          if (result.error) setError(result.error);
          else formRef.current?.reset();
        });
      }}
      className="form-row"
    >
      <input name="name" className="input" placeholder="Name (person, institution, journal)" required disabled={pending} />
      <select name="kind" className="select" disabled={pending}>
        <option value="person">Person</option>
        <option value="institution">Institution</option>
        <option value="journal">Journal</option>
      </select>
      <input name="query" className="input grow" placeholder="Search query (optional, defaults to name)" disabled={pending} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12 }}>{error}</span>}
    </form>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { createSourceAction } from "./actions";

export interface SourceFormPerspectiveGroup {
  id: string;
  name: string;
}

export function SourceForm({ perspectiveGroups }: { perspectiveGroups: SourceFormPerspectiveGroup[] }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>
        Add source
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await createSourceAction(formData);
          if (result.error) setError(result.error);
          else {
            setSaved(true);
            formRef.current?.reset();
          }
        });
      }}
      className="panel"
      style={{ display: "grid", gap: 12, maxWidth: 480, marginBottom: 20 }}
    >
      <label className="field" style={{ marginBottom: 0 }}>
        <span className="field-label">Name</span>
        <input name="name" className="input" placeholder="e.g. The Diplomat" required disabled={pending} />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span className="field-label">RSS feed URL</span>
        <input name="url" className="input" placeholder="https://..." required disabled={pending} />
      </label>
      <div style={{ display: "flex", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0, flex: 1 }}>
          <span className="field-label">Language</span>
          <select name="language" className="select" defaultValue="en" disabled={pending}>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0, flex: 1 }}>
          <span className="field-label">Weight (0-1)</span>
          <input name="weight" type="number" step="0.1" min="0" max="1" defaultValue="0.5" className="input" disabled={pending} />
        </label>
      </div>
      {perspectiveGroups.length > 0 && (
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Perspective group (optional)</span>
          <select name="perspective_group_id" className="select" defaultValue="" disabled={pending}>
            <option value="">None</option>
            {perspectiveGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)" }}>
        <input name="paywalled" type="checkbox" disabled={pending} />
        Paywalled (store text privately, don&apos;t show extracted content)
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding..." : "Add source"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
        {saved && <span className="text-accent" style={{ fontSize: 13 }}>Added.</span>}
        {error && <span className="text-danger" style={{ fontSize: 13 }}>{error}</span>}
      </div>
    </form>
  );
}

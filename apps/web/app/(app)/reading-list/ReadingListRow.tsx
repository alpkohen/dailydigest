"use client";

import { useState, useTransition } from "react";
import { removeFromReadingListAction, toggleReadAction, updateNotesAction } from "./actions";

export function ReadingListRow({
  id,
  title,
  href,
  isRead,
  notes,
  tags,
}: {
  id: string;
  title: string;
  href: string;
  isRead: boolean;
  notes: string;
  tags: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [notesValue, setNotesValue] = useState(notes);
  const [tagsValue, setTagsValue] = useState(tags.join(", "));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="row-flex" style={{ display: "block" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <a
          href={href}
          className="row-title"
          style={{
            textDecoration: isRead ? "line-through" : "none",
            color: isRead ? "var(--text-faint)" : "var(--text)",
          }}
        >
          {title}
        </a>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await toggleReadAction(id, !isRead);
                if (!result.ok) setError(result.error ?? "Could not update.");
              })
            }
          >
            {isRead ? "Mark unread" : "Read"}
          </button>
          <button className="btn btn-sm" disabled={pending} onClick={() => setEditing((v) => !v)}>
            Notes/tags
          </button>
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await removeFromReadingListAction(id);
                if (!result.ok) setError(result.error ?? "Could not remove.");
              })
            }
          >
            Remove
          </button>
        </div>
      </div>
      {error && <div className="text-danger" style={{ fontSize: 12, marginTop: 4 }}>{error}</div>}
      {tags.length > 0 && <div className="row-meta">{tags.join(", ")}</div>}
      {notes && !editing && <div className="row-summary">{notes}</div>}
      {editing && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
          <input className="input" value={tagsValue} onChange={(e) => setTagsValue(e.target.value)} placeholder="tags, comma separated" />
          <textarea className="textarea" value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="note" rows={2} />
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            style={{ alignSelf: "start" }}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                // Only close the editor on success - a code review found
                // this closing unconditionally, silently discarding the
                // edit (with no error shown) if the update had failed.
                const result = await updateNotesAction(id, notesValue, tagsValue);
                if (result.ok) setEditing(false);
                else setError(result.error ?? "Could not save.");
              })
            }
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

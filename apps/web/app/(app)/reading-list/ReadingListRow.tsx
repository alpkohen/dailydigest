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
          <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => toggleReadAction(id, !isRead))}>
            {isRead ? "Okunmadı yap" : "Okundu"}
          </button>
          <button className="btn btn-sm" disabled={pending} onClick={() => setEditing((v) => !v)}>
            Not/etiket
          </button>
          <button className="btn btn-sm" disabled={pending} onClick={() => startTransition(() => removeFromReadingListAction(id))}>
            Kaldır
          </button>
        </div>
      </div>
      {tags.length > 0 && <div className="row-meta">{tags.join(", ")}</div>}
      {notes && !editing && <div className="row-summary">{notes}</div>}
      {editing && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
          <input className="input" value={tagsValue} onChange={(e) => setTagsValue(e.target.value)} placeholder="etiketler, virgülle" />
          <textarea className="textarea" value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="not" rows={2} />
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            style={{ alignSelf: "start" }}
            onClick={() =>
              startTransition(async () => {
                await updateNotesAction(id, notesValue, tagsValue);
                setEditing(false);
              })
            }
          >
            Kaydet
          </button>
        </div>
      )}
    </div>
  );
}

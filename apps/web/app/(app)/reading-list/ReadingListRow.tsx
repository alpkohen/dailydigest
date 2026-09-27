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
    <div style={{ padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <a href={href} style={{ fontSize: 14, fontWeight: 600, color: isRead ? "#999" : "inherit", textDecoration: isRead ? "line-through" : "none" }}>
          {title}
        </a>
        <div style={{ display: "flex", gap: 6 }}>
          <button disabled={pending} onClick={() => startTransition(() => toggleReadAction(id, !isRead))} style={{ fontSize: 11 }}>
            {isRead ? "Okunmadı yap" : "Okundu"}
          </button>
          <button disabled={pending} onClick={() => setEditing((v) => !v)} style={{ fontSize: 11 }}>
            Not/etiket
          </button>
          <button disabled={pending} onClick={() => startTransition(() => removeFromReadingListAction(id))} style={{ fontSize: 11 }}>
            Kaldır
          </button>
        </div>
      </div>
      {tags.length > 0 && <div style={{ fontSize: 11, color: "#888" }}>{tags.join(", ")}</div>}
      {notes && !editing && <div style={{ fontSize: 12, color: "#444" }}>{notes}</div>}
      {editing && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={tagsValue} onChange={(e) => setTagsValue(e.target.value)} placeholder="etiketler, virgülle" style={{ fontSize: 12, padding: 4 }} />
          <textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="not" style={{ fontSize: 12, padding: 4 }} rows={2} />
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await updateNotesAction(id, notesValue, tagsValue);
                setEditing(false);
              })
            }
            style={{ fontSize: 11, alignSelf: "start" }}
          >
            Kaydet
          </button>
        </div>
      )}
    </div>
  );
}

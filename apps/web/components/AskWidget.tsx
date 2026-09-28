"use client";

import { useState, useTransition } from "react";
import { askArchiveAction, type SearchResultItem } from "@/app/(app)/archive/actions";
import { AiTag } from "./AiTag";

interface Exchange {
  question: string;
  answer?: string;
  citations?: SearchResultItem[];
  error?: string;
}

/**
 * The panel behind the sidebar's "Ask" entry - same askArchiveAction
 * (pgvector + full-text hybrid search) the Archive page already uses, just
 * reachable from anywhere without navigating there first. Open state is
 * owned by the sidebar (a single nav item toggles it) rather than by this
 * component, so it reads as part of the sidebar's own navigation instead of
 * a separate floating control.
 */
export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const submit = () => {
    const q = question.trim();
    if (!q || pending) return;
    setQuestion("");
    startTransition(async () => {
      const result = await askArchiveAction(q);
      setExchanges((prev) => [...prev, { question: q, answer: result.answer, citations: result.citations, error: result.error }]);
    });
  };

  return (
    <div className="ask-widget-panel" role="dialog" aria-label="Ask the archive">
      <div className="ask-widget-header">
        <span>Ask the archive</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AiTag />
          <button type="button" className="ask-widget-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      <div className="ask-widget-messages">
        {exchanges.length === 0 && (
          <p className="empty" style={{ padding: "0 4px" }}>
            Ask anything about what&apos;s been covered - e.g. &quot;How has coverage of X changed this month?&quot;
          </p>
        )}
        {exchanges.map((ex, i) => (
          <div key={i} className="ask-widget-exchange">
            <p className="ask-widget-question">{ex.question}</p>
            {ex.error ? (
              <p className="text-danger" style={{ fontSize: 13 }}>{ex.error}</p>
            ) : (
              <>
                <p className="dek" style={{ color: "var(--text)", margin: "4px 0 0" }}>{ex.answer}</p>
                {ex.citations && ex.citations.length > 0 && (
                  <div className="row-meta">
                    Sources:{" "}
                    {ex.citations.map((c, ci) => (
                      <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="text-accent" style={{ marginRight: 6 }}>
                        [{ci + 1}]
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {pending && <p className="row-meta">Thinking…</p>}
      </div>

      <form
        className="ask-widget-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="input grow"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question…"
          disabled={pending}
          autoFocus
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !question.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}

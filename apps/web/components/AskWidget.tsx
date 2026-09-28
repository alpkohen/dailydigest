"use client";

import { useState, useTransition } from "react";
import { askArchiveAction, type SearchResultItem } from "@/app/(app)/archive/actions";
import { AiTag } from "./AiTag";
import { IconClose, IconSpark } from "./icons";

interface Exchange {
  question: string;
  answer?: string;
  citations?: SearchResultItem[];
  error?: string;
}

/**
 * A floating "Ask" panel available from every page, not just /archive -
 * same askArchiveAction (pgvector + full-text hybrid search) the Archive
 * page already uses, just reachable without navigating there first.
 * Modelled after a similar always-on assistant widget built for a sister
 * project (Actaware's js/ai-chat.js): a small FAB that expands into a
 * scrollable Q&A panel, keeping a running list of exchanges instead of
 * replacing the last answer.
 */
export function AskWidget() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, startTransition] = useTransition();

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
    <>
      <button
        type="button"
        className="ask-widget-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close ask panel" : "Ask the archive"}
      >
        {open ? <IconClose /> : <IconSpark />}
        {!open && <span>Ask</span>}
      </button>

      {open && (
        <div className="ask-widget-panel" role="dialog" aria-label="Ask the archive">
          <div className="ask-widget-header">
            <span>Ask the archive</span>
            <AiTag />
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
      )}
    </>
  );
}

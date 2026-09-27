"use client";

import { useState, useTransition } from "react";
import { AiTag } from "@/components/AiTag";
import { askArchiveAction, searchArchiveAction, type SearchResultItem } from "./actions";

export function ArchiveClient() {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<SearchResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <section className="section">
        <h2 className="h2-section">Search</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const r = await searchArchiveAction(query);
              if (r.error) setError(r.error);
              else setResults(r.results ?? []);
            });
          }}
          className="form-row"
        >
          <input
            className="input grow"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Turkey EU customs union"
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            Search
          </button>
        </form>
        {results && (
          <div className="link-list" style={{ marginTop: 10 }}>
            {results.map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer">
                <div className="row-title" style={{ fontSize: 13 }}>
                  {r.title}
                </div>
                <div className="row-meta">
                  {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString("en-GB") : "?"} · {r.language ?? "?"}
                </div>
              </a>
            ))}
            {results.length === 0 && <p className="empty">No results.</p>}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="h2-section">Ask the archive</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setAnswer(null);
            startTransition(async () => {
              const r = await askArchiveAction(question);
              if (r.error) setError(r.error);
              else {
                setAnswer(r.answer ?? null);
                setCitations(r.citations ?? []);
              }
            });
          }}
          className="form-row"
        >
          <input
            className="input grow"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. How has the EU's language on Turkish membership changed in the last 6 months?"
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "..." : "Ask"}
          </button>
        </form>
        {answer && (
          <div style={{ marginTop: 10 }}>
            <AiTag />
            <p className="dek" style={{ color: "var(--text)", marginTop: 6 }}>
              {answer}
            </p>
            {citations.length > 0 && (
              <div className="row-meta">
                Sources:{" "}
                {citations.map((c, i) => (
                  <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="text-accent" style={{ marginRight: 6 }}>
                    [{i + 1}]
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {error && <p className="text-danger" style={{ fontSize: 13 }}>{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { searchArchiveAction, type SearchResultItem } from "./actions";

export function ArchiveClient() {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
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

      {error && <p className="text-danger" style={{ fontSize: 13 }}>{error}</p>}
    </div>
  );
}

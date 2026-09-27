"use client";

import { useState, useTransition } from "react";
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
      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 15 }}>Ara</h2>
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
          style={{ display: "flex", gap: 8 }}
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ör: Türkiye AB gümrük birliği" style={{ flex: 1, padding: "8px 10px", fontSize: 14 }} />
          <button type="submit" disabled={pending}>
            Ara
          </button>
        </form>
        {results && (
          <div style={{ marginTop: 10 }}>
            {results.map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "8px 0", borderBottom: "1px solid #f0f0f0", color: "inherit", textDecoration: "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString("tr-TR") : "?"} · {r.language ?? "?"}
                </div>
              </a>
            ))}
            {results.length === 0 && <p style={{ color: "#888", fontSize: 13 }}>Sonuç yok.</p>}
          </div>
        )}
      </section>

      <section style={{ margin: "24px 0" }}>
        <h2 style={{ fontSize: 15 }}>Arşive sor</h2>
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
          style={{ display: "flex", gap: 8 }}
        >
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="ör: AB'nin Türkiye üyeliğine ilişkin dili son 6 ayda nasıl değişti?" style={{ flex: 1, padding: "8px 10px", fontSize: 14 }} />
          <button type="submit" disabled={pending}>
            {pending ? "..." : "Sor"}
          </button>
        </form>
        {answer && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 14, lineHeight: "21px" }}>{answer}</p>
            {citations.length > 0 && (
              <div style={{ fontSize: 12, color: "#666" }}>
                Kaynaklar:{" "}
                {citations.map((c, i) => (
                  <a key={c.id} href={c.url} target="_blank" rel="noreferrer" style={{ color: "#666", marginRight: 6 }}>
                    [{i + 1}]
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {error && <p style={{ color: "#c00", fontSize: 13 }}>{error}</p>}
    </div>
  );
}

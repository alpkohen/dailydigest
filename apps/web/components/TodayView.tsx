"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface TodayStory {
  id: string;
  title: string;
  summary: string;
  tier: number;
  section: string;
  topics: string[];
}

export interface TodayResearchItem {
  id: string;
  title: string;
  argument: string;
}

export interface TodayOutsideRadar {
  title: string;
  reason: string;
}

export interface TodayWatchlistItem {
  id: string;
  title: string;
  url: string;
  watchName: string;
}

const SECTION_LABELS: Record<string, string> = {
  critical: "Kritik gelişmeler",
  follow_up: "Takip edilen gelişmeler",
  worth_reading: "Okumaya değer",
};

export function TodayView({
  periodDate,
  headline,
  stories,
  research,
  outsideRadar,
  watchlist,
}: {
  periodDate: string;
  headline: string;
  stories: TodayStory[];
  research: TodayResearchItem[];
  outsideRadar?: TodayOutsideRadar | null;
  watchlist?: TodayWatchlistItem[];
}) {
  const [tierFilter, setTierFilter] = useState<number | "all">("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");

  const allTopics = useMemo(() => Array.from(new Set(stories.flatMap((s) => s.topics))).sort(), [stories]);

  const filtered = stories.filter(
    (s) => (tierFilter === "all" || s.tier === tierFilter) && (topicFilter === "all" || s.topics.includes(topicFilter)),
  );

  const bySection = ["critical", "follow_up", "worth_reading"].map((section) => ({
    section,
    stories: filtered.filter((s) => s.section === section),
  }));

  return (
    <main>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Bugün</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>{periodDate}</p>
      <p style={{ fontSize: 15, lineHeight: "22px" }}>{headline}</p>

      <div style={{ display: "flex", gap: 12, margin: "16px 0", fontSize: 13 }}>
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
          <option value="all">Tüm önem seviyeleri</option>
          <option value={1}>Tier 1 (kritik)</option>
          <option value={2}>Tier 2 (takip)</option>
          <option value={3}>Tier 3 (okumaya değer)</option>
        </select>
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
          <option value="all">Tüm konular</option>
          {allTopics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {bySection
        .filter((s) => s.stories.length > 0)
        .map((s) => (
          <section key={s.section} style={{ margin: "20px 0" }}>
            <h2 style={{ fontSize: 16, borderBottom: "1px solid #e5e5e5", paddingBottom: 6 }}>{SECTION_LABELS[s.section]}</h2>
            {s.stories.map((story) => (
              <Link
                key={story.id}
                href={`/story/${story.id}`}
                style={{ display: "block", padding: "10px 0", textDecoration: "none", color: "inherit", borderBottom: "1px solid #f0f0f0" }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{story.title}</div>
                <div style={{ fontSize: 13, color: "#444", margin: "2px 0" }}>{story.summary}</div>
                {story.topics.length > 0 && (
                  <div style={{ fontSize: 11, color: "#888" }}>{story.topics.join(", ")}</div>
                )}
              </Link>
            ))}
          </section>
        ))}

      {research.length > 0 && (
        <section style={{ margin: "20px 0" }}>
          <h2 style={{ fontSize: 16, borderBottom: "1px solid #e5e5e5", paddingBottom: 6 }}>Yeni araştırma</h2>
          {research.map((r) => (
            <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
              <div style={{ fontSize: 13, color: "#444" }}>{r.argument}</div>
            </div>
          ))}
        </section>
      )}

      {watchlist && watchlist.length > 0 && (
        <section style={{ margin: "20px 0" }}>
          <h2 style={{ fontSize: 16, borderBottom: "1px solid #e5e5e5", paddingBottom: 6 }}>Takip listenden</h2>
          {watchlist.map((w) => (
            <a key={w.id} href={w.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "6px 0", color: "inherit", textDecoration: "none" }}>
              <span style={{ fontSize: 13 }}>{w.title}</span>
              <span style={{ fontSize: 11, color: "#999" }}> — {w.watchName}</span>
            </a>
          ))}
        </section>
      )}

      {outsideRadar && (
        <section style={{ margin: "20px 0" }}>
          <h2 style={{ fontSize: 16, borderBottom: "1px solid #e5e5e5", paddingBottom: 6 }}>Radarının dışında</h2>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{outsideRadar.title}</div>
          <div style={{ fontSize: 13, color: "#444" }}>{outsideRadar.reason}</div>
        </section>
      )}
    </main>
  );
}

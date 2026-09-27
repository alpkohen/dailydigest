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

const SECTION_BADGE: Record<string, string> = {
  critical: "badge-critical",
  follow_up: "badge-accent",
  worth_reading: "badge-neutral",
};

function formatEdition(periodDate: string) {
  try {
    const d = new Date(periodDate);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  } catch {
    return periodDate;
  }
}

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

  const hasRail = (watchlist && watchlist.length > 0) || Boolean(outsideRadar);

  return (
    <div className={hasRail ? "layout-grid" : undefined}>
      <main>
        <p className="eyebrow">
          {formatEdition(periodDate)} · World Brief Edition
        </p>
        <h1 className="h1-serif">Günaydın, Evren.</h1>

        <section className="section" style={{ marginTop: 20 }}>
          <h2 className="h2-section">Bugünün Çerçevesi</h2>
          <p className="dek">{headline}</p>
        </section>

        <div className="filters">
          <select
            className="select"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">Tüm önem seviyeleri</option>
            <option value={1}>Tier 1 (kritik)</option>
            <option value={2}>Tier 2 (takip)</option>
            <option value={3}>Tier 3 (okumaya değer)</option>
          </select>
          <select className="select" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
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
            <section key={s.section} className="section">
              <h2 className="h2-section">{SECTION_LABELS[s.section]}</h2>

              {s.section === "critical" && s.stories[0] && (
                <Link href={`/story/${s.stories[0].id}`} className="lead-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                  <span className="badge badge-critical">Kritik</span>
                  <div className="lead-title">{s.stories[0].title}</div>
                  <p className="lead-summary">{s.stories[0].summary}</p>
                  {s.stories[0].topics.length > 0 && <div className="row-meta">{s.stories[0].topics.join(", ")}</div>}
                </Link>
              )}

              {s.stories.slice(s.section === "critical" ? 1 : 0).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="row-link">
                  <span className={`badge ${SECTION_BADGE[s.section]}`} style={{ marginBottom: 6 }}>
                    Tier {story.tier}
                  </span>
                  <div className="row-title">{story.title}</div>
                  <p className="row-summary">{story.summary}</p>
                  {story.topics.length > 0 && <div className="row-meta">{story.topics.join(", ")}</div>}
                </Link>
              ))}
            </section>
          ))}

        {research.length > 0 && (
          <section className="section">
            <h2 className="h2-section">Yeni araştırma</h2>
            {research.map((r) => (
              <div key={r.id} className="row-link">
                <div className="row-title">{r.title}</div>
                <p className="row-summary">{r.argument}</p>
              </div>
            ))}
          </section>
        )}
      </main>

      {hasRail && (
        <aside>
          {watchlist && watchlist.length > 0 && (
            <div className="rail-card">
              <p className="rail-card-title">Masanın Kenarında</p>
              <div className="link-list">
                {watchlist.map((w) => (
                  <a key={w.id} href={w.url} target="_blank" rel="noreferrer">
                    <div className="row-title" style={{ fontSize: 13 }}>
                      {w.title}
                    </div>
                    <div className="row-meta">{w.watchName}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {outsideRadar && (
            <div className="rail-card">
              <p className="rail-card-title">Radarının dışında</p>
              <div className="row-title" style={{ fontSize: 13 }}>
                {outsideRadar.title}
              </div>
              <p className="row-summary">{outsideRadar.reason}</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

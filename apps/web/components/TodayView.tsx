"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface TodayStory { id: string; title: string; summary: string; tier: number; section: string; topics: string[]; }
export interface TodayResearchItem { id: string; title: string; argument: string; }
export interface TodayOutsideRadar { title: string; reason: string; }
export interface TodayWatchlistItem { id: string; title: string; url: string; watchName: string; }
const SECTION_LABELS: Record<string, string> = { critical: "Kritik gelişmeler", follow_up: "Takip edilen gelişmeler", worth_reading: "Okumaya değer" };

export function TodayView({ periodDate, headline, stories, research, outsideRadar, watchlist }: { periodDate: string; headline: string; stories: TodayStory[]; research: TodayResearchItem[]; outsideRadar?: TodayOutsideRadar | null; watchlist?: TodayWatchlistItem[] }) {
  const [tierFilter, setTierFilter] = useState<number | "all">("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [view, setView] = useState<"all" | "critical" | "follow" | "research">("all");
  const allTopics = useMemo(() => Array.from(new Set(stories.flatMap((s) => s.topics))).sort(), [stories]);
  const filtered = stories.filter((s) => (tierFilter === "all" || s.tier === tierFilter) && (topicFilter === "all" || s.topics.includes(topicFilter)) && (view === "all" || (view === "critical" && s.section === "critical") || (view === "follow" && s.section === "follow_up")));
  const lead = filtered.find((story) => story.section === "critical") ?? filtered[0];
  const secondary = lead ? filtered.filter((story) => story.id !== lead.id).slice(0, 5) : [];
  const dateLabel = new Date(`${periodDate}T00:00:00Z`).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return <main className="wb-today">
    <header className="wb-head"><div><div className="wb-eyebrow">WORLD BRIEF <span>·</span> {dateLabel}</div><h1>Günaydın, Evren.</h1><p>{headline}</p></div><div className="wb-edition"><strong>{stories.length + research.length}</strong><span>bugünün notu</span></div></header>
    <section className="wb-summary"><div className="wb-eyebrow">BUGÜNÜN ÇERÇEVESİ</div><p>{headline}</p></section>
    <div className="wb-tabs" role="tablist">{[["all", "Tümü"], ["critical", "Kritik"], ["follow", "Takip"], ["research", "Araştırma"]].map(([key, label]) => <button key={key} type="button" className={view === key ? "active" : ""} onClick={() => setView(key as typeof view)}>{label}</button>)}</div>
    <div className="wb-filter-controls"><select aria-label="Önem seviyesi" value={tierFilter} onChange={(e) => setTierFilter(e.target.value === "all" ? "all" : Number(e.target.value))}><option value="all">Tüm önem seviyeleri</option><option value={1}>Tier 1 · Kritik</option><option value={2}>Tier 2 · Takip</option><option value={3}>Tier 3 · Okumaya değer</option></select><select aria-label="Konu" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}><option value="all">Tüm konular</option>{allTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></div>
    <div className="wb-body-grid"><div className="wb-feed">
      {view !== "research" && lead && <Link className="wb-lead" href={`/story/${lead.id}`}><div className="wb-meta"><span className="wb-tier critical">KRİTİK</span><span>{lead.topics.join(" · ") || "Gündem"}</span></div><h2>{lead.title}</h2><p>{lead.summary}</p><span className="wb-read">Haberi aç <span>↗</span></span></Link>}
      {view !== "research" && secondary.map((story) => <Link className="wb-story-row" key={story.id} href={`/story/${story.id}`}><div><div className="wb-meta"><span className={`wb-tier ${story.section === "critical" ? "critical" : ""}`}>{SECTION_LABELS[story.section] ?? "GÜNDEM"}</span><span>{story.topics.join(" · ")}</span></div><h3>{story.title}</h3><p>{story.summary}</p></div><span className="wb-arrow">↗</span></Link>)}
      {(view === "all" || view === "research") && research.length > 0 && <section className="wb-research"><div className="wb-eyebrow">MASADAKİ ARAŞTIRMALAR</div>{research.map((item) => <article key={item.id}><h3>{item.title}</h3><p>{item.argument}</p></article>)}</section>}
      {!lead && view !== "research" && <div className="wb-empty">Bu filtreye uyan bir not yok.</div>}
    </div><aside className="wb-aside"><div className="wb-eyebrow">MASANIN KENARINDA</div>{outsideRadar && <div className="wb-aside-card"><span className="wb-dot amber" /><strong>{outsideRadar.title}</strong><p>{outsideRadar.reason}</p></div>}{watchlist?.slice(0, 3).map((item) => <a className="wb-aside-link" key={item.id} href={item.url} target="_blank" rel="noreferrer"><span className="wb-dot" /><span>{item.title}<small>{item.watchName}</small></span><span>↗</span></a>)}{!outsideRadar && !watchlist?.length && <p className="wb-muted">Bugün için kenarda bekleyen bir not yok.</p>}</aside></div>
  </main>;
}

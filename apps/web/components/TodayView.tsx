"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveItemToReadingListAction, saveStoryToReadingListAction } from "@/app/(app)/todayActions";
import { IconArrowRight, IconBookmark, IconCheck, IconFrame } from "./icons";
import { AiTag } from "./AiTag";
import { OWNER_FIRST_NAME } from "@/lib/ownerProfile";
import { pickGreeting } from "@/lib/greetings";

export interface TodayStory {
  id: string;
  title: string;
  summary: string;
  tier: number;
  section: string;
  topics: string[];
  whyItMatters?: string | null;
  sourceCount?: number;
  perspectiveCount?: number;
}

export interface TodayResearchItem {
  id: string;
  title: string;
  argument: string;
  itemId?: string;
}

export interface TodayOutsideRadar {
  title: string;
  reason: string;
  url?: string;
}

export interface TodayWatchlistItem {
  id: string;
  title: string;
  url: string;
  watchName: string;
}

export interface TodayQuestionWidget {
  questionId: string;
  text: string;
  note: string;
  storyId: string;
  storyTitle: string;
}

type TabKey = "all" | "critical" | "follow_up" | "research";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "follow_up", label: "Follow-up" },
  { key: "research", label: "Research" },
];

function formatEdition(periodDate: string) {
  try {
    return new Date(periodDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", weekday: "long" }).toUpperCase();
  } catch {
    return periodDate;
  }
}

function estimateReadMinutes(stories: TodayStory[], research: TodayResearchItem[]) {
  const words = stories.reduce((n, s) => n + s.summary.split(/\s+/).length, 0) + research.reduce((n, r) => n + r.argument.split(/\s+/).length, 0);
  return Math.max(3, Math.round(words / 200));
}

function sourceMeta(sourceCount?: number, perspectiveCount?: number) {
  if (sourceCount == null) return null;
  const sources = `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
  if (!perspectiveCount) return sources;
  return `${sources} · ${perspectiveCount} perspective${perspectiveCount === 1 ? "" : "s"}`;
}

function SaveStoryButton({ storyId, initiallySaved }: { storyId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  if (saved) {
    return (
      <span className="save-btn saved">
        <IconBookmark filled />
        Saved
      </span>
    );
  }

  return (
    <button className="save-btn" disabled={pending} onClick={() => startTransition(async () => { await saveStoryToReadingListAction(storyId); setSaved(true); })}>
      <IconBookmark />
      Save
    </button>
  );
}

function SaveItemButton({ itemId, initiallySaved }: { itemId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  if (saved) {
    return (
      <span className="save-btn saved">
        <IconBookmark filled />
        Saved
      </span>
    );
  }

  return (
    <button className="save-btn" disabled={pending} onClick={() => startTransition(async () => { await saveItemToReadingListAction(itemId); setSaved(true); })}>
      <IconBookmark />
      Save
    </button>
  );
}

export function TodayView({
  periodDate,
  headline,
  stories,
  research,
  outsideRadar,
  watchlist,
  questionWidget,
  savedStoryIds,
  savedItemIds,
}: {
  periodDate: string;
  headline: string;
  stories: TodayStory[];
  research: TodayResearchItem[];
  outsideRadar?: TodayOutsideRadar | null;
  watchlist?: TodayWatchlistItem[];
  questionWidget?: TodayQuestionWidget | null;
  savedStoryIds: string[];
  savedItemIds: string[];
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  // Randomised per load, but the pick must not differ between the server
  // render and the client's first render or React logs a hydration
  // mismatch (and briefly flashes the wrong text). Render a fixed greeting
  // on both, then swap in the random pick only after mount.
  const [greeting, setGreeting] = useState(`Hello, ${OWNER_FIRST_NAME} 🌸.`);
  useEffect(() => {
    setGreeting(pickGreeting(OWNER_FIRST_NAME));
  }, []);

  const allTopics = useMemo(() => Array.from(new Set(stories.flatMap((s) => s.topics))).sort(), [stories]);
  const savedStorySet = useMemo(() => new Set(savedStoryIds), [savedStoryIds]);
  const savedItemSet = useMemo(() => new Set(savedItemIds), [savedItemIds]);

  const topicFiltered = stories.filter((s) => topicFilter === "all" || s.topics.includes(topicFilter));

  const tierOrder: Record<string, number> = { critical: 0, follow_up: 1, worth_reading: 2 };
  const storiesForTab =
    tab === "critical"
      ? topicFiltered.filter((s) => s.section === "critical")
      : tab === "follow_up"
        ? topicFiltered.filter((s) => s.section === "follow_up")
        : tab === "research"
          ? []
          : [...topicFiltered].sort((a, b) => (tierOrder[a.section] ?? 9) - (tierOrder[b.section] ?? 9));

  const researchForTab = tab === "critical" || tab === "follow_up" ? [] : research;

  const leadStory = (tab === "all" || tab === "critical") ? storiesForTab.find((s) => s.section === "critical") : undefined;
  const restStories = leadStory ? storiesForTab.filter((s) => s.id !== leadStory.id) : storiesForTab;

  const hasRail = Boolean(questionWidget) || Boolean(outsideRadar) || (watchlist && watchlist.length > 0);
  const readMinutes = estimateReadMinutes(stories, research);

  return (
    <div>
      <div className="top-meta">
        <span className="top-meta-tagline">The world&apos;s daily briefing, minus the drama.</span>
        <span className="top-meta-status">
          <span className="status-dot" />
          Today&apos;s edition
        </span>
      </div>

      <div className={hasRail ? "layout-grid" : undefined}>
        <main>
          <div className="today-header">
            <div>
              <p className="eyebrow">{formatEdition(periodDate)}</p>
              <h1 className="greeting-title">{greeting}</h1>
              <p style={{ fontSize: 14, color: "var(--text-dim)", margin: "4px 0 0" }}>The developments shaping the world. What they mean for you.</p>
            </div>
            <div className="today-header-stat">
              <div className="num">{stories.length}</div>
              <div className="label">developments · {readMinutes} min read</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            <div className="tab-nav" style={{ marginTop: 0 }}>
              {TABS.map((t) => (
                <button key={t.key} className={`tab-item${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            {allTopics.length > 0 && (
              <select className="select" style={{ width: "auto", fontSize: 12 }} value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="all">All topics</option>
                {allTopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>

          <hr className="hr" />

          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h2 className="h2-section framing-heading">
                <IconFrame className="framing-icon" />
                Today&apos;s Framing
              </h2>
              <AiTag label="AI-written" />
            </div>
            <p className="dek" lang="tr">{headline}</p>
          </section>

          <div>
            {leadStory && (
              <div className="lead-card-v2">
                <div className="feed-eyebrow critical">
                  <span className="dot" />
                  Critical{leadStory.topics[0] ? ` · ${leadStory.topics[0].toUpperCase()}` : ""}
                </div>
                <Link href={`/story/${leadStory.id}`} className="feed-headline lead">
                  {leadStory.title}
                </Link>
                <p className="feed-desc" lang="tr">{leadStory.summary}</p>
                {leadStory.whyItMatters && (
                  <div className="callout">
                    <div className="callout-label">Why it matters</div>
                    <div className="callout-text" lang="tr">{leadStory.whyItMatters}</div>
                  </div>
                )}
                <div className="feed-footer">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AiTag label="AI summary" />
                    <span className="feed-meta">{sourceMeta(leadStory.sourceCount, leadStory.perspectiveCount) ?? leadStory.topics.join(", ")}</span>
                  </span>
                  <SaveStoryButton storyId={leadStory.id} initiallySaved={savedStorySet.has(leadStory.id)} />
                </div>
              </div>
            )}

            {restStories.map((story) => (
              <div key={story.id} className="feed-item">
                <div className={`feed-eyebrow${story.section === "critical" ? " critical" : ""}`}>
                  <span className="dot" />
                  {story.section === "critical" ? "Critical" : story.topics[0]?.toUpperCase() ?? "General"}
                </div>
                <Link href={`/story/${story.id}`} className="feed-headline">
                  {story.title}
                </Link>
                <p className="feed-desc" lang="tr">{story.summary}</p>
                <div className="feed-footer">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AiTag label="AI summary" />
                    <span className="feed-meta">{sourceMeta(story.sourceCount, story.perspectiveCount) ?? story.topics.join(", ")}</span>
                  </span>
                  <SaveStoryButton storyId={story.id} initiallySaved={savedStorySet.has(story.id)} />
                </div>
              </div>
            ))}

            {researchForTab.map((r) => (
              <div key={r.id} className="feed-item">
                <div className="feed-eyebrow">
                  <span className="dot" />
                  New research
                </div>
                <div className="feed-headline">{r.title}</div>
                <p className="feed-desc" lang="tr">{r.argument}</p>
                <div className="feed-footer">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AiTag label="AI summary" />
                    <span className="feed-meta">Research note</span>
                  </span>
                  {r.itemId && <SaveItemButton itemId={r.itemId} initiallySaved={savedItemSet.has(r.itemId)} />}
                </div>
              </div>
            ))}

            {!leadStory && restStories.length === 0 && researchForTab.length === 0 && <p className="empty">Nothing to show for this filter.</p>}
          </div>

          <div className="end-marker">
            <IconCheck />
            You&apos;ve reached the end of today&apos;s picks.
          </div>
        </main>

        {hasRail && (
          <aside>
            <p className="rail-header">On the Side</p>

            {questionWidget && (
              <div className="rail-card-v2">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p className="rail-card-eyebrow" style={{ marginBottom: 0 }}>Question you&apos;re tracking</p>
                  <AiTag />
                </div>
                <p className="rail-card-title-v2" lang="tr" style={{ marginTop: 8 }}>{questionWidget.text}</p>
                <p className="rail-card-desc" lang="tr">{questionWidget.note}</p>
                <Link href={`/story/${questionWidget.storyId}`} className="rail-card-link">
                  Related development <IconArrowRight />
                </Link>
              </div>
            )}

            {outsideRadar && (
              <div className="rail-card-v2">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p className="rail-card-eyebrow" style={{ marginBottom: 0 }}>Outside your radar</p>
                  <AiTag />
                </div>
                <p className="rail-card-title-v2" lang="tr" style={{ marginTop: 8 }}>{outsideRadar.title}</p>
                <p className="rail-card-desc" lang="tr">{outsideRadar.reason}</p>
                {outsideRadar.url && (
                  <a href={outsideRadar.url} target="_blank" rel="noreferrer" className="rail-card-link">
                    View source <IconArrowRight />
                  </a>
                )}
              </div>
            )}

            {watchlist && watchlist.length > 0 && (
              <div className="rail-card-v2">
                <p className="rail-card-eyebrow">From your watchlist</p>
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
          </aside>
        )}
      </div>
    </div>
  );
}

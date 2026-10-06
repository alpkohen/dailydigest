"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveItemToReadingListAction, saveStoryToReadingListAction } from "@/app/(app)/todayActions";
import { IconArrowRight, IconBookmark, IconCheck, IconFrame } from "./icons";
import { AiTag } from "./AiTag";
import { OWNER_FIRST_NAME } from "@/lib/ownerProfile";
import { pickArchiveGreeting, pickGreeting } from "@/lib/greetings";
import { safeUrl } from "@/lib/safeUrl";

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
  firstSeenAt?: string;
  lastUpdatedAt?: string;
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
  /** The publication; briefs written before this field existed fall back to the URL's site. */
  source?: string;
}

export interface TodayQuestionWidget {
  questionId: string;
  text: string;
  note: string;
  storyId: string | null;
  storyTitle: string | null;
}

type TabKey = "all" | "critical" | "follow_up" | "research";

const TABS: { key: TabKey; label: string; className?: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical", className: "tab-critical" },
  { key: "follow_up", label: "Follow-up", className: "tab-followup" },
  { key: "research", label: "Research", className: "tab-research" },
];

// Every card's own eyebrow label must use the same three words as the tabs
// above it - it used to fall back to showing the story's topic name (or
// "General" when the story had no topic, which was every story: found
// live that story_topics is empty, so this fallback fired 100% of the
// time), which meant a story sitting in the Follow-up tab could carry a
// "General" label that had nothing to do with the tab that surfaced it.
const SECTION_LABEL: Record<string, string> = {
  critical: "Critical",
  follow_up: "Follow-up",
  worth_reading: "Worth reading",
};

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

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown source";
  }
}

// Istanbul time, the owner's clock, whatever the server's time zone.
function istanbulTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/** "New" for events created since the previous update, "Updated" for older events that gained articles. */
function freshness(story: TodayStory, freshSince: string | null): "New" | "Updated" | null {
  if (!freshSince) return null;
  if (story.firstSeenAt && story.firstSeenAt > freshSince) return "New";
  if (story.lastUpdatedAt && story.lastUpdatedAt > freshSince) return "Updated";
  return null;
}

function FreshTag({ story, freshSince }: { story: TodayStory; freshSince: string | null }) {
  const label = freshness(story, freshSince);
  return (
    <>
      {label && (
        <span className={`badge ${label === "New" ? "badge-accent" : "badge-neutral"}`} style={{ marginLeft: 8 }}>
          {label}
        </span>
      )}
      {story.lastUpdatedAt && <span className="feed-time">{istanbulTime(story.lastUpdatedAt)}</span>}
    </>
  );
}

function sourceMeta(sourceCount?: number, perspectiveCount?: number) {
  if (sourceCount == null) return null;
  const sources = `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
  if (!perspectiveCount) return sources;
  return `${sources} · ${perspectiveCount} perspective${perspectiveCount === 1 ? "" : "s"}`;
}

function SaveStoryButton({ storyId, initiallySaved }: { storyId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        className="save-btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            // Only flip to "Saved" once the write actually succeeds - a
            // full-system code review found this setting local state
            // unconditionally, showing "Saved" even when the underlying
            // insert/upsert had failed.
            const result = await saveStoryToReadingListAction(storyId);
            if (result.ok) setSaved(true);
            else setError(result.error ?? "Could not save.");
          })
        }
      >
        <IconBookmark />
        Save
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12 }}>{error}</span>}
    </span>
  );
}

function SaveItemButton({ itemId, initiallySaved }: { itemId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        className="save-btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await saveItemToReadingListAction(itemId);
            if (result.ok) setSaved(true);
            else setError(result.error ?? "Could not save.");
          })
        }
      >
        <IconBookmark />
        Save
      </button>
      {error && <span className="text-danger" style={{ fontSize: 12 }}>{error}</span>}
    </span>
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
  lastUpdatedAt = null,
  freshSince = null,
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
  lastUpdatedAt?: string | null;
  freshSince?: string | null;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  // A time-of-day greeting ("Good evening") only makes sense for the brief
  // being read as it lands. A full-system audit found it showing up on past
  // briefs too (e.g. "Rise and shine" at 9pm while reading last week's
  // edition), since it was computed from the current clock, not the brief's
  // own date. Archived editions get a separate, date-neutral pool instead
  // (pickArchiveGreeting) - still a different, creative greeting on every
  // visit, just not tied to the clock.
  const isToday = useMemo(() => periodDate === new Date().toISOString().slice(0, 10), [periodDate]);

  // Randomised per load, but the pick must not differ between the server
  // render and the client's first render or React logs a hydration
  // mismatch (and briefly flashes the wrong text). Render a fixed greeting
  // on both, then swap in the random pick only after mount.
  const [greeting, setGreeting] = useState(`Hello, ${OWNER_FIRST_NAME} 😊.`);
  useEffect(() => {
    setGreeting(isToday ? pickGreeting(OWNER_FIRST_NAME) : pickArchiveGreeting(OWNER_FIRST_NAME));
  }, [isToday]);

  const savedStorySet = useMemo(() => new Set(savedStoryIds), [savedStoryIds]);
  const savedItemSet = useMemo(() => new Set(savedItemIds), [savedItemIds]);

  const tierOrder: Record<string, number> = { critical: 0, follow_up: 1, worth_reading: 2 };
  const storiesForTab =
    tab === "critical"
      ? stories.filter((s) => s.section === "critical")
      : tab === "follow_up"
        ? stories.filter((s) => s.section === "follow_up")
        : tab === "research"
          ? []
          : [...stories].sort((a, b) => (tierOrder[a.section] ?? 9) - (tierOrder[b.section] ?? 9));

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
          {isToday ? "Today’s edition" : "Archived edition"}
          {isToday && lastUpdatedAt && ` · Updated ${istanbulTime(lastUpdatedAt)}`}
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
              {stories.length} developments · {readMinutes} min read
            </div>
          </div>

          <div className="tab-nav" style={{ marginTop: 20 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`tab-item${tab === t.key ? ` active${t.className ? ` ${t.className}` : ""}` : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <hr className="hr" />

          {tab === "all" && (
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
          )}

          <div>
            {leadStory && (
              <div className="lead-card-v2">
                <div className="feed-eyebrow critical">
                  <span className="dot" />
                  Critical{leadStory.topics[0] ? ` · ${leadStory.topics[0].toUpperCase()}` : ""}
                  <FreshTag story={leadStory} freshSince={freshSince} />
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
                <div className={`feed-eyebrow${story.section === "critical" ? " critical" : story.section === "follow_up" ? " follow-up" : ""}`}>
                  <span className="dot" />
                  {SECTION_LABEL[story.section] ?? "Worth reading"}
                  <FreshTag story={story} freshSince={freshSince} />
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
                <div className="feed-eyebrow research">
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
                <Link href={questionWidget.storyId ? `/story/${questionWidget.storyId}` : `/questions/${questionWidget.questionId}`} className="rail-card-link">
                  {questionWidget.storyId ? "Related development" : "View tracked question"} <IconArrowRight />
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
                {safeUrl(outsideRadar.url) && (
                  <a href={safeUrl(outsideRadar.url)} target="_blank" rel="noreferrer" className="rail-card-link">
                    View source <IconArrowRight />
                  </a>
                )}
              </div>
            )}

            {watchlist && watchlist.length > 0 && (
              <div className="rail-card-v2">
                <p className="rail-card-eyebrow">From your watchlist</p>
                <div className="link-list">
                  {watchlist.map((w) => {
                    const watchUrl = safeUrl(w.url);
                    const body = (
                      <>
                        <div className="row-title" style={{ fontSize: 13 }}>
                          {w.title}
                        </div>
                        <div className="row-meta">{w.source ?? siteOf(w.url)}</div>
                      </>
                    );
                    return watchUrl ? (
                      <a key={w.id} href={watchUrl} target="_blank" rel="noreferrer">
                        {body}
                      </a>
                    ) : (
                      <div key={w.id}>{body}</div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

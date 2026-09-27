"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { saveItemToReadingListAction, saveStoryToReadingListAction } from "@/app/(app)/todayActions";
import { IconArrowRight, IconBookmark, IconCheck, IconFrame } from "./icons";
import { OWNER_FIRST_NAME } from "@/lib/ownerProfile";

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
  { key: "all", label: "Tüm gelişmeler" },
  { key: "critical", label: "Kritik" },
  { key: "follow_up", label: "Takip" },
  { key: "research", label: "Araştırma" },
];

function formatEdition(periodDate: string) {
  try {
    return new Date(periodDate).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }).toUpperCase();
  } catch {
    return periodDate;
  }
}

function estimateReadMinutes(stories: TodayStory[], research: TodayResearchItem[]) {
  const words = stories.reduce((n, s) => n + s.summary.split(/\s+/).length, 0) + research.reduce((n, r) => n + r.argument.split(/\s+/).length, 0);
  return Math.max(3, Math.round(words / 200));
}

function SaveStoryButton({ storyId, initiallySaved }: { storyId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  if (saved) {
    return (
      <span className="save-btn saved">
        <IconBookmark filled />
        Kaydedildi
      </span>
    );
  }

  return (
    <button className="save-btn" disabled={pending} onClick={() => startTransition(async () => { await saveStoryToReadingListAction(storyId); setSaved(true); })}>
      <IconBookmark />
      Kaydet
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
        Kaydedildi
      </span>
    );
  }

  return (
    <button className="save-btn" disabled={pending} onClick={() => startTransition(async () => { await saveItemToReadingListAction(itemId); setSaved(true); })}>
      <IconBookmark />
      Kaydet
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
  briefTime,
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
  briefTime?: string;
  savedStoryIds: string[];
  savedItemIds: string[];
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");

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
        <span>
          Çalışma alanı<span className="crumb-sep">/</span>Günlük bülten
        </span>
        <span className="top-meta-status">
          <span className="status-dot" />
          Günlük brief · {briefTime ?? "07:00"}
        </span>
      </div>

      <div className={hasRail ? "layout-grid" : undefined}>
        <main>
          <div className="today-header">
            <div>
              <p className="eyebrow">{formatEdition(periodDate)}</p>
              <h1 className="h1-serif">Günaydın, {OWNER_FIRST_NAME}.</h1>
              <p style={{ fontSize: 14, color: "var(--text-dim)", margin: "4px 0 0" }}>Dünyadaki gelişmeler. Senin için anlamı.</p>
            </div>
            <div className="today-header-stat">
              <div className="num">{stories.length}</div>
              <div className="label">gelişme · {readMinutes} dk okuma</div>
            </div>
          </div>

          <hr className="hr" />

          <section>
            <h2 className="h2-section framing-heading">
              <IconFrame className="framing-icon" />
              Bugünün Çerçevesi
            </h2>
            <p className="dek">{headline}</p>
          </section>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div className="tab-nav">
              {TABS.map((t) => (
                <button key={t.key} className={`tab-item${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            {allTopics.length > 0 && (
              <select className="select" style={{ width: "auto", fontSize: 12 }} value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="all">Tüm konular</option>
                {allTopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            {leadStory && (
              <div className="lead-card-v2">
                <div className="feed-eyebrow critical">
                  <span className="dot" />
                  Kritik{leadStory.topics[0] ? ` · ${leadStory.topics[0].toUpperCase()}` : ""}
                </div>
                <Link href={`/story/${leadStory.id}`} className="feed-headline lead">
                  {leadStory.title}
                </Link>
                <p className="feed-desc">{leadStory.summary}</p>
                {leadStory.whyItMatters && (
                  <div className="callout">
                    <div className="callout-label">Neden önemli</div>
                    <div className="callout-text">{leadStory.whyItMatters}</div>
                  </div>
                )}
                <div className="feed-footer">
                  <span className="feed-meta">
                    {leadStory.sourceCount != null
                      ? `${leadStory.sourceCount} örnek kaynak${leadStory.perspectiveCount ? ` · ${leadStory.perspectiveCount} perspektif` : ""}`
                      : leadStory.topics.join(", ")}
                  </span>
                  <SaveStoryButton storyId={leadStory.id} initiallySaved={savedStorySet.has(leadStory.id)} />
                </div>
              </div>
            )}

            {restStories.map((story) => (
              <div key={story.id} className="feed-item">
                <div className={`feed-eyebrow${story.section === "critical" ? " critical" : ""}`}>
                  <span className="dot" />
                  {story.section === "critical" ? "Kritik" : story.topics[0]?.toUpperCase() ?? "Genel"}
                </div>
                <Link href={`/story/${story.id}`} className="feed-headline">
                  {story.title}
                </Link>
                <p className="feed-desc">{story.summary}</p>
                <div className="feed-footer">
                  <span className="feed-meta">
                    {story.sourceCount != null
                      ? `${story.sourceCount} örnek kaynak${story.perspectiveCount ? ` · ${story.perspectiveCount} perspektif` : ""}`
                      : story.topics.join(", ")}
                  </span>
                  <SaveStoryButton storyId={story.id} initiallySaved={savedStorySet.has(story.id)} />
                </div>
              </div>
            ))}

            {researchForTab.map((r) => (
              <div key={r.id} className="feed-item">
                <div className="feed-eyebrow">
                  <span className="dot" />
                  Yeni araştırma
                </div>
                <div className="feed-headline">{r.title}</div>
                <p className="feed-desc">{r.argument}</p>
                <div className="feed-footer">
                  <span className="feed-meta">Örnek araştırma notu</span>
                  {r.itemId && <SaveItemButton itemId={r.itemId} initiallySaved={savedItemSet.has(r.itemId)} />}
                </div>
              </div>
            ))}

            {!leadStory && restStories.length === 0 && researchForTab.length === 0 && <p className="empty">Bu filtrede gösterilecek bir şey yok.</p>}
          </div>

          <div className="end-marker">
            <IconCheck />
            Bugünkü seçkinin sonuna geldin.
          </div>
        </main>

        {hasRail && (
          <aside>
            <p className="rail-header">Masanın Kenarında</p>

            {questionWidget && (
              <div className="rail-card-v2">
                <p className="rail-card-eyebrow">Takip ettiğin soru</p>
                <p className="rail-card-title-v2">{questionWidget.text}</p>
                <p className="rail-card-desc">{questionWidget.note}</p>
                <Link href={`/story/${questionWidget.storyId}`} className="rail-card-link">
                  İlgili gelişme <IconArrowRight />
                </Link>
              </div>
            )}

            {outsideRadar && (
              <div className="rail-card-v2">
                <p className="rail-card-eyebrow">Radarının dışında</p>
                <p className="rail-card-title-v2">{outsideRadar.title}</p>
                <p className="rail-card-desc">{outsideRadar.reason}</p>
                {outsideRadar.url && (
                  <a href={outsideRadar.url} target="_blank" rel="noreferrer" className="rail-card-link">
                    Kaynağa git <IconArrowRight />
                  </a>
                )}
              </div>
            )}

            {watchlist && watchlist.length > 0 && (
              <div className="rail-card-v2">
                <p className="rail-card-eyebrow">Takip listesinden</p>
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

            <p className="rail-tagline">
              Daha çok haber değil,
              <br />
              daha iyi bir perspektif.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

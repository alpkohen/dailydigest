import { Body, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";
// Explicit default import so this still works under the classic JSX
// transform: tsx's on-the-fly transform of this cross-package file doesn't
// reliably pick up packages/email's own tsconfig "jsx": "react-jsx".
import React, { type ReactElement } from "react";

export interface BriefSectionItem {
  id: string;
  title?: string;
  summary?: string;
  argument?: string;
  /** CLAUDE.md rule 6: our own summary plus a link to the original. */
  url?: string;
  /** One-click signed links (SPEC.md section 9); omitted for research items. */
  links?: { save: string; notRelevant: string; lessLikeThis: string };
}

export interface BriefContent {
  headline: string;
  sections: { section: "critical" | "follow_up" | "worth_reading" | "new_research"; items: BriefSectionItem[] }[];
  outsideRadar?: { id: string; title: string; standfirst: string | null; reason: string; url?: string } | null;
  watchlist?: { id: string; title: string; url: string; watchName: string; source?: string }[];
  /** Events per topic in the last 24h; the email is capped, the app isn't. */
  topicCounts?: { name: string; stories: number }[];
  totalStories?: number;
  /** Which configured sources delivered data, so a silent gap is visible. */
  sourceHealth?: { total: number; ok: number; failing: string[] };
  /** Topics with thin coverage or failing sources (layer 3 coverage warnings). */
  coverageGaps?: { topic: string; warnings: string[] }[];
  appUrl?: string;
}

// Same brand palette as the web app (apps/web/app/globals.css), hardcoded
// since email clients don't reliably support CSS custom properties.
const COLORS = {
  bg: "#10141a",
  panel: "#171b22",
  panelAlt: "#1d222c",
  border: "#262c36",
  text: "#ece7dc",
  textDim: "#9aa1ad",
  textFaint: "#6b7280",
  accent: "#4f9c86",
  amber: "#d9a441",
  violet: "#9b8cd9",
};

const SECTION_META: Record<
  BriefContent["sections"][number]["section"],
  { title: string; color: string }
> = {
  critical: { title: "Critical", color: COLORS.amber },
  follow_up: { title: "Follow-up", color: COLORS.accent },
  worth_reading: { title: "Worth reading", color: COLORS.textFaint },
  new_research: { title: "New research", color: COLORS.violet },
};

// item.url/outsideRadar.url/watchlist url all ultimately trace back to
// items.url, populated from third-party RSS/HTML sources during ingest
// with no scheme check anywhere upstream - reject anything that isn't a
// plain http(s) link before it ever reaches an href (code-review finding:
// a source item with e.g. a javascript: url would otherwise render as-is).
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

// .png, not .webp: Outlook (desktop, Word-based rendering engine) doesn't
// support WebP at all, and several other mail clients are inconsistent
// about it - the logo was silently missing from every sent email until
// this was found and fixed. PNG is universally supported.
const LOGO_URL = "https://world-brief.netlify.app/brand/world-brief-mark.png";

/**
 * SPEC.md section 9: React Email, Turkish copy for generated content, short
 * and scannable for phone reading, no images required beyond the wordmark.
 * Matches the web app's dark editorial theme (apps/web/app/globals.css) so
 * the email and the app read as the same product. Inline styles throughout
 * rather than a <style> block: the safest approach across Gmail/Outlook/
 * Apple Mail, none of which reliably apply external or <head> CSS.
 */
export function DailyBrief({ content, dateLabel }: { content: BriefContent; dateLabel: string }): ReactElement {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{content.headline}</Preview>
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: "-apple-system, Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container
          style={{
            maxWidth: 600,
            margin: "0 auto",
            backgroundColor: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "32px 28px",
          }}
        >
          <Img src={LOGO_URL} alt="World Brief." width="220" style={{ height: "auto", display: "block" }} />
          <Text style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 13, color: COLORS.accent, margin: "10px 0 0" }}>
            The world&apos;s daily briefing, minus the drama.
          </Text>

          <Text style={{ fontSize: 12, color: COLORS.textFaint, margin: "20px 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>
            {dateLabel}
          </Text>

          <Section style={{ margin: "12px 0 24px" }}>
            <Text style={{ fontSize: 14, lineHeight: "21px", color: COLORS.textDim, margin: 0 }}>{content.headline}</Text>
            {content.topicCounts && content.topicCounts.length > 0 && (
              <Text style={{ fontSize: 12, lineHeight: "18px", color: COLORS.textFaint, margin: "10px 0 0" }}>
                {content.topicCounts.map((t) => `${t.name}: ${t.stories}`).join(" · ")}
              </Text>
            )}
            {safeUrl(content.appUrl) && (
              <Text style={{ fontSize: 12, margin: "8px 0 0" }}>
                <a href={safeUrl(content.appUrl)} style={{ color: COLORS.accent, textDecoration: "none" }}>
                  {content.totalStories != null ? `All ${content.totalStories} developments in the app →` : "Open the app →"}
                </a>
              </Text>
            )}
          </Section>

          {content.sections
            .filter((section) => section.items.length > 0)
            .map((section) => {
              const meta = SECTION_META[section.section];
              return (
                <Section key={section.section} style={{ margin: "24px 0" }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      color: meta.color,
                      borderBottom: `2px solid ${meta.color}`,
                      paddingBottom: 6,
                      margin: "0 0 14px",
                      display: "inline-block",
                    }}
                  >
                    {meta.title}
                  </Text>
                  {section.items.map((item) => {
                    const itemUrl = safeUrl(item.url);
                    return (
                    <div key={item.id} style={{ margin: "0 0 16px" }}>
                      <Text style={{ fontFamily: "Georgia, serif", fontSize: 16, color: COLORS.text, margin: "0 0 4px", lineHeight: "22px" }}>
                        {itemUrl ? (
                          <a href={itemUrl} style={{ color: COLORS.text, textDecoration: "none" }}>
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                      </Text>
                      <Text style={{ fontSize: 13, lineHeight: "19px", color: COLORS.textDim, margin: 0 }}>
                        {item.summary ?? item.argument}
                      </Text>
                      {item.links && (
                        <Text style={{ fontSize: 11, margin: "6px 0 0" }}>
                          <a href={item.links.save} style={{ color: COLORS.accent, textDecoration: "none" }}>
                            Save
                          </a>
                          <span style={{ color: COLORS.border }}> · </span>
                          <a href={item.links.notRelevant} style={{ color: COLORS.textFaint, textDecoration: "none" }}>
                            Not relevant
                          </a>
                          <span style={{ color: COLORS.border }}> · </span>
                          <a href={item.links.lessLikeThis} style={{ color: COLORS.textFaint, textDecoration: "none" }}>
                            Show less like this
                          </a>
                        </Text>
                      )}
                    </div>
                    );
                  })}
                  <Hr style={{ borderColor: COLORS.border, marginTop: 8 }} />
                </Section>
              );
            })}

          {content.watchlist && content.watchlist.length > 0 && (
            <Section style={{ margin: "24px 0" }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: COLORS.textFaint,
                  borderBottom: `2px solid ${COLORS.border}`,
                  paddingBottom: 6,
                  margin: "0 0 14px",
                  display: "inline-block",
                }}
              >
                From your watchlist
              </Text>
              {content.watchlist.map((w) => {
                const watchUrl = safeUrl(w.url);
                return (
                <Text key={w.id} style={{ fontSize: 13, margin: "8px 0" }}>
                  {watchUrl ? (
                    <a href={watchUrl} style={{ color: COLORS.text, textDecoration: "none" }}>
                      {w.title}
                    </a>
                  ) : (
                    w.title
                  )}
                  <span style={{ color: COLORS.textFaint, fontSize: 11 }}> · {w.source ?? w.watchName}</span>
                </Text>
                );
              })}
              <Hr style={{ borderColor: COLORS.border, marginTop: 8 }} />
            </Section>
          )}

          {content.outsideRadar && (
            <Section style={{ margin: "24px 0" }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: COLORS.textFaint,
                  borderBottom: `2px solid ${COLORS.border}`,
                  paddingBottom: 6,
                  margin: "0 0 14px",
                  display: "inline-block",
                }}
              >
                Outside your radar
              </Text>
              <Text style={{ fontFamily: "Georgia, serif", fontSize: 16, color: COLORS.text, margin: "0 0 4px", lineHeight: "22px" }}>
                {safeUrl(content.outsideRadar.url) ? (
                  <a href={safeUrl(content.outsideRadar.url)} style={{ color: COLORS.text, textDecoration: "none" }}>
                    {content.outsideRadar.title}
                  </a>
                ) : (
                  content.outsideRadar.title
                )}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textDim, margin: 0 }}>{content.outsideRadar.reason}</Text>
            </Section>
          )}

          {content.coverageGaps && content.coverageGaps.length > 0 && (
            <Section style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 11, color: COLORS.amber, margin: "0 0 4px", fontWeight: 600 }}>Coverage gaps</Text>
              {content.coverageGaps.map((g) => (
                <Text key={g.topic} style={{ fontSize: 11, color: COLORS.textDim, margin: "0 0 4px" }}>
                  {g.topic}: {g.warnings.join(" ")}
                </Text>
              ))}
            </Section>
          )}

          {content.sourceHealth && (
            <Text style={{ fontSize: 11, color: content.sourceHealth.failing.length ? COLORS.amber : COLORS.textFaint, marginTop: 24 }}>
              Sources: {content.sourceHealth.ok} of {content.sourceHealth.total} delivered data.
              {content.sourceHealth.failing.length > 0 && ` No data from: ${content.sourceHealth.failing.join(", ")}.`}
            </Text>
          )}

          <Text style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 28, textAlign: "center" }}>
            World Brief. The world&apos;s daily briefing, minus the drama.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

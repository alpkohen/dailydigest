import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
// Explicit default import so this still works under the classic JSX
// transform: tsx's on-the-fly transform of this cross-package file doesn't
// reliably pick up packages/email's own tsconfig "jsx": "react-jsx".
import React, { type ReactElement } from "react";

export interface BriefSectionItem {
  id: string;
  title?: string;
  summary?: string;
  argument?: string;
  /** One-click signed links (SPEC.md section 9); omitted for research items. */
  links?: { save: string; notRelevant: string; lessLikeThis: string };
}

export interface BriefContent {
  headline: string;
  sections: { section: "critical" | "follow_up" | "worth_reading" | "new_research"; items: BriefSectionItem[] }[];
}

const SECTION_TITLES: Record<BriefContent["sections"][number]["section"], string> = {
  critical: "Kritik gelişmeler",
  follow_up: "Takip edilen gelişmeler",
  worth_reading: "Okumaya değer",
  new_research: "Yeni araştırma",
};

/**
 * SPEC.md section 9: React Email, Turkish copy, short and scannable for
 * phone reading, no images required, dark-mode safe (uses system colours,
 * no hardcoded light backgrounds only). Section order follows section 4.7:
 * headline, critical, follow-up, worth reading, new research. Watchlist,
 * outside-radar and question-pulse sections are M7 features, added once
 * that data exists.
 */
export function DailyBrief({ content, dateLabel }: { content: BriefContent; dateLabel: string }): ReactElement {
  return (
    <Html lang="tr">
      <Head />
      <Preview>{content.headline}</Preview>
      <Body style={{ backgroundColor: "#ffffff", fontFamily: "-apple-system, Helvetica, Arial, sans-serif", color: "#1a1a1a" }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
          <Heading as="h1" style={{ fontSize: 20, marginBottom: 4 }}>
            dailydigest
          </Heading>
          <Text style={{ fontSize: 13, color: "#666666", marginTop: 0 }}>{dateLabel}</Text>

          <Section style={{ margin: "16px 0" }}>
            <Text style={{ fontSize: 15, lineHeight: "22px" }}>{content.headline}</Text>
          </Section>

          {content.sections
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <Section key={section.section} style={{ margin: "20px 0" }}>
                <Heading as="h2" style={{ fontSize: 16, borderBottom: "1px solid #e5e5e5", paddingBottom: 6 }}>
                  {SECTION_TITLES[section.section]}
                </Heading>
                {section.items.map((item) => (
                  <div key={item.id} style={{ margin: "10px 0" }}>
                    <Text style={{ fontSize: 14, fontWeight: 600, margin: "0 0 2px" }}>{item.title}</Text>
                    <Text style={{ fontSize: 13, lineHeight: "19px", color: "#333333", margin: 0 }}>
                      {item.summary ?? item.argument}
                    </Text>
                    {item.links && (
                      <Text style={{ fontSize: 11, margin: "4px 0 0" }}>
                        <a href={item.links.save} style={{ color: "#666" }}>
                          Kaydet
                        </a>
                        {" · "}
                        <a href={item.links.notRelevant} style={{ color: "#666" }}>
                          İlgisiz
                        </a>
                        {" · "}
                        <a href={item.links.lessLikeThis} style={{ color: "#666" }}>
                          Bunun gibi az göster
                        </a>
                      </Text>
                    )}
                  </div>
                ))}
                <Hr style={{ borderColor: "#eeeeee" }} />
              </Section>
            ))}

          <Text style={{ fontSize: 11, color: "#999999", marginTop: 24 }}>dailydigest, kişisel dış politika istihbarat masası.</Text>
        </Container>
      </Body>
    </Html>
  );
}

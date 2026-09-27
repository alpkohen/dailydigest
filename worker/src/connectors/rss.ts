import Parser from "rss-parser";

const parser = new Parser({ timeout: 15_000 });

export interface RssItem {
  title: string;
  url: string;
  standfirst?: string;
  author?: string;
  publishedAt?: string;
}

/** Fetches and parses one RSS/Atom feed. Throws on network/parse failure so the caller can record source health. */
export async function fetchRssFeed(feedUrl: string): Promise<RssItem[]> {
  const feed = await parser.parseURL(feedUrl);
  return (feed.items ?? [])
    .filter((item): item is typeof item & { link: string; title: string } => Boolean(item.link && item.title))
    .map((item) => ({
      title: item.title,
      url: item.link,
      standfirst: item.contentSnippet ?? item.summary,
      author: item.creator ?? item.author,
      publishedAt: item.isoDate ?? item.pubDate,
    }));
}

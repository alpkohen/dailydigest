import { render } from "@react-email/render";
import { DailyBrief, type BriefContent } from "./DailyBrief.js";

export { DailyBrief, type BriefContent, type BriefSectionItem } from "./DailyBrief.js";

export async function renderDailyBrief(content: BriefContent, dateLabel: string): Promise<{ html: string; text: string }> {
  const element = DailyBrief({ content, dateLabel });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

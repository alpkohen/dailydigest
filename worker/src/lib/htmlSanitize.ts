// jsdom parses every <style> tag's content into a CSSOM stylesheet
// synchronously while building the document. Pathological/malformed CSS in
// the wild can send that parser into what is effectively an infinite loop
// (observed live: a 2026-10-01 extract run stuck for its full 3-hour job
// timeout, zero items processed, last log line mid "Could not parse CSS
// stylesheet"). Readability only needs document structure and text, not
// styling, so stripping style content before JSDOM ever sees it removes
// that hang vector entirely rather than trying to bound it after the fact.
export function stripStylesheets(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi, "");
}

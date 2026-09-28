import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServiceRoleClient } from "@dailydigest/db";
import { buildStoryEnrichPrompt, callLlm, storyEnrichSchema } from "@dailydigest/llm";
import { loadEvalModelsConfig } from "./config.js";
import { loadEvalEnv } from "./env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenCase {
  case_id: string;
  label: string;
  items: { title: string; standfirst: string | null; sourceName: string; perspectiveGroup: string | null; language: string | null }[];
  mustContain: string[];
  mustNotContain: string[];
  minFramingGroups?: number;
  maxFramingGroups?: number;
}

interface CaseFailure {
  reason: string;
}

// enrich's prompt always writes Turkish output, where decimals use a comma
// ("3,5" not "3.5") - a first eval run against the real model found two
// "failures" that were actually correct, accurate Turkish output the
// checker just didn't recognize. Real bug was in the eval, not the prompt:
// check both the term as given and its Turkish decimal-comma variant.
function textContainsTerm(text: string, term: string): boolean {
  const lower = term.toLowerCase();
  if (text.includes(lower)) return true;
  if (/\d\.\d/.test(lower)) return text.includes(lower.replace(".", ","));
  return false;
}

/**
 * CLAUDE.md rule 9: "Add an eval run before changing any prompt." Mirrors
 * the hallucination-focused golden-dataset pattern from a sister project's
 * eval suite (mustContain/mustNotContain assertions, including thin-content
 * edge cases where a model is most tempted to invent specifics) - dailydigest
 * had no eval suite at all before this, just a scaffold. Targets
 * buildStoryEnrichPrompt/storyEnrichSchema first since CLAUDE.md's "never
 * state a claim not in the source items" rule applies most directly to
 * enrich's output, which readers see verbatim in the brief.
 */
export async function runEnrichEval(): Promise<boolean> {
  const env = loadEvalEnv();
  const models = await loadEvalModelsConfig();
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const raw = await readFile(join(__dirname, "..", "data", "enrich.golden.json"), "utf8");
  const cases = JSON.parse(raw) as GoldenCase[];

  let passed = 0;
  const failures: { case_id: string; label: string; reasons: string[] }[] = [];

  for (const c of cases) {
    const reasons: CaseFailure[] = [];
    let combinedText = "";
    try {
      const result = await callLlm({
        role: "strong",
        promptName: "story_enrich",
        prompt: buildStoryEnrichPrompt({ items: c.items }),
        schema: storyEnrichSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        stage: "eval_enrich",
        maxTokens: 1024,
      });

      const framing = result.framing ?? [];
      combinedText = [result.summary, result.what_changed, result.why_it_matters, result.watch_next, ...framing.map((f) => f.summary)]
        .join(" ")
        .toLowerCase();

      for (const term of c.mustContain) {
        if (!textContainsTerm(combinedText, term)) reasons.push({ reason: `expected "${term}" in output, not found` });
      }
      for (const term of c.mustNotContain) {
        if (textContainsTerm(combinedText, term)) reasons.push({ reason: `forbidden term "${term}" found in output (likely hallucination)` });
      }
      if (c.minFramingGroups !== undefined && framing.length < c.minFramingGroups) {
        reasons.push({ reason: `expected at least ${c.minFramingGroups} framing entries, got ${framing.length}` });
      }
      if (c.maxFramingGroups !== undefined && framing.length > c.maxFramingGroups) {
        reasons.push({ reason: `expected at most ${c.maxFramingGroups} framing entries, got ${framing.length}` });
      }
    } catch (err) {
      reasons.push({ reason: `LLM call failed: ${(err as Error).message}` });
    }

    if (reasons.length === 0) {
      passed++;
      console.log(`  PASS  ${c.case_id}  ${c.label}`);
    } else {
      failures.push({ case_id: c.case_id, label: c.label, reasons: reasons.map((r) => r.reason) });
      console.log(`  FAIL  ${c.case_id}  ${c.label}`);
      for (const r of reasons) console.log(`          - ${r.reason}`);
      if (combinedText) console.log(`          output: ${combinedText}`);
    }
  }

  console.log(`\nenrich eval: ${passed}/${cases.length} passed`);
  return failures.length === 0;
}

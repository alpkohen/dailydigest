import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { embedTexts } from "@dailydigest/llm";
import type { Env } from "../env.js";

/** SPEC.md section 4.2: owner writes an analytical question. CLI path, same reasoning as create_topic. */
export async function runCreateQuestionStage(env: Env, models: ModelsConfig, text: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const [embedding] = await embedTexts({
    texts: [text],
    embedding: models.embedding,
    prices: models.prices_per_million_tokens,
    apiKeys: { openai: env.OPENAI_API_KEY },
    db,
    ownerId: env.OWNER_ID,
    stage: "create_question",
  });

  const { data, error } = await db
    .from("questions")
    .insert({ owner_id: env.OWNER_ID, text, active: true, embedding })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to insert question: ${error?.message}`);

  console.log(`Created question "${text}" (${data.id})`);
}

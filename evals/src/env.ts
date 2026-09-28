import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  OWNER_ID: z.string().uuid(),
});

export type EvalEnv = z.infer<typeof envSchema>;

export function loadEvalEnv(): EvalEnv {
  return envSchema.parse(process.env);
}

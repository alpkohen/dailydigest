import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // This project runs OpenAI-only for all roles (config/models.yaml), so
  // OPENAI_API_KEY is required and ANTHROPIC_API_KEY stays optional in case
  // a role is ever switched back.
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  // UUID of the single owner's auth.users row. There is no signup flow yet
  // (SPEC.md section 2: one owner, allowlisted by OWNER_EMAIL in the web
  // app), so this is captured once after the first magic-link sign-in and
  // set as a worker secret.
  OWNER_ID: z.string().uuid(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

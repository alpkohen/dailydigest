import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // This project runs OpenAI-only for all roles (config/models.yaml), so
  // OPENAI_API_KEY is required and ANTHROPIC_API_KEY stays optional in case
  // a role is ever switched back.
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Optional (SPEC.md section 15, open decision #5): ingest's exa jobs are
  // skipped with a warning when unset rather than failing the stage.
  EXA_API_KEY: z.string().optional(),
  // Optional: deliver stage skips sending (brief stays "ready") when unset.
  RESEND_API_KEY: z.string().optional(),
  // Where the brief is sent. Comma-separated for more than one recipient
  // (SPEC.md still assumes one owner, but nothing stops CCing e.g. a
  // colleague on the daily send) - deliver.ts splits and validates each
  // address, so this stays a plain string rather than z.string().email().
  BRIEF_RECIPIENT_EMAIL: z.string().min(1).optional(),
  // Defaults to Resend's shared test sender until a custom domain is
  // verified (SPEC.md section 15, open decision #6).
  RESEND_FROM_EMAIL: z.string().optional(),
  // UUID of the single owner's auth.users row. There is no signup flow yet
  // (SPEC.md section 2: one owner, allowlisted by OWNER_EMAIL in the web
  // app), so this is captured once after the first magic-link sign-in and
  // set as a worker secret.
  OWNER_ID: z.string().uuid(),
  // Signs the one-click feedback links embedded in the brief email
  // (SPEC.md section 9). Must match apps/web's HMAC_SECRET, which verifies
  // them.
  HMAC_SECRET: z.string().min(16).optional(),
  // Base URL the feedback links point at; defaults to local dev.
  WEB_APP_URL: z.string().url().default("http://localhost:3100"),
  // Kill switch (recommendation #3 from reviewing a sister project's
  // ACTAWARE_BACKGROUND_PAUSED): set to "true" as a GitHub Actions repo
  // variable to stop every scheduled and manual run from doing any real
  // work - no LLM calls, no fetches, no email - without touching code or
  // waiting on a deploy. Toggle it back to resume.
  WORKER_BACKGROUND_PAUSED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

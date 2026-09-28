-- The full-system audit found llm_calls rows with ok=false but no way to
-- tell WHY a call failed (rate limit? schema validation? network?) without
-- reproducing it live. Persisting the error message turns "something in
-- relevance is failing 39% of the time" into an actionable diagnosis.
alter table llm_calls add column error text;

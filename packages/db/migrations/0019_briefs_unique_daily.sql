-- Backstops the compose_brief guard: even if two runs somehow overlap, the
-- database rejects a second daily brief for the same date instead of
-- deliver's later .single() lookup finding two "ready" rows and throwing.
-- Scoped to kind='daily' only: SPEC.md section 4.9 allows up to 3 alert
-- briefs per day, so a table-wide unique constraint would break those.
create unique index briefs_owner_daily_period_key on briefs (owner_id, period_date) where kind = 'daily';

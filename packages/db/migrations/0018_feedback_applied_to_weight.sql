-- Fixes a real bug: the learn stage re-summed every feedback row ever
-- recorded on every run, so a single piece of feedback kept nudging a
-- source's weight by up to +-0.05 every night forever instead of once.
-- This column lets learn process each row exactly one time.
alter table feedback add column applied_to_weight_at timestamptz;

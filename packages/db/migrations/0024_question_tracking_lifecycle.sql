-- Make tracked questions useful immediately and keep daily evidence checks
-- idempotent even when a story is not relevant to the question.

alter table question_evidence
  add column relevant boolean not null default true;

alter table question_updates
  add column update_type text not null default 'weekly'
    check (update_type in ('initial', 'weekly')),
  add column citations jsonb not null default '[]'::jsonb;

-- A question has one baseline assessment. Weekly updates remain append-only.
create unique index question_updates_one_initial_per_question
  on question_updates (question_id)
  where update_type = 'initial';

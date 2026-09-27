-- Row Level Security on every table, scoped to owner_id = auth.uid().
-- CLAUDE.md rule: "Every table has owner_id and RLS, even though there is
-- one user today." The service role key (worker) bypasses RLS by design.

do $$
declare
  t text;
  owned_tables text[] := array[
    'profiles', 'perspective_groups', 'sources', 'topics', 'questions', 'watches',
    'items', 'item_topic_scores',
    'stories', 'story_items', 'story_links', 'story_topics',
    'question_evidence', 'question_updates', 'research_items',
    'briefs', 'brief_stories',
    'feedback', 'reading_list', 'dossiers', 'ask_threads', 'ask_messages',
    'jobs', 'pipeline_runs', 'llm_calls', 'evals'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select using (owner_id = auth.uid())',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on %I for insert with check (owner_id = auth.uid())',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on %I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on %I for delete using (owner_id = auth.uid())',
      t || '_delete_own', t
    );
  end loop;
end $$;

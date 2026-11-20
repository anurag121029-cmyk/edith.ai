-- EDITH AI — 0005_daily_insights.sql (idempotent; safe to re-run in the SQL editor)
-- Daily understanding: one remembered row per user per day, so the app
-- remembers what it learned about the user's days instead of recomputing
-- everything from scratch on every visit. Scores come from lib/patterns.ts
-- (stress / workload / mood / wellbeing, all nullable — a day with no
-- data stores null, never an invented value); patterns is the JSON of
-- busiest hours / hardest and calmest weekdays, briefing is the plain
-- text "today" briefing for that day.
-- Apply after 0001–0004 (supabase/apply-all.sql includes this file).

-- ---------- daily_insights ----------
create table if not exists public.daily_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  stress_score int check (stress_score between 0 and 100),
  workload_score int check (workload_score between 0 and 100),
  mood_score int check (mood_score between 0 and 100),
  wellbeing_score int check (wellbeing_score between 0 and 100),
  patterns jsonb not null default '{}'::jsonb,
  briefing text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, date));

create index if not exists idx_daily_insights_user_date on public.daily_insights(user_id, date desc);

drop trigger if exists set_updated_at_daily_insights on public.daily_insights;
create trigger set_updated_at_daily_insights before update on public.daily_insights
  for each row execute function public.set_updated_at();

-- ---------- RLS: owner-only, same pattern as the other user tables ----------
alter table public.daily_insights enable row level security;
drop policy if exists daily_insights_select_own on public.daily_insights;
create policy daily_insights_select_own on public.daily_insights for select using (auth.uid() = user_id);
drop policy if exists daily_insights_insert_own on public.daily_insights;
create policy daily_insights_insert_own on public.daily_insights for insert with check (auth.uid() = user_id);
drop policy if exists daily_insights_update_own on public.daily_insights;
create policy daily_insights_update_own on public.daily_insights for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists daily_insights_delete_own on public.daily_insights;
create policy daily_insights_delete_own on public.daily_insights for delete using (auth.uid() = user_id);

-- EDITH AI — 0004_task_sessions.sql (idempotent; safe to re-run in the SQL editor)
-- Planned task sessions: a task can carry a start time, a planned duration,
-- a place and a reminder, and each completed run is recorded in task_sessions
-- with how difficult and how stressful it felt, so the app can report on it.
-- Apply after 0001–0003 (supabase/apply-all.sql includes this file).

-- ---------- new columns on tasks ----------
alter table public.tasks
  add column if not exists start_time timestamptz,
  add column if not exists planned_minutes int check (planned_minutes >= 0),
  add column if not exists place text,
  add column if not exists reminder_at timestamptz,
  add column if not exists difficulty int check (difficulty between 1 and 5),
  add column if not exists stress_after int check (stress_after between 1 and 10),
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

-- ---------- task_sessions ----------
create table if not exists public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  topic text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes int not null default 0 check (duration_minutes >= 0),
  difficulty int check (difficulty between 1 and 5),
  stress_after int check (stress_after between 1 and 10),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists idx_task_sessions_user_started on public.task_sessions(user_id, started_at desc);
create index if not exists idx_task_sessions_task on public.task_sessions(task_id);

drop trigger if exists set_updated_at_task_sessions on public.task_sessions;
create trigger set_updated_at_task_sessions before update on public.task_sessions
  for each row execute function public.set_updated_at();

-- ---------- RLS: owner-only, same pattern as the other user tables ----------
alter table public.task_sessions enable row level security;
drop policy if exists task_sessions_select_own on public.task_sessions;
create policy task_sessions_select_own on public.task_sessions for select using (auth.uid() = user_id);
drop policy if exists task_sessions_insert_own on public.task_sessions;
create policy task_sessions_insert_own on public.task_sessions for insert with check (auth.uid() = user_id);
drop policy if exists task_sessions_update_own on public.task_sessions;
create policy task_sessions_update_own on public.task_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists task_sessions_delete_own on public.task_sessions;
create policy task_sessions_delete_own on public.task_sessions for delete using (auth.uid() = user_id);

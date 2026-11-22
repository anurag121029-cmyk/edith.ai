-- EDITH AI — 0007_relaxation_sessions.sql (idempotent; safe to re-run in the SQL editor)
-- Guided relaxation sessions: a record of completed practice sessions
-- (which session, how long, optional mood afterwards) so the app
-- remembers practice. Session definitions live in lib/relaxation.ts;
-- this table only stores that a session was completed.
-- Apply after 0001–0006 (supabase/apply-all.sql includes this file).

-- ---------- relaxation_sessions ----------
create table if not exists public.relaxation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  duration_seconds int not null check (duration_seconds > 0),
  completed boolean not null default true,
  mood_after int check (mood_after between 1 and 10),
  created_at timestamptz not null default now());

create index if not exists idx_relaxation_sessions_user_created on public.relaxation_sessions(user_id, created_at desc);

-- ---------- RLS: owner-only, same pattern as the other user tables ----------
alter table public.relaxation_sessions enable row level security;
drop policy if exists relaxation_sessions_select_own on public.relaxation_sessions;
create policy relaxation_sessions_select_own on public.relaxation_sessions for select using (auth.uid() = user_id);
drop policy if exists relaxation_sessions_insert_own on public.relaxation_sessions;
create policy relaxation_sessions_insert_own on public.relaxation_sessions for insert with check (auth.uid() = user_id);
drop policy if exists relaxation_sessions_update_own on public.relaxation_sessions;
create policy relaxation_sessions_update_own on public.relaxation_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists relaxation_sessions_delete_own on public.relaxation_sessions;
create policy relaxation_sessions_delete_own on public.relaxation_sessions for delete using (auth.uid() = user_id);

-- EDITH AI — 0001_initial.sql (idempotent where possible; safe to re-run in the SQL editor)
create extension if not exists "pgcrypto";

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text, goals text,
  preferences jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Signup trigger: profile id ALWAYS comes from auth.users; never user-supplied.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name',''))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Backfill/repair: existing auth users without a profile get one.
insert into public.profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

-- ---------- generic user-owned tables ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')), content text not null,
  created_at timestamptz not null default now());
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text, status text not null default 'todo' check (status in ('todo','in_progress','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high')), category text default 'general',
  due_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null, duration_minutes int not null default 0 check (duration_minutes >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.workload_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, hours numeric not null default 0 check (hours >= 0), intensity int not null default 5 check (intensity between 1 and 10),
  category text default 'work', due_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.mood_checkins (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  mood_score int not null check (mood_score between 1 and 10), stress_score int not null check (stress_score between 1 and 10),
  note text, created_at timestamptz not null default now());
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'general', content text not null, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null, week_end date not null, summary text not null, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, content text not null, category text not null default 'preference', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  email_reports boolean not null default false, weekly_digest boolean not null default false, recipient_email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.report_deliveries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.weekly_reports(id) on delete set null, recipient_email text not null,
  status text not null default 'pending', provider text, created_at timestamptz not null default now());
create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null, storage_path text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  transcript text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());

-- ---------- indexes ----------
create index if not exists idx_conversations_user on public.conversations(user_id, created_at desc);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_messages_user on public.messages(user_id);
create index if not exists idx_tasks_user_due on public.tasks(user_id, due_date);
create index if not exists idx_study_user on public.study_sessions(user_id, created_at desc);
create index if not exists idx_workload_user on public.workload_entries(user_id, created_at desc);
create index if not exists idx_mood_user on public.mood_checkins(user_id, created_at desc);
create index if not exists idx_memories_user on public.memories(user_id, created_at desc);
create index if not exists idx_reports_user on public.weekly_reports(user_id, created_at desc);

-- ---------- updated_at triggers ----------
do $$ declare t text; begin
  foreach t in array array['profiles','conversations','tasks','study_sessions','workload_entries','memories','notification_preferences'] loop
    execute format('drop trigger if exists set_updated_at_%I on public.%I', t, t);
    execute format('create trigger set_updated_at_%I before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- RLS: owner-only on every user table ----------
do $$ declare t text; begin
  foreach t in array array['profiles','conversations','messages','tasks','study_sessions','workload_entries','mood_checkins','insights','weekly_reports','memories','notification_preferences','report_deliveries','generated_images','voice_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- profiles uses id = auth.uid(); all other tables use user_id = auth.uid().
-- For messages this also enforces ownership directly, and conversation ownership is enforced by conversations RLS + FK.
do $$ declare t text; begin
  foreach t in array array['conversations','tasks','study_sessions','workload_entries','mood_checkins','insights','weekly_reports','memories','notification_preferences','report_deliveries','generated_images','voice_sessions','messages'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t||'_select_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert_own', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t||'_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_update_own', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_update_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete_own', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t||'_delete_own', t);
  end loop;
end $$;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles for delete using (auth.uid() = id);

-- ---------- DB health check (run manually) ----------
-- select tablename from pg_tables where schemaname='public' order by 1;
-- select tgname from pg_trigger where tgname='on_auth_user_created';
-- select count(*) as users_without_profile from auth.users u left join public.profiles p on p.id=u.id where p.id is null; -- expect 0

-- EDITH AI — 0003_missing_spec_tables.sql (idempotent; safe to re-run)
--
-- Spec §18 names 14 tables. Audited against 0001, only TWO were missing:
--   uploaded_files, user_settings
-- The rest already exist under equivalent names and are NOT duplicated here:
--   saved_memories      -> memories
--   workload_snapshots  -> workload_entries
--   image_generations   -> generated_images
--   report_preferences  -> notification_preferences (one row per user)
--   report_delivery_logs -> report_deliveries
-- Renaming the existing tables would break the app, so the mapping is
-- documented in README §9 instead.
--
-- Honest scope note: these two tables are schema only for now.
--  - uploaded_files: the current vision flow sends uploads to the Gemini
--    API and does NOT store them, so no rows are written yet. The table
--    exists so a future private-storage integration has a place to record
--    user-owned file references without a new migration.
--  - user_settings: the app currently reads profile preferences from
--    profiles.preferences (memory on/off, onboarding answers). This table
--    is reserved for a future settings migration and is NOT read by the
--    app today, so it must not be treated as a second source of truth.

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text,
  file_size_bytes integer not null default 0 check (file_size_bytes >= 0),
  storage_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  voice_enabled boolean not null default true,
  notifications_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists idx_uploaded_files_user on public.uploaded_files(user_id, created_at desc);

-- updated_at trigger for user_settings (uploaded_files reuses the same function)
drop trigger if exists set_updated_at_user_settings on public.user_settings;
create trigger set_updated_at_user_settings before update on public.user_settings
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_uploaded_files on public.uploaded_files;
create trigger set_updated_at_uploaded_files before update on public.uploaded_files
  for each row execute function public.set_updated_at();

-- Owner-only RLS, same pattern as 0001: auth.uid() = user_id.
alter table public.uploaded_files enable row level security;
alter table public.user_settings enable row level security;
do $$ declare t text; begin
  foreach t in array array['uploaded_files','user_settings'] loop
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

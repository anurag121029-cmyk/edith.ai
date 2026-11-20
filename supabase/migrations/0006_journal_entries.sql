-- EDITH AI — 0006_journal_entries.sql (idempotent; safe to re-run in the SQL editor)
-- Optional journal entries: private free-text entries with an optional
-- title and an optional mood score (1–10). Several entries per day are
-- allowed — there is deliberately NO unique constraint on
-- (user_id, entry_date). Journal content is private to the account:
-- it is never sent to Gemini, never used in any summary, and never
-- shown anywhere except the journal page itself.
-- Apply after 0001–0005 (supabase/apply-all.sql includes this file).

-- ---------- journal_entries ----------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  title text,
  content text not null,
  mood_score int check (mood_score between 1 and 10),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index if not exists idx_journal_entries_user_date on public.journal_entries(user_id, entry_date desc);

drop trigger if exists set_updated_at_journal_entries on public.journal_entries;
create trigger set_updated_at_journal_entries before update on public.journal_entries
  for each row execute function public.set_updated_at();

-- ---------- RLS: owner-only, same pattern as the other user tables ----------
alter table public.journal_entries enable row level security;
drop policy if exists journal_entries_select_own on public.journal_entries;
create policy journal_entries_select_own on public.journal_entries for select using (auth.uid() = user_id);
drop policy if exists journal_entries_insert_own on public.journal_entries;
create policy journal_entries_insert_own on public.journal_entries for insert with check (auth.uid() = user_id);
drop policy if exists journal_entries_update_own on public.journal_entries;
create policy journal_entries_update_own on public.journal_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists journal_entries_delete_own on public.journal_entries;
create policy journal_entries_delete_own on public.journal_entries for delete using (auth.uid() = user_id);

-- EDITH AI — 0002_weekly_report_unique_week.sql (idempotent; safe to re-run)
--
-- Problem fixed: regenerating a weekly report previously inserted a new
-- weekly_reports row every time, so one week could appear many times.
-- Fix: one report per (user_id, week_start). The app now upserts on
-- (user_id, week_start) in app/insights/page.tsx.
--
-- Safety: this migration does NOT delete any existing rows. If duplicate
-- (user_id, week_start) rows already exist, creating a unique index would
-- fail and abort the script, so the index is only created when a check
-- confirms no duplicates would violate it. In that case the script still
-- succeeds, and the duplicates must be resolved manually first:
--   1. Find them:
--      select user_id, week_start, count(*) from public.weekly_reports
--      group by user_id, week_start having count(*) > 1;
--   2. Keep the newest row per (user_id, week_start) and delete the rest,
--      e.g. keep the row with the greatest created_at (and id as tiebreak).
--   3. Re-run this migration; the index will then be created.
-- Until then, the app-level upsert will surface the conflict as an error
-- rather than silently duplicating, which is the safer failure mode.

do $$
begin
  if not exists (
    select 1 from public.weekly_reports
    group by user_id, week_start
    having count(*) > 1
    limit 1
  ) then
    execute 'create unique index if not exists idx_weekly_reports_user_week_unique on public.weekly_reports(user_id, week_start)';
  end if;
end $$;

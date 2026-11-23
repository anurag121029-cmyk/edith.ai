-- EDITH AI — 0008_morning_checkin.sql (idempotent; safe to re-run in the SQL editor)
-- Morning check-in: record last night's sleep alongside a mood check-in.
-- mood_checkins already has mood_score/stress_score (both NOT NULL, 1–10)
-- and note; this only adds the sleep column. The app stores the
-- representative hours for the sleep range the user picks (4.5, 5.5, 6.5,
-- 7.5 or 8.5) — an estimate, not a measured value. The morning check-in
-- derives stress_score from mood as 11 - mood (same mirror convention
-- as lib/moodAuto.ts) because the column is NOT NULL and the morning
-- check-in does not ask for stress; see lib/morningCheckin.ts.
-- Apply after 0001–0007 (supabase/apply-all.sql includes this file).

-- ---------- mood_checkins: sleep_hours ----------
alter table public.mood_checkins
  add column if not exists sleep_hours numeric(3,1)
    check (sleep_hours between 0 and 24);

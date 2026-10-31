# EDITH AI

Intelligent personal assistant for stress management, workload analysis, productivity and studying.
Stack: **Next.js (App Router) + TypeScript + Tailwind CSS v4**, **Supabase** (Auth, Postgres, RLS), **Gemini** (server-side only). Liquid-glass UI, installable as a PWA.

> Wellness content is non-clinical: EDITH reports your *self-reported* mood/stress scores. It does not diagnose any condition.

## 1. Prerequisites
- Node 20+ (built/tested with Node 24, npm 10)
- A Supabase project (free tier is fine)
- A Gemini API key (Google AI Studio)

## 2. Environment
Copy `.env.example` to `.env.local` and fill in real values (never commit `.env.local`):

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Public, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | **Server only, optional** — enables account deletion |
| `GEMINI_API_KEY` | Google AI Studio | **Server only** |
| `GEMINI_MODEL` | e.g. `gemini-2.0-flash` | Must support the feature you use; image generation needs an image-capable model |
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` | Used for auth email redirects |
| `EMAIL_PROVIDER` | optional | Leave blank: email report delivery is shown as unavailable in the app |

## 3. Database setup (Supabase)
1. Open your Supabase project → **SQL Editor**.
2. Paste the entire contents of `supabase/apply-all.sql` (covers the versioned migrations `supabase/migrations/0001_initial.sql`, `0002_weekly_report_unique_week.sql` and `0003_missing_spec_tables.sql`) and run it.
3. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` (and your production URL) to Redirect URLs, and set the Site URL.
4. Health check: run the three queries commented at the bottom of `apply-all.sql`. The "users without profile" count should be `0`. The app also exposes `GET /api/health`, which reports which integrations are configured (never secret values).

This creates: `profiles` (+ signup trigger), `conversations`, `messages`, `tasks`, `study_sessions`, `workload_entries`, `mood_checkins`, `insights`, `weekly_reports`, `memories`, `notification_preferences`, `report_deliveries`, `generated_images`, `voice_sessions`, `uploaded_files`, `user_settings` — all with Row Level Security: each user can only select/insert/update/delete their own rows.

## 4. Run locally
```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (vitest)
npm run typecheck
npm run build      # production build
npm start
```
Without Supabase/Gemini keys the app still runs: auth/data pages show an explicit "not configured" notice and AI routes return an honest `503` — nothing is faked.

## 5. Verify signup & profile creation
1. With keys set and SQL applied, go to `/signup` and register with a real email.
2. Confirm via the email link (redirects to `/auth/callback` → `/onboarding`).
3. In Supabase → Table Editor → `profiles`, you should see exactly **one** row whose `id` equals that user's Auth UUID (created by the `handle_new_user` trigger — users never type a UUID).
4. Complete onboarding, add a task in `/tasks`, refresh: it persists. Log in as a second user: you must not see the first user's tasks, chats, memories or profile (RLS).

## 6. Install on a phone (PWA)
1. Deploy or run the app over HTTPS (PWA install requires HTTPS, except on localhost).
2. Android/Chrome: open the site → browser menu → **Add to Home screen / Install app**.
3. iPhone/Safari: Share → **Add to Home Screen**.
The service worker caches only the app shell/static assets — never `/api/` or private data. Offline, an explicit notice is shown; AI needs a connection.

## 7. Features
Landing, signup/login/email confirmation/password reset, onboarding (also repairs a missing profile), dashboard computed from your real records, persistent chat (rename/delete/search conversations, copy, regenerate, save-as-memory, lightweight markdown, relevant saved memories injected into context with a UI note), study assistant + session log, task CRUD with filters/overdue, workload analyser, mood/stress check-ins, weekly reports (generated from real data, print → Save as PDF; one report per user per week — regenerating updates the existing report instead of duplicating it), Remember My Context (CRUD, keyword search, enable/disable, clear all, secret-blocking), vision Q&A, image generation (only when the configured model returns image data), voice (browser Web Speech API), settings with metadata-only JSON data export (full message bodies only with explicit opt-in) and account deletion, `/api/health`, authenticated `/integrations` status panel, plus public site pages (`/features`, `/privacy`, `/terms`), a site footer, 404/loading/error pages, and `sitemap.xml`/`robots.txt` covering public routes only.

API rate limits (per IP, per 60 seconds, in-memory; a `429` response includes a `Retry-After` header): `/api/chat` 30/min, `/api/vision` and `/api/image` 10/min each. Limits do not store any user content.

## Refreshed design (visual-only refresh, no data/API changes)
The design system was refreshed in `app/globals.css` (deeper liquid-glass panels with subtler borders and softer gradients, a clearer spacing scale, larger/bolder heading hierarchy, refined primary/secondary/danger buttons with hover/focus/disabled states, higher-contrast muted text, badges, notices and a shared empty-state pattern), the landing page now has a clearer hero with signup/features CTAs, a "How it works" strip and a feature grid linking to real pages (no invented statistics, testimonials, user counts or pricing), and the app shell has a polished sidebar with an active-page state plus a mobile bottom nav with icons, labels and safe-area padding. The chat layout now stacks on small screens instead of overflowing. No routes were renamed, and no Supabase schema, auth flow, API behaviour, rate limit or business logic was changed in this refresh.

## 8. Known limitations
- Email report delivery is **not implemented** (no provider configured) — the app says so and offers print/PDF instead. Sending to parents/third parties is intentionally not a feature.
- PDF export is browser print → "Save as PDF", not a server-generated file.
- Image generation depends entirely on the configured Gemini model supporting it; the default text model will return a clear error.
- Voice recognition depends on the browser (best in Chrome/Edge); Safari support is limited.
- Semantic/vector memory search is not included — memories are retrieved per-user by keyword relevance (title > category > content), not embeddings.
- Native iOS/Android apps are not included; the PWA is the mobile route. Capacitor could wrap this codebase later.
- RLS/integration behaviour can only be fully verified against a live Supabase project with two test accounts.

## 9. Spec checklist — honest status against the full EDITH spec

### Completed (implemented and unit/build-verified in this workspace)
- Auth: signup, signin, signout, email verification, password reset, session persistence, protected routes, profile management, onboarding (display name, role, schedule, goals, communication style, stress preferences — sensitive questions optional).
- Chat persistence: conversations + messages in Supabase, new/rename/delete/search conversations, copy response, regenerate (re-sends the last user message as a new turn), lightweight markdown rendering (headings, lists, bold, code blocks — no heavy dependency).
- Smart memory: CRUD, enable/disable, clear all, secret-blocking, keyword search, and — since this update — relevant enabled memories are injected into chat context (top 5, truncated, server-capped; the UI notes when memories are used). "Save as memory" on assistant replies.
- Tasks: full CRUD, priorities, categories, filters, search, due/overdue/upcoming views.
- Workload: deterministic calculations from stored tasks (counts, completion %, hours) plus AI-free summaries.
- Study assistant + session log; mood/stress check-ins (non-clinical, self-reported only).
- Voice: browser Web Speech input + spoken replies, with typed fallback and permission errors.
- Vision: upload validation (type/size), Gemini vision Q&A; uploads are **not stored**.
- Image generation: real Gemini route; returns an image only when the model returns image data, otherwise an honest 422 — no placeholders.
- Dashboard computed from real records with empty states (no fake charts or hardcoded stats).
- Weekly reports: generated from real data, one per user per week (upsert + unique index, migration 0002), print → Save as PDF.
- Settings: profile edit, memory controls, metadata-only data export (full message bodies only with explicit opt-in), server-side account deletion route.
- Security: server-only keys, RLS on every user table, input validation, file validation, API rate limits (chat 30/min, vision/image 10/min, 429 + Retry-After), safe error messages.
- Integration status panel: `/integrations` (authenticated, not in public nav) — see its page notes for what "configured" does and does not prove.
- Public site pages (Features, Privacy, Terms), footer, 404/loading/error pages, sitemap/robots (public routes only), refreshed liquid-glass design.

### Incomplete (deliberately not claimed as working)
- Email delivery: no provider — manual print/PDF only. No parent/guardian report feature.
- Streaming: not implemented — chat responses arrive complete, not streamed.
- Light mode: dark is the primary theme; light mode is not implemented (the `user_settings.theme` check constraint allows 'light' for the future, but the UI has no light theme).
- True PDF generation: browser print → "Save as PDF" only, no server PDF file.
- Maths typesetting: equations render as plain text; KaTeX/MathJax is not included.
- `uploaded_files` / `user_settings` tables: schema only (migration 0003). The vision flow does not store uploads, and the app still reads preferences from `profiles.preferences`.

### Unverified live (needs the user's own credentials/environment)
- Supabase/Gemini end-to-end: signup → profile → chat reply → persistence, with real keys.
- RLS two-account check: a second user must not see the first user's records.
- Voice on a real phone (needs HTTPS + mic permission); camera features do not exist in EDITH (they belong to the separate ULTRON project).
- Live 429 behaviour and live Gemini vision/image success against a real key and a capable model.

### Database naming map (spec §18 → actual tables; no duplicates, no renames)
| Spec name | Actual table | Note |
|---|---|---|
| saved_memories | `memories` | — |
| workload_snapshots | `workload_entries` | — |
| image_generations | `generated_images` | — |
| report_preferences | `notification_preferences` | One row per user (`user_id` unique) |
| report_delivery_logs | `report_deliveries` | — |
| uploaded_files | `uploaded_files` | Schema only (see above) |
| user_settings | `user_settings` | Schema only (see above) |
| All others | Same name as spec | `profiles`, `conversations`, `messages`, `tasks`, `mood_checkins`, `study_sessions`, `weekly_reports` (+ `insights`, `voice_sessions` extras) |

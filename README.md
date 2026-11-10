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
| `GEMINI_MODEL` | e.g. `gemini-3.8-flash` | Chat, streaming and vision — must be a text/multimodal model |
| `GEMINI_IMAGE_MODEL` | e.g. `gemini-2.5-flash-image` | **Separate image model** for `/api/image` (default `gemini-2.5-flash-image`, "Nano Banana"). Do NOT set this to the chat model — `gemini-3.8-flash` returns text only, so image generation can never work with it. The image route requests `responseModalities: ["TEXT","IMAGE"]` explicitly. Note: `gemini-2.5-flash-image` is deprecated with a March 15, 2027 shutdown — it is still served, but plan a migration before then. |
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
Landing, signup/login/email confirmation/password reset, onboarding (also repairs a missing profile), dashboard computed from your real records, persistent chat (rename/delete/search conversations, copy, regenerate, save-as-memory, lightweight markdown with styled maths, relevant saved memories injected into context with a UI note; replies stream from `/api/chat/stream` with a stop control and automatic fallback to `/api/chat`), study assistant + session log, task CRUD with filters/overdue, workload analyser, mood/stress check-ins, weekly reports (generated from real data, server-generated PDF download per saved report plus print → Save as PDF as fallback; email delivery via the Resend provider interface when configured, summary only; one report per user per week — regenerating updates the existing report instead of duplicating it), Remember My Context (CRUD, keyword search, enable/disable, clear all, secret-blocking), vision Q&A, image generation (separate image model `GEMINI_IMAGE_MODEL`, default `gemini-2.5-flash-image`, with image output requested explicitly; a 422 now means the provider genuinely returned no image for that prompt), voice (browser Web Speech API), settings with a dark/light theme toggle (persisted to `user_settings.theme` when signed in, localStorage otherwise) and metadata-only JSON data export (full message bodies only with explicit opt-in) and account deletion, `/api/health`, authenticated `/integrations` status panel, plus public site pages (`/features`, `/privacy`, `/terms`), a site footer, 404/loading/error pages, and `sitemap.xml`/`robots.txt` covering public routes only.

API rate limits (per IP, per 60 seconds, in-memory; a `429` response includes a `Retry-After` header): `/api/chat` 30/min, `/api/vision` and `/api/image` 10/min each. Limits do not store any user content.

## Refreshed design (visual-only refresh, no data/API changes)
The design system was refreshed in `app/globals.css` (deeper liquid-glass panels with subtler borders and softer gradients, a clearer spacing scale, larger/bolder heading hierarchy, refined primary/secondary/danger buttons with hover/focus/disabled states, higher-contrast muted text, badges, notices and a shared empty-state pattern), the landing page now has a clearer hero with signup/features CTAs, a "How it works" strip and a feature grid linking to real pages (no invented statistics, testimonials, user counts or pricing), and the app shell has a polished sidebar with an active-page state plus a mobile bottom nav with icons, labels and safe-area padding. The chat layout now stacks on small screens instead of overflowing. No routes were renamed, and no Supabase schema, auth flow, API behaviour, rate limit or business logic was changed in this refresh.

## 8. Known limitations
- Email report delivery works only when a provider is configured (`EMAIL_PROVIDER=resend` + `RESEND_API_KEY`); without them the app returns a clear "not configured" error and claims no delivery. Sending to parents/third parties is intentionally not a feature.
- PDF export: saved reports download as a real server-generated PDF (`/api/report-pdf`, owner-only); browser print → "Save as PDF" remains the fallback if that route fails.
- Image generation uses its own model (`GEMINI_IMAGE_MODEL`, default `gemini-2.5-flash-image`) with `responseModalities: ["TEXT","IMAGE"]` requested explicitly. The old bug — `/api/image` calling the text-only chat model (`gemini-3.8-flash`) with no image-output request, so it could never return image data — is fixed; a 422 now only means the provider genuinely returned no image for that prompt. Note: `gemini-2.5-flash-image` is deprecated with a March 15, 2027 shutdown; it is still served.
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
- Image generation: real Gemini route on a separate image model (`GEMINI_IMAGE_MODEL`, default `gemini-2.5-flash-image`) with image output requested explicitly; returns an image when the provider returns one, otherwise an honest 422 — no placeholders. (Previously it called the text-only chat model, so it could never return an image — fixed.)
- Dashboard computed from real records with empty states (no fake charts or hardcoded stats).
- Weekly reports: generated from real data, one per user per week (upsert + unique index, migration 0002), server-generated PDF download (owner-only, pdf-lib) plus print → Save as PDF fallback, and a Resend provider interface for emailing the summary only (honest "not configured" error when unset).
- Chat streaming: `/api/chat/stream` (same validation, rate limit, history/memory caps as `/api/chat`), visible streaming indicator, stop control, automatic fallback to `/api/chat`, final reply saved as one message.
- Light mode: dark/light toggle in the sidebar and Settings, persisted to `user_settings.theme` when signed in (migration 0003) and to localStorage otherwise; dark remains the default.
- Maths: inline `$...$` and block `$$...$$` render as styled maths in the dependency-free markdown renderer (styled, not KaTeX — see lib/markdown.ts).
- Settings: profile edit, memory controls, metadata-only data export (full message bodies only with explicit opt-in), server-side account deletion route.
- Security: server-only keys, RLS on every user table, input validation, file validation, API rate limits (chat 30/min, vision/image 10/min, 429 + Retry-After), safe error messages.
- Integration status panel: `/integrations` (authenticated, not in public nav) — see its page notes for what "configured" does and does not prove.
- Public site pages (Features, Privacy, Terms), footer, 404/loading/error pages, sitemap/robots (public routes only), refreshed liquid-glass design.

### Incomplete (deliberately not claimed as working)
- Email delivery without a configured provider: the Resend interface is implemented, but with no provider/key set (the live default) delivery returns a clear "not configured" error and nothing is sent. No parent/guardian report feature.
- Maths typesetting: equations render as styled notation (inline `$...$`, block `$$...$$`), NOT KaTeX/MathJax typesetting — fractions/roots render literally (e.g. `\frac{1}{2}`), by design, with no extra dependency.
- `uploaded_files` table: schema only (migration 0003). The vision flow does not store uploads.
- `uploaded_files` table: schema only (migration 0003). The vision flow does not store uploads. `user_settings` is now used for the theme only; other preferences are still read from `profiles.preferences`.

### Unverified live (needs the user's own credentials/environment)
- Supabase/Gemini end-to-end: signup → profile → chat reply → persistence, with real keys.
- RLS two-account check: a second user must not see the first user's records.
- Voice on a real phone (needs HTTPS + mic permission); camera features do not exist in EDITH (they belong to the separate ULTRON project).
- Live 429 behaviour and live Gemini vision/image success against a real key and a capable model. Image generation is unit-verified against a mocked provider (correct model + `responseModalities`), but no real image has been generated live yet — that needs a live end-to-end test on the deployed site.

### Database naming map (spec §18 → actual tables; no duplicates, no renames)
| Spec name | Actual table | Note |
|---|---|---|
| saved_memories | `memories` | — |
| workload_snapshots | `workload_entries` | — |
| image_generations | `generated_images` | — |
| report_preferences | `notification_preferences` | One row per user (`user_id` unique) |
| report_delivery_logs | `report_deliveries` | — |
| uploaded_files | `uploaded_files` | Schema only (see above) |
| user_settings | `user_settings` | Theme column now used by the theme toggle; other settings still in `profiles.preferences` |
| All others | Same name as spec | `profiles`, `conversations`, `messages`, `tasks`, `mood_checkins`, `study_sessions`, `weekly_reports` (+ `insights`, `voice_sessions` extras) |

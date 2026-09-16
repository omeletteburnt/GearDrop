# GearDrop Hardening — Feature Brief

Standing instruction set for the multi-session security/design/UX audit of GearDrop. Read this file, PLAN.md, ASSUMPTIONS.md, and the last WORKLOG.md entry at the start of every session before doing anything else.

## Project

GearDrop — a second-hand gaming gear marketplace (public demo repo).

- Repo: https://github.com/omeletteburnt/GearDrop.git
- **The actual app lives in the nested path `2026-09-14/hel/work/GearDrop/`, not the repo root.**
- Live: https://gear-drop-4xza.vercel.app/
- Stack: Vite + React + TypeScript (client-only SPA, no server code) · custom CSS, no UI framework · Supabase (Postgres + Auth via hand-rolled REST fetch, not supabase-js) · pnpm · Vercel · no test setup exists.

## Goal

Audit and harden the app across three areas, then ship a prioritized findings report followed by step-by-step implementation of critical/high fixes:

1. **Security** — committed-secret remediation, Supabase auth/session handling, RLS verification, input validation.
2. **Premium visual redesign** — elevate the current demo look into a polished, high-end marketplace feel, plus accessibility and responsive behavior.
3. **UX and performance.**

Also: repo hygiene (nested path, committed `dist/`, committed env file).

## Data model (see supabase-setup.sql / supabase-admin-setup.sql in the app folder)

- `profiles` (id → auth.users, username) — publicly readable (username only).
- `listings` (owner_id, name, category, price, condition, status, image URL, description, specs jsonb, missing[], seller) — publicly readable; only signed-in users create with `auth.uid() = owner_id`; owners delete their own; admins delete any via `is_admin()` security-definer RPC + `admin_users` table.
- Demo listings are local display data in `src/data.ts` — never persisted, never deletable. Only real Supabase rows persist.

## Auth quirk

Sign-up synthesizes an email from the username (`identity(username)` → `username@nyx.local`). Sessions stored in `localStorage` under `nyx-session`. Supabase is called via hand-rolled `fetch` to the REST API (`src/supabase.ts`), not `@supabase/supabase-js`.

## Nyx AI assistant

UI mascot/assistant exists (`src/main.tsx`). A committed `AI_PROVIDER_API_KEY` (in `TheKey.env`) suggested it calls an external AI provider — **but exploration found no such call anywhere in `src/`**. All "Ask Nyx" behavior (`generalAnswer`, `rank`, comparison Q&A) is local string-template logic with zero network calls to an AI provider. This is logged as an OPEN assumption in ASSUMPTIONS.md — needs confirmation before deciding whether a serverless proxy is even needed for Nyx today, or only as forward-looking scaffolding.

## Step zero — committed secret

`TheKey.env` in the app folder contains a real `AI_PROVIDER_API_KEY` in a public repo. Treat as compromised.

- Confirm with the user that the key has been rotated at the provider before removing the file from history or proceeding past planning on this item.
- Remove the file from the working tree, add `*.env*` to `.gitignore`.
- Git history still contains it — recommend, but do not run, history rewriting (BFG/filter-repo) — user's call.
- **As of 2026-09-16: user has NOT rotated the key yet** ("not yet but I'll remove later"). Do not treat the key as neutralized. Do not assume rotation happened in a later session without re-confirming.

## Client-only reality check

This is a Vite SPA — every `VITE_`-prefixed var and every string in `dist/` is public. Nothing secret can live in the frontend. Any feature needing a secret (an AI provider key if Nyx ever calls one, rate limiting, server-side validation) must go through Vercel serverless functions (`api/`).

## Security requirements (full detail)

- RLS verification: dump live `pg_policies`, diff against the SQL files, verify with anon-key queries (writes without auth rejected, cross-user deletes rejected, admin behavior matches).
- Session handling: migrate off raw `localStorage` session juggling to `@supabase/supabase-js` session management; document residual localStorage risk; review token refresh/expiry (currently none visible).
- Input validation & XSS: add client-side validation; verify no `dangerouslySetInnerHTML`/`innerHTML` with user data (none found so far — all rendering is JSX text, which React escapes); restrict image URLs to `http(s)` only.
- Auth flows: review synthesized-email sign-up (collision risk, password reset implications); stop passing raw Supabase error messages to the UI; propose serverless proxy for auth/listing rate limiting.
- `is_admin()` RPC / admin SQL: audit for security-definer correctness and caller validation.
- Audit `?id=eq.${databaseId}` PostgREST filter interpolations for injection risk.
- Security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) via `vercel.json` (none exists yet).
- Repo hygiene: remove committed `dist/`, flatten/document the nested nesting, verify Vercel build settings after any move (ask before moving).
- Secrets/tokens/allowlists are config, not constants.
- **Self-review posture**: when presenting the plan and every completed step, briefly note any security/data-integrity risk in the work itself (OWASP API Security Top 10 as reference frame) and how the step addresses it — and explicitly flag anything NOT being handled.

## Premium design direction (mandatory for all UI work)

Keep the space/gaming identity (Nyx mascot, dark hero, category structure) but execute with restraint and craft:

- Design tokens first (CSS custom properties): palette, 4/8px spacing scale, type scale, radii, shadows, transition durations. Refactor scattered CSS files (`styles.css`, `theme.css`, `compare.css`, `comparison.css`, `safety.css`, `delete.css`, `nyx-qa.css`) to consume tokens. Light/dark both derive from the same tokens.
- Typography: one display face + one workhorse face, self-hosted/Google Fonts with fallbacks + `font-display: swap`. Consistent h1–h4 scale. Tabular figures for prices.
- Color: restrained palette, ONE saturated accent, semantic success/warning/danger. WCAG AA in both themes.
- Depth: 2–3 shadow levels max, 1px low-alpha borders, generous whitespace, consistent soft radii. Restrained glassmorphism on overlays only, never text-dense surfaces.
- Motion: 150–250ms ease-out micro-interactions only; tone down/remove gimmicky animation (current `nyx-bob`/`nyx-spark`/card wobble should be reviewed); respect `prefers-reduced-motion`.
- Product cards & detail view: consistent image aspect ratio + `object-fit: cover` + graceful broken-image fallback; price prominence; condition/status as refined badges; subtle hover lift. Detail popup → proper focus-trapped, ESC-closable, scroll-locked modal/sheet (currently a plain `.overlay` div — no focus trap, no ESC handling, no scroll lock).
- Component consistency: one button system, one input style with visible focus rings + inline validation, one badge/chip style, one modal pattern.
- Empty/loading/error states: on-brand, never blank divs or raw error strings.
- Finishing details: custom favicon + og-image, no layout shift on image load, polished 404, selection color matching accent, crisp at 375/768/1440px.
- Benchmark: Linear/Vercel/premium storefront fit-and-finish — judged by restraint, not effect count.
- **Process**: present the token set + ONE redesigned reference screen (home + product card + detail modal) as a plan step for approval before rolling out screen by screen.

## Testing standard

No test setup exists yet — must be proposed as its own plan step before writing tests. Preferred stack: Vitest (unit/integration, natural Vite fit) + Playwright (E2E of critical flows) + plain fetch-based integration tests against Supabase with the anon key for RLS verification. Wire into a single `pnpm test` command. Critical scenarios: RLS enforcement (anon read-only, cross-user delete rejected, admin allowed), sign-up/sign-in happy+failure paths, listing create/delete, malformed payload rejection, XSS payloads rendered inert, image URL scheme restriction.

## Working method (mandatory)

- First deliverable is a PLAN, not code. Ask the user for anything unreadable directly (live `pg_policies` output, Supabase dashboard settings, Vercel project config, confirmation on Nyx's AI provider usage).
- Wait for plan approval before writing any code.
- Execute ONE step at a time: implement → test immediately → fix failures now (not deferred) → present with actual test output → STOP and wait for go-ahead. Never batch steps.
- If a fix requires expanding scope beyond the approved step, stop and ask instead of quietly expanding.
- If reality differs from assumptions (schemas, live policies, Vercel config, Nyx internals), STOP and ask.
- Deployments and git pushes require explicit approval each time — propose exactly what/where/which commands, then wait. Report outcome verbatim afterward.
- Commit messages: conventional, scoped, no AI attribution of any kind (no "AI-assisted", "Co-Authored-By: Claude", robot emojis, etc.) — commits read as normal engineering work.
- Update PLAN.md, WORKLOG.md, and ASSUMPTIONS.md as part of every step — a step isn't done until state files reflect it.

## Session start ritual

Read FEATURE-BRIEF.md, PLAN.md (find first non-done step), ASSUMPTIONS.md (check OPEN items), and the last WORKLOG.md entry. State in one short paragraph: what's done, what's next, any blockers. Continue without waiting for re-explanation. A bare "continue" message is the cue to run this ritual.

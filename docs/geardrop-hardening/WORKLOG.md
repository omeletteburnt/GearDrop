# Worklog (append-only)

## 2026-09-16 — Session 1

**Step worked on:** Phase 0 (continuity setup + initial exploration/findings).

**What changed (files):**
- Created `docs/geardrop-hardening/FEATURE-BRIEF.md`, `PLAN.md`, `WORKLOG.md`, `ASSUMPTIONS.md`.
- No app code changed yet.

**Exploration performed:**
- Confirmed nested app path: `2026-09-14/hel/work/GearDrop/`.
- Read `TheKey.env` (contains real `AI_PROVIDER_API_KEY`), `src/supabase.ts`, `src/main.tsx`, `src/data.ts`, `supabase-setup.sql`, `supabase-admin-setup.sql`, `package.json`, `index.html`, root and nested `README.md`.
- Confirmed no `.gitignore` anywhere, `dist/` and `TheKey.env` both tracked.
- Confirmed no `@supabase/supabase-js` dependency, no test tooling, no `vercel.json`.
- Searched `src/` for AI-provider network calls — found none; Nyx assistant logic is entirely local string templates.

**Tests run:** none (no code changes yet).

**Decisions made:**
- Asked user to confirm key rotation before proceeding past planning on secret remediation, per the brief's explicit instruction. User responded: key not yet rotated, will handle "later." Recorded as OPEN in ASSUMPTIONS.md; Phase 1.1/1.2 blocked until resolved.
- Logged 15 severity-rated findings (F1–F15) in PLAN.md, most notably that the committed AI key appears to belong to a feature that was never actually wired up (F12) — needs confirmation before scoping Phase 5 (serverless proxy).

**Failures found / fixed:** none (no implementation yet).

**Next action (superseded, see below):** ~~Present the full plan for approval.~~

---

## 2026-09-16 — Session 1 (continued)

**Step worked on:** Resolving open assumptions (AI key fate, live RLS verification) ahead of formal plan approval.

**What changed (files):**
- `ASSUMPTIONS.md`: resolved key-rotation/AI-key-fate items, resolved RLS live-verification item, added Supabase URL/publishable-key discovery.
- `PLAN.md`: Phase 0 items 0.3/0.4 marked done; Phase 2 items 2.2/2.3 marked done with results; added new item 2.4 (silent no-op delete UX/security gap); dropped Phase 5 entirely (serverless AI proxy) per user decision.
- No app code changed yet — this was live-service verification only, not a code change.

**Tests run / verification performed:**
- Fetched the live deployed bundle (`https://gear-drop-4xza.vercel.app/assets/index-K5ZaqhWI.js`) and grepped for `AI_PROVIDER`/leaked-secret patterns — none found, confirming the key isn't client-exposed. Found the intentionally-public Supabase URL and `sb_publishable_...` key in the same bundle.
- With explicit user approval, ran live anon-key RLS checks against production Supabase via curl:
  - Anon SELECT listings/profiles → 200 (correct).
  - Anon INSERT listing → 401 RLS violation (correct).
  - Anon RPC `is_admin()` → 200 `false` instead of a hard rejection — **drift**: function lacks an explicit `EXECUTE` revoke from `PUBLIC`/`anon`. Not exploitable (always false for anon), but logged as a fix.
  - Signed up two disposable test accounts (`rlstest_temp_a@nyx.local`, `rlstest_temp_b@nyx.local`), created a real listing as A (id=10), confirmed: anon DELETE and cross-user (B) DELETE both returned HTTP 204 but the listing **persisted** (verified by re-reading the row) — RLS correctly filtered both attempts to 0 rows. Owner (A) DELETE then succeeded and the row was actually removed (verified by re-read returning `[]`).

**Failures found / fixed:** One real drift item found (`is_admin()` anon-executable) — not fixed yet, queued for the Phase 1/6 SQL patch step; not fixed inline because SQL/DB changes are implementation work that belongs in an approved, reviewable step, not ad-hoc during audit.

**Decisions made:**
- User confirmed: AI key gets removed entirely, no serverless proxy work (Phase 5 dropped).
- User approved creating disposable test accounts/listing in the live production Supabase for RLS verification.

**Known residual state needing user action:** Test accounts `rlstest_temp_a@nyx.local` / `rlstest_temp_b@nyx.local` (and their profile rows) still exist in production Supabase — this session has no service-role key to delete them. User should remove via Supabase Dashboard → Authentication → Users (cascades to profiles).

**Next action (superseded, see below):** ~~Present updated plan, begin Phase 1.~~

---

## 2026-09-16 — Session 1 (continued) — Phase 1 execution

**Step worked on:** Phase 1 — secret remediation & repo hygiene (user approved "go ahead with Phase 1").

**What changed (files):**
- Added `.gitignore` at repo root: `node_modules/`, `dist/`, `*.env`, `*.env.*` (with `!*.env.example` allowance), `*.tsbuildinfo`, `.DS_Store`, `.idea/`.
- Deleted `2026-09-14/hel/work/GearDrop/TheKey.env` from disk and untracked it (`git rm --cached`).
- Untracked `2026-09-14/hel/work/GearDrop/dist/` (20 files, `git rm -r --cached`); removed the on-disk copy after verifying it rebuilds correctly.
- All changes are in the working tree / git index only — **no commit made** (not asked to commit yet).

**Tests run and results:**
- `corepack prepare pnpm@latest --activate` (pnpm wasn't on PATH) → succeeded.
- `pnpm install` in the app dir → succeeded, lockfile respected, 26 packages.
- `pnpm build` (`tsc --noEmit && vite build`) with `TheKey.env` already deleted → **succeeded**, 21 modules transformed, no type errors, no missing-env warnings. Confirms the app has zero runtime dependency on `AI_PROVIDER_API_KEY`.
- `git check-ignore -v TheKey.env dist node_modules` → confirmed `.gitignore` correctly matches all three going forward.
- `git status --short` before/after → confirms only the intended deletions + two new untracked additions (`.gitignore`, `docs/`), nothing unexpected swept in.

**Failures found / fixed:** None — build was green on the first attempt after removing the secret file.

**Blocked / needs user action:**
1. **Vercel env var removal** — `gear-drop` project is not visible under this session's logged-in Vercel account (`monmargarcia-5863's projects` only shows unrelated projects: secondshot, farming-tracker, parkwise-web, pdf-forge, awsdesk-web, awsdesk-api, parkwise-api). User must remove `AI_PROVIDER_API_KEY` manually via Vercel Dashboard → gear-drop → Settings → Environment Variables.
2. **Key rotation** still not done at the provider (carried over from earlier this session) — user's call on timing, doesn't block this step.
3. **Leftover Supabase test accounts** (`rlstest_temp_a@nyx.local`, `rlstest_temp_b@nyx.local`) from the earlier RLS verification still need manual deletion via Supabase Dashboard.

**Decisions made:** Did not commit these changes yet — waiting for explicit commit approval per the working method. Did not touch the nested-path question (1.4) or the `is_admin()` SQL grant fix (1.6) — both deferred as separate, smaller decisions rather than bundled into this step.

**Self-review note (OWASP-frame):** This step reduces API Security Top 10 risk (API2:2023 Broken Authentication / secrets exposure) by removing a leaked credential from the tracked tree and preventing recurrence via `.gitignore`. **Explicitly not handled yet**: the key is still live at the provider (rotation pending — real exposure window remains open until the user rotates it), the git *history* still contains the plaintext key (recommendation-only per the brief), and the Vercel env var itself is still set (can't reach it from this session).

**Next action (superseded, see below):** ~~Ask about commit + nested path.~~

---

## 2026-09-16 — Session 1 (continued) — nested path decision + commit deferral

**What changed (files):**
- `README.md` (repo root): added a pointer note at the top linking to `2026-09-14/hel/work/GearDrop/` (where the real app lives) and to `docs/geardrop-hardening/`.

**Decisions made:**
- User: **do not commit Phase 1 changes yet** — left as working-tree/staged state for now.
- User: **leave the nested path as-is**, just document it (not flattened to repo root). No Vercel root-directory change needed since nothing moved.

**Tests run:** none needed (doc-only change).

**Current uncommitted state:** `.gitignore` (new), `TheKey.env` (deleted, staged), `dist/` (untracked, staged deletion of 20 files), `README.md` (modified), `docs/` (new, untracked). All still awaiting a commit-approval ask.

**Next action (superseded, see below):** ~~ask which to prioritize next~~ — user picked the `is_admin()` fix.

---

## 2026-09-16 — Session 1 (continued) — is_admin() grant fix

**Step worked on:** 1.6 — `is_admin()` anon-executable drift.

**What changed (files):**
- `2026-09-14/hel/work/GearDrop/supabase-admin-setup.sql`: added `revoke execute on function public.is_admin() from public, anon;` immediately after the function definition and before `grant execute ... to authenticated;`.

**Tests run:** None yet — this is a DB grant, and this session only has the public anon key, not service-role/DDL access. Cannot execute the revoke myself.

**Decisions made / blocker:** Gave the user the single SQL line to run manually in the Supabase SQL editor against the live project. Did not ask them to re-run the whole `supabase-admin-setup.sql` file since the table/function/policy already exist live — only the new revoke line is needed.

**Next action (superseded, see below):** ~~waiting on user~~ — user ran it and confirmed.

---

## 2026-09-16 — Session 1 (continued) — is_admin() fix verified, service_role key note

**What changed (files):** None (verification only).

**Tests run and results:**
- Re-ran `POST /rest/v1/rpc/is_admin` with the anon/publishable key: now returns `401 {"code":"42501","message":"permission denied for function is_admin"}` (previously `200 false`). **Fix confirmed live.** Item 1.6 closed.

**Notable event — service_role key handling:** User initially offered to share the Supabase `service_role` secret key so I could run the DDL directly. I accepted and received it in chat, then attempted to use it via a `curl` call — this was blocked by the harness's auto-mode permission classifier before execution (it never ran). On reflection, this wouldn't have worked anyway: PostgREST doesn't expose raw SQL/DDL execution even with service_role (no `exec_sql`-style RPC exists in this project, confirmed via a 404 probe with the anon key), so actually running `REVOKE` requires either the Supabase SQL editor or a genuine Postgres connection string, not a service-role JWT. Advised the user to run the statement themselves (which they did) and to consider rotating the service_role key since it was typed into the session. **The service_role key was never written to any file, command output that got persisted to disk, or repo content in this session** — it appeared only in the user's own chat message and my one blocked tool-call attempt.

**Decisions made:** None new — closing out this sub-item.

**Self-review note (OWASP-frame):** This closes an API5:2023 (Broken Function Level Authorization) gap — `is_admin()` no longer discloses admin-check behavior to unauthenticated callers. **Not handled**: whether the `service_role` key the user pasted into this chat should be rotated is still open — flagging it explicitly rather than assuming they will.

**Next action (superseded, see below):** ~~ready for Phase 3 or Phase 7~~ — user picked Phase 3.

---

## 2026-09-16 — Session 1 (continued) — Phase 3: session & auth hardening

**Step worked on:** Phase 3 (3.1 supabase-js migration, 3.2 error message hardening + silent-delete fix, 3.3 synthesized-email review).

**What changed (files):**
- `2026-09-14/hel/work/GearDrop/package.json`, `pnpm-lock.yaml`: added `@supabase/supabase-js@2.116.0`.
- `2026-09-14/hel/work/GearDrop/src/supabase.ts`: full rewrite — `createClient()`-based client replaces hand-rolled `fetch`; `getSession()` now async; new `onSessionChange()` subscription helper; `signOut`/`saveListing`/`deleteListing`/`isAdmin` no longer take a `session` argument; added `friendlyAuthError()` mapping; `deleteListing` now uses `{count:"exact"}` and throws when 0 rows affected instead of silently "succeeding."
- `2026-09-14/hel/work/GearDrop/src/main.tsx`: updated all call sites to match (async session load via `useEffect`, subscription to `onSessionChange`, dropped `session` args from the four calls above).
- All changes uncommitted (working tree only), consistent with earlier "not yet" on committing.

**Tests run and results:**
- `pnpm build` (`tsc --noEmit && vite build`) → clean, 64 modules, no type errors.
- Live functional smoke test (temporary Node script, deleted after use, never committed) against production Supabase using a new disposable account `rlstest_temp_c@nyx.local`:
  - signUp → session returned, no error.
  - profile upsert → success.
  - listing insert → success (id 11).
  - `is_admin()` RPC as authenticated non-admin → `false`, no error (confirms the 1.6 fix didn't overtighten and break the intended `authenticated` grant).
  - signOut, then delete attempt on the test listing → `count: 0`, no error at the Postgres layer — confirms the `deleteListing()` wrapper's `if (!count) throw` branch is what turns this into a real error for the caller.
  - sign back in, delete same listing (owner) → `count: 1`, succeeds — listing actually removed.
  - sign-in with wrong password → raw error `"Invalid login credentials"` confirmed mapped by `friendlyAuthError()` to `"Incorrect username or password."`.
  - Test listing was cleaned up as part of the test (deleted by its owner in the last delete call); the `rlstest_temp_c` account/profile itself was not (no delete policy, no service-role access) — added to ASSUMPTIONS.md alongside the other two leftover test accounts.

**Failures found / fixed:** None — the migration built and passed the smoke test on the first full run.

**Decisions made:** Folded the previously-separate item 2.4 (silent no-op delete) into this step's `deleteListing()` rewrite since it's the same function being touched anyway — not scope creep, just avoiding touching the same code twice. Documented (not built) the password-reset gap and the username-normalization collision behavior for 3.3 rather than changing product behavior, since both are product decisions outside a hardening pass's authority to unilaterally change.

**Next action (superseded, see below):** ~~awaiting direction~~ — user picked Phase 7.

---

## 2026-09-16 — Session 1 (continued) — Phase 7: test tooling setup

**Step worked on:** Phase 7 (Vitest + Playwright setup, `pnpm test` wiring).

**What changed (files):**
- `2026-09-14/hel/work/GearDrop/package.json`, `pnpm-lock.yaml`: added `vitest@5.0.1`, `@playwright/test@1.63.0` as devDependencies; added `test:unit`, `test:e2e`, `test` scripts.
- New: `vitest.config.ts`, `playwright.config.ts`, `tests/unit/rank.test.ts`, `tests/integration/rls.test.ts`, `tests/e2e/smoke.spec.ts`, `.env.example` (tracked), `.env.local` (gitignored, populated with the already-public Supabase URL/publishable key).
- `src/recommend.ts` (new): extracted `rank()` out of `main.tsx` so it's unit-testable without triggering `main.tsx`'s top-level `createRoot().render()` DOM side effect. `main.tsx` updated to import `rank` from it instead of defining it inline.
- `src/supabase.ts`: fixed a real bug (see below) — `createClient()` now falls back to a placeholder URL/key instead of throwing when env vars are unset.
- All still uncommitted (working tree only).

**Tests run and results:**
- `pnpm build` → clean, 65 modules.
- `pnpm test:unit` (vitest) → first run: 4 of 9 failed. Root cause: the RLS integration test reused one shared `anon` Supabase client for both account setup (`signUp`) and the "genuinely anonymous" assertions — `signUp` persists a session on the client it's called on, so later "anon" calls were actually authenticated as the just-created test user, making anon-INSERT/anon-DELETE/anon-RPC checks pass for the wrong reason (or fail the assertion since they weren't actually anonymous). Fixed by using a separate throwaway client for every account-setup call, keeping the shared `anon` client genuinely unauthenticated throughout. Re-run: 9/9 passed (3 unit, 6 integration).
- `pnpm test:e2e` (playwright): needed `npx playwright install chromium` first (browser binary wasn't present). First run failed for two reasons, both fixed in this step: (1) `playwright.config.ts`'s `pnpm dev -- --port 4173` didn't actually pass the port through to vite (pnpm/vite arg-forwarding quirk) — switched to `pnpm exec vite --port 4173`; (2) with the dev server actually starting, the page crashed with `Error: supabaseUrl is required` — this is a **real regression from the Phase 3 migration**, not a test artifact: `createClient(url ?? "", key ?? "")` throws synchronously on empty strings, so any environment without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set (this local/CI environment had none) crashes the whole app at import time, whereas the old hand-rolled client degraded gracefully. Fixed in `src/supabase.ts` by falling back to a placeholder URL/key so client construction never throws — real network calls against the placeholder just fail and are caught by existing try/catch call sites, same as before. Re-run after both fixes: 1/1 passed.
- `pnpm test` (single chained command, `test:unit && test:e2e`) → full green run: 9 Vitest + 1 Playwright, all passing.
- `pnpm build` re-verified clean after all changes.

**Failures found / fixed (root cause, one line each):**
1. Integration test false failures — shared Supabase client leaked an authenticated session into "anonymous" assertions — fixed by using dedicated setup clients.
2. Playwright webServer never started listening on the configured port — `pnpm <script> -- <args>` doesn't forward args as expected through this pnpm/vite combination — fixed by invoking `vite` directly via `pnpm exec`.
3. **App-crashing regression**: `createClient()` throws on empty URL/key, unlike the previous hand-rolled client — fixed with a placeholder-URL fallback in `src/supabase.ts`.

**Decisions made:** Deferred full critical-flow E2E coverage (browse→detail→compare; sign-up→create→delete) to Phase 11 rather than writing it now, since the DOM structure those tests would target is about to be rewritten in the Phase 8/9 design rollout — writing full E2E against markup that's getting replaced would mean doing the work twice. Phase 7 ships one baseline E2E smoke test proving the harness itself (dev server boot + page render) works.

**Known unresolved limitation (flagged, not solved):** `tests/integration/rls.test.ts` creates 2 new disposable Supabase Auth users in the **live production database** every time it runs, since no staging Supabase project exists and this session has deliberately avoided using a service-role key for cleanup. Fine for the occasional manual run done during this audit, but this suite is **not safe to wire into CI as-is** — added to ASSUMPTIONS.md as an open item needing a user decision (separate staging project, or a CI-secret-only service-role key).

**Self-review (OWASP-frame):** This step doesn't reduce API-security risk directly, but it now makes every earlier ad-hoc verification (RLS behavior, the `is_admin()` fix) into a repeatable regression test — meaning a future step that accidentally reverts the grant fix or breaks delete permissions gets caught automatically instead of silently. It also caught a genuine app-breaking bug (`createClient` throwing on missing env vars) that manual `pnpm build`/`tsc` checks alone had missed, since TypeScript type-checking doesn't catch a runtime throw on valid-but-empty strings. **Not handled**: no CI workflow file exists yet (tests run manually only); the production-database test-account accumulation problem above remains open.

**Next action (superseded, see below):** ~~awaiting direction~~ — user picked Phase 6.

---

## 2026-09-16 — Session 1 (continued) — Phase 6: security headers

**Step worked on:** Phase 6 (`vercel.json` with CSP + security headers).

**What changed (files):**
- New `2026-09-14/hel/work/GearDrop/vercel.json`: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS. Full policy text and rationale in PLAN.md Phase 6.

**Tests run and results:**
- `pnpm build` clean, JSON-validated `vercel.json` syntax.
- Wrote a throwaway local Node static server (deleted after use, never committed) that serves `dist/` with the exact header set from `vercel.json`, then loaded it in headless Chromium via the app's installed Playwright and inspected the console.
  - **First run found a real conflict**: CSP blocked the app's existing Google Fonts `@import` in `src/styles.css` (Space Grotesk / DM Mono) — this font load predates this session's work and hadn't come up in earlier file reads. Fixed by adding `fonts.googleapis.com`/`fonts.gstatic.com` to `style-src`/`font-src`.
  - Re-run: zero CSP violations, hero renders, all in-scope images decode.
  - Two unrelated issues surfaced (not CSP-caused): `cdn.iset.io`'s demo image genuinely 403s (pre-existing broken data, confirmed independent of CSP via a direct `curl -I`); and a leftover **production** row (`id=12`, `name: "should-not-insert"`, `image: "http://x"`) that turns out to be pollution from the Phase 7 integration-test bug (a transiently-authenticated "anon" client legitimately created it under real user permissions before the isolation bug was fixed — not an RLS failure, just test debris now visible on the live listings feed).

**Failures found / fixed:** CSP/Google-Fonts conflict — fixed by widening `style-src`/`font-src` to the two required Google Fonts domains, verified via re-run.

**Decisions made:** Kept `img-src` broad (`'self' https:`) rather than a fixed domain allowlist, since the product intentionally uses many external image hosts and the README states more are expected — documented as a deliberate trade-off, not an oversight.

**Known unresolved items (added to ASSUMPTIONS.md):**
- Live listing `id=12` ("should-not-insert") needs manual deletion via Supabase Table Editor — I don't have credentials for that specific historical test session and won't reuse the previously-shared service-role key.
- Headers verified only against a local simulation using identical header values — not yet checked against the actual live Vercel deployment (`curl -I` against the real URL) since no deploy has happened this session.

**Self-review (OWASP-frame):** Closes an API8:2023 Security Misconfiguration gap — the site shipped zero defensive headers before this. **Not handled**: real-deployment header verification (pending a deploy), and the `img-src https:` breadth is a conscious trade-off against a full domain allowlist, not fully "locked down."

**Next action (superseded, see below):** ~~awaiting direction~~ — user picked Phase 4.

---

## 2026-09-16 — Session 1 (continued) — Phase 4: input validation & XSS hardening

**Step worked on:** Phase 4 (4.1 client-side validation, 4.2 image URL scheme + broken-image fallback, 4.3 markup-injection sweep).

**What changed (files):**
- New `2026-09-14/hel/work/GearDrop/src/validation.ts`: `validateListing()` (mirrors DB check constraints) and `safeImageUrl()` (http/https-only allowlist with placeholder fallback).
- New `2026-09-14/hel/work/GearDrop/public/placeholder-product.svg`: minimal fallback image (full visual polish deferred to Phase 9).
- `src/main.tsx`: `Sell`'s `submit()` now validates via `validateListing()` before calling `saveListing()`, showing a toast on rejection; every listing-derived `<img>` (`Card`, `Recommendation`, `Detail`, compare table) now goes through `safeImageUrl()` plus a shared `onImgError` fallback handler. Hero gallery images (fixed local demo data) intentionally left unwrapped.
- New `tests/unit/validation.test.ts` (11 cases) and new `tests/e2e/xss.spec.ts` (live XSS-payload rendering check).
- All still uncommitted (working tree only).

**Tests run and results:**
- `pnpm build` → clean, 66 modules.
- `pnpm test` (full chained command) → 20 Vitest tests (unit + integration) + 2 Playwright tests, all green.
- The new `xss.spec.ts` is a genuine live-browser proof, not a theoretical claim: it creates a disposable Supabase test account, inserts a real listing via the API with a `<script>` tag in the name and an `onerror`-handler `<img>` in the description, loads the actual page in headless Chromium, and confirms (a) the injected `window.__xssFired` flag was never set, (b) no JS dialog fired, (c) the payload text renders visibly as literal escaped text. Passed on first run — confirms React's JSX text-escaping actually holds in this app, not just in principle.

**Failures found / fixed:** None this step — both new test files passed on the first full run.

**Decisions made:** Kept the validation-error UI as a toast rather than building inline per-field error states now, per the original plan note that visual polish belongs in Phase 9's component-system rollout — this step's job was closing the "invalid data reaches the network" gap, not the final look. Applied `safeImageUrl` defensively across all DB-sourced image renders even though no UI field currently lets a seller set an arbitrary image URL — noted explicitly as hardening a not-yet-reachable path, not closing an active vulnerability, so it doesn't get miscounted as a real finding fixed.

**Known housekeeping:** another disposable test account (`rlstest_xss_<timestamp>@nyx.local`) is created every time `tests/e2e/xss.spec.ts` runs — same accumulation issue already flagged in Phase 7/ASSUMPTIONS.md, not a new category of problem, just another instance of it.

**Self-review (OWASP-frame):** Adds early rejection of malformed input and a live-verified XSS defense. **Not handled**: no DB-level `CHECK` constraint mirrors the new client-side validation, so the real enforcement boundary is still (correctly, defense-in-depth-wise) the database — client validation is a UX improvement and a defense layer, not the security boundary itself; inline visual error states remain deferred to Phase 9.

**Next action (superseded, see below):** ~~awaiting direction~~ — user picked Phase 8, then approved and asked for Phase 9 rollout.

---

## 2026-09-16 — Session 1 (continued) — Phase 8: design tokens + reference screen (approval gate)

**Step worked on:** Phase 8 — present a token set and one reference screen for approval before any live-app UI changes.

**What changed (files):** None in the app repo. Built and published a standalone HTML artifact ("Salvage Terminal") at a scratch path, not part of the GearDrop repo, showing: color/type/spacing/shadow tokens, a button/input/badge component preview, and a reference screen (home hero + product grid + detail sheet) built with GearDrop's own real listing data (Logitech G Pro X, HyperX Cloud II, etc.) and a light/dark toggle.

**Design direction:** kept Space Grotesk (already the app's live display face, found during Phase 6's CSP work) rather than replacing it; added Manrope for body/UI text; promoted DM Mono (already imported but underused) into a real structural device — inventory-style tags and prices rather than incidental numerals. One accent (brass/amber) standing in for a resale price-tag motif, on indigo-biased neutrals — deliberately steered away from the generic "near-black + neon accent + Space-Grotesk-as-safe-choice" cluster flagged as an AI-design cliché, by grounding the accent and the tag-shaped badges in the actual second-hand-marketplace subject matter.

**Verification/process:** Embedded all reference images as base64 data URIs after the first publish attempt warned about blocked external image requests (the artifact CSP doesn't allow arbitrary external hosts) — re-published clean.

**Decisions made:** User approved the proposal as presented, with no requested changes, and gave forward approval for the Phase 9 rollout in the same message.

**Next action:** Begin Phase 9 rollout, screen by screen, starting with the token/component foundation (9.1).

---

## 2026-09-16 — Session 1 (continued) — Phase 9.1: design tokens + component system rollout into the live app

**Step worked on:** Phase 9.1 — bring the approved token system into the actual codebase and establish the shared button/badge component classes; explicitly NOT 9.2 (modal/sheet behavior rebuild), which is a separate markup+JS step.

**What changed (files):**
- New `2026-09-14/hel/work/GearDrop/src/tokens.css`: the approved palette/type/spacing/shadow/motion tokens as CSS custom properties, light-default with `prefers-color-scheme`/`[data-theme]` dark overrides (matching the app's existing `data-theme` toggle mechanism), plus shared `.btn`, `.tag-badge`, `.field-error` component classes and a global `prefers-reduced-motion` rule.
- Rewrote `styles.css`, `theme.css`, `compare.css`, `safety.css`, `delete.css` to consume the tokens instead of hardcoded hex values, keeping existing class names/DOM hooks except where the new component system needed a class added.
- Deleted `comparison.css` and `nyx-qa.css` — confirmed dead (never imported anywhere, verified by grep) before deleting.
- `main.tsx`: imports `tokens.css`; wired `.btn`/variant classes onto real buttons (nav, Sell/Auth submit, Detail actions, DeleteConfirm, compare-section); product status now renders as a color-coded `.tag-badge` instead of plain text; card price restyled to brass/mono/tabular; hero gallery images now show brass price-tag overlays (the one new visual element beyond restyling, matching the approved reference), routed through the existing `safeImageUrl`/`onImgError` guards from Phase 4.

**Tests run and results:**
- `pnpm build` clean, 67 modules.
- Booted the real dev server and used Playwright to take actual screenshots (not just trust the CSS compiled) at 1440px light, 1440px dark, and 375px mobile, plus opened a real detail overlay.
- **Found and fixed a real bug this way**: the modal close button was nearly invisible in dark mode (a light-tinted transparent background against a dark panel). Fixed to a bordered circle matching the existing theme-toggle button pattern; re-screenshotted to confirm the fix.
- Screenshots incidentally reconfirmed two things from earlier phases still holding under the new styles: the broken `cdn.iset.io` image degrades to the placeholder gracefully (Phase 4), and the still-undeleted `should-not-insert` test row (Phase 6/7 debris) renders its content inertly (Phase 4's XSS work).
- Full `pnpm test`: 20 Vitest + 2 Playwright, all green — confirms the CSS-only + button-wiring changes didn't regress app behavior.

**Failures found / fixed:** The dark-mode close-button contrast bug above — root cause: a hardcoded `rgba(0,0,0,.06)` background that only reads as a background on a light surface, never swapped per-theme, unlike everything else which was already token-driven.

**Decisions made:** Scoped this step to CSS + component-class wiring only, explicitly not touching modal behavior (focus trap/ESC/scroll-lock — real accessibility gaps, not just visual) — that's 9.2, a distinct kind of change (markup + JS, not CSS), kept separate so each step stays reviewable in one sitting per the working method.

**Self-review (OWASP-frame):** Primarily visual/UX work; the relevant risk is regression, checked via full test suite + actual rendered screenshots rather than a type-check alone. **Not handled yet**: formal accessibility contrast audit (planned 9.5); modal focus-trap/ESC/scroll-lock (planned 9.2) — the current overlay is visually improved but has the same interaction gaps as before this step.

**Next action (superseded, see below):** ~~check in first~~ — user said "yes, continue with 9.2" then "just continue all throughout," authorizing continuous execution through the rest of Phase 9 without a stop-and-ask after every sub-item.

---

## 2026-09-16 — Session 1 (continued) — Phase 9.2–9.5: modal accessibility, empty/loading states, finishing details

**Step worked on:** Phase 9.2 (modal/sheet a11y rebuild), 9.3 (card polish — mostly already done), 9.4 (empty/loading states), 9.5 (favicon/OG image/responsive/accessibility audit). Executed continuously per user direction, testing at each stage.

**What changed (files):**
- `main.tsx`: added shared `useModalA11y()` hook (focus trap, Escape-to-close, body-scroll-lock, focus restore) and `overlayClick()` backdrop-click helper; applied to Detail, Sell, Auth, DeleteConfirm. Detail's root element changed from `<article>` to `<div>` (ARIA fix, see below); Sell/Auth restructured from `<form role="dialog">` to `<div role="dialog"><form>...</form></div>` (same ARIA fix). Added a loading-skeleton branch and an empty-state branch to the listing grid render, backed by a new `listingsLoading` state tied to the existing `loadListings()` effect.
- `styles.css`: added `.card-skeleton` shimmer, fixed `.empty` to span the full grid width, restyled `.close` (dark-mode contrast fix carried from 9.1's own screenshot check), restyled `.detail` as a fixed right-side sheet with slide-in animation and a mobile full-screen breakpoint, added `.nyx-wave` styling (see bug below), added light-surface `.eyebrow`/`.example` overrides and swapped several text-color usages from `--brass` to the new `--brass-ink`.
- `tokens.css`: split the single `--brass` token into three (`--brass` fill, `--brass-strong` lighter hover-fill, `--brass-ink` text-on-light) after discovering no single value could pass AA in both roles; darkened light-theme `--ok`/`--warn`/`--bad` after discovering they failed AA against their own soft backgrounds.
- `compare.css`, `safety.css`: matching `--brass` → `--brass-ink` swaps for text-on-light usages (compare-head price span, back-market link).
- `index.html`: added favicon link, `theme-color`, and full OG/Twitter meta tags.
- New `public/favicon.svg` (brass geometric mark) and `public/og-image.png` (1200×630, real generated image — built by screenshotting a small standalone branded HTML page via Playwright, not a placeholder).
- Added `@axe-core/playwright` devDependency.
- New test files: `tests/e2e/modal.spec.ts` (2 cases — scroll-lock/focus-trap/Escape, backdrop-click), `tests/e2e/a11y.spec.ts` (4 cases — home light/dark, detail sheet dark, auth dialog light).

**Tests run and results:**
- `pnpm build` clean throughout every iteration.
- Real Playwright runs (not just type-checks) verified: body scroll lock toggles correctly, focus moves into the dialog on open and is restored on close, Escape and backdrop-click both close it, the mobile sheet is genuinely full-viewport.
- Screenshotted the real running app at 1440/768/375px in both themes plus an open detail sheet — caught a real dark-mode contrast bug in the close button this way (documented under 9.1, held up on re-check here).
- Ran the new axe accessibility suite against the live app — **found and fixed four real, previously-unnoticed bugs**, not test artifacts:
  1. `.nyx-wave` had zero CSS after being accidentally dropped in the 9.1 rewrite — white-on-near-white text (1.05:1 contrast).
  2. `role="dialog"` on `<article>`/`<form>` is invalid ARIA (native semantics block the override) — fixed via `<div>` wrappers.
  3. The single `--brass` token could not pass AA as both a button-fill (paired with fixed dark text) and standalone text-on-white — these have opposite lightness requirements. Split into `--brass`/`--brass-strong`/`--brass-ink`, verified against actual computed contrast ratios via a small Python script (not guessed) before and after.
  4. All three semantic colors (`--ok`/`--warn`/`--bad`) failed AA against their own tinted `-soft` backgrounds in light theme — darkened all three, re-verified computationally and then via axe.
  - One flake was in the *test*, not the app: axe initially sampled colors mid-CSS-transition (220ms fade/scale-in), producing blended interpolated values that looked like failures — fixed by waiting for the transition to settle before running axe, confirmed stable across two full re-runs.
- Final full `pnpm test`: 20 Vitest + 8 Playwright (28 total), all green, re-run twice for stability.

**Failures found / fixed (root cause, one line each):**
1. `.nyx-wave` contrast — CSS rule accidentally deleted during the 9.1 file rewrite without a replacement.
2. Invalid `role="dialog"` on article/form — native ARIA semantics for those elements block role override; needed a generic wrapper.
3. `--brass` single-token contrast failure — one hex value can't satisfy both "fill behind fixed dark text" and "text directly on a light background" at once; needed two distinct tokens.
4. Semantic soft-background contrast failure — original `--ok`/`--warn`/`--bad` picks were tuned by eye for hue, not verified against the actual composited background they'd render on.

**Decisions made:** Restructured Detail into a genuine right-side sheet per the approved reference (full-screen below 640px); kept Sell/Auth/DeleteConfirm as centered dialogs, matching what the brief actually specified (only Detail was called out as needing the sheet treatment). Used computed contrast-ratio math (not visual guessing) to pick every replacement color, verifying against the *actual* rendered background colors rather than assuming pure white/black.

**Self-review (OWASP-frame):** This phase fixed real accessibility defects (keyboard trap, WCAG contrast) rather than pure cosmetics — a keyboard-only or low-vision user genuinely could not have used the modals or read some text reliably before this. The token-splitting bug is exactly the kind of regression a design system exists to prevent, and it only surfaced via automated axe testing, not the earlier manual screenshot review — reinforcing that "look at it" alone isn't sufficient verification for contrast work going forward. **Not handled**: no CI wiring runs the test suite automatically; the axe audit covers home + 2 dialogs, not the Sell form or compare workspace independently (lower risk since they reuse the same fixed tokens, but not directly verified).

**Next action (superseded, see below):** ~~continue to Phase 10/11~~ — done below.

---

## 2026-09-16 — Session 1 (continued) — Phase 10 & 11: UX/performance, keyboard a11y, full critical-flow E2E

**Step worked on:** Phase 10 (query tuning, keyboard accessibility) and Phase 11 (critical-flow E2E tests), executed together per continued "just continue all throughout" direction.

**What changed (files):**
- `src/supabase.ts`: added `.limit(200)` to `loadListings()` as a defensive query cap (explicit column selection was already done in Phase 3; full pagination UI judged as over-engineering at the current data scale and not built).
- `src/main.tsx`: `Card` component fixed for keyboard accessibility — was `onClick`-only with no way to reach or activate it via keyboard. Added `tabIndex={0}`, `role="button"`, a descriptive `aria-label`, `onKeyDown` for Enter/Space. Hit the same restricted-ARIA issue as Phase 9.2 (`role="button"` invalid on `<article>`) — changed root element to `<div>`.
- `src/styles.css`: added a visible brass focus ring for `.card:focus-visible`.
- New `tests/e2e/critical-flows.spec.ts` (2 tests): the two flows named explicitly in the original testing-standard brief, run through real UI interaction rather than API shortcuts.

**Tests run and results:**
- `pnpm build` clean.
- New critical-flow tests: **first run caught a real test-authoring bug**, not an app bug — the "create listing" test hung because the Sell form's `window.confirm()` (shown when the optional "Key specifications" field is left blank) was being auto-dismissed by Playwright's default dialog handling, silently blocking submission. Fixed by filling that field in the test rather than adding dialog-handling machinery, since a filled field is the realistic user path anyway.
- After that fix, re-ran the full suite: caught the *same* invalid-ARIA-role class of bug found in 9.2 (`role="button"` not allowed on `<article>`) via the axe suite going red again after the Card change — fixed the same way (swap to `<div>`), confirmed fixed by rerunning axe.
- Final full `pnpm test`: **20 Vitest + 10 Playwright = 30 tests**, all green, re-run twice for stability.

**Failures found / fixed (root cause, one line each):**
1. Test hang on Sell-form submission — Playwright's default `window.confirm()` auto-dismissal silently blocked a code path the test didn't anticipate; fixed by filling the field that avoids triggering the confirm.
2. Invalid ARIA role on the newly-keyboard-accessible card — same native-element-semantics restriction as Phase 9.2, same fix (generic `<div>` instead of a sectioning element).

**Decisions made:** Did not build a pagination UI (page controls/infinite scroll) — judged as building for a scale the app doesn't have yet (~22-30 listings); a query-level `.limit()` is the proportionate fix per the "don't design for hypothetical future requirements" principle. Both critical-flow tests intentionally exercise the real UI (real form fills, real button clicks) rather than calling `saveListing()`/`signUp()` directly, since the whole point of this phase is coverage of the user-facing flow, not just the underlying API calls (already covered by the Phase 7 integration suite).

**Self-review (OWASP-frame):** The keyboard-accessibility fix is a genuine defect fix (WCAG 2.1.1 keyboard operability), not polish — found by manual review since automated axe doesn't check operability, only markup/contrast, illustrating why layering test types (unit/integration/E2E/manual-informed) matters rather than trusting one tool. **Not handled**: the growing pile of disposable test accounts in production Supabase (now 4 created per full suite run: 2 from RLS integration, 1 from XSS, 1 from the new critical-flow signup) remains unresolved — flagged repeatedly since Phase 7, still needs a user decision (staging project vs. CI-scoped service-role key) before any CI automation.

**Current overall status:** All 11 plan phases are now complete except items that were always scoped as "recommend, don't execute" (git-history scrub) or that depend on the user (key rotation, Vercel env var removal, service_role key rotation, test-account cleanup, CI wiring decision). Nothing has been committed or deployed yet — all work remains in the working tree pending explicit approval for either action.

**Next action (superseded, see below):** ~~await commit decision~~ — user said "yes, commit it."

---

## 2026-09-16 — Session 1 (continued) — Committed

**What changed:** Reviewed `git status` after `git add -A` to confirm no secrets were staged (only `.env.example` with placeholder values; `TheKey.env` deletion staged as expected; `.env.local` correctly stayed untracked per `.gitignore`). Committed all 59 changed files in a single commit (`092b73c`, "Harden security, migrate auth stack, and roll out premium design system") on `main`, with a conventional-style message summarizing security/design/testing/hygiene changes. No AI attribution in the message, per the working method. **Not pushed** — this was a local commit only; pushing to the remote requires a separate explicit ask.

**Working tree is now clean.**

**Next action (superseded, see below):** ~~awaiting push decision~~ — user said "push it."

---

## 2026-09-16 — Session 1 (continued) — Pushed to origin/main

**What happened:**
- First push attempt failed: this environment's git/`gh` credentials were authenticated as `monmargarcia`, who has no write access to `omeletteburnt/GearDrop`. User re-authenticated `gh` as `omeletteburnt`, but `git` was still using a stale cached credential via the `osxkeychain` credential helper (separate from `gh`'s own token store) — worked around this **without changing any global git config** by overriding `credential.helper` for single commands only (`git -c credential.helper= -c credential.helper="!gh auth git-credential" ...`).
- Second push attempt failed for a different, legitimate reason: `origin/main` had 2 commits this session didn't have — someone had pushed directly to GitHub: `2b3e42e` ("Add files via upload", touching `notes.docx`) and `65b5a27` ("Delete 2026-09-14/hel/work/GearDrop/TheKey.env" — **the user manually deleted the leaked secret file directly on GitHub**, independent of and consistent with this session's own Phase 1 work).
- Fetched and inspected the diff before doing anything (per the git-safety protocol) — both remote commits were compatible with local work, no actual conflict in intent. Ran `git pull --rebase origin main` — rebased cleanly, no conflicts.
- **Re-ran the full verification after the rebase** rather than assuming a clean rebase meant nothing broke: `pnpm build` clean, `pnpm test` → 20 Vitest + 10 Playwright, all green.
- Pushed successfully: `origin/main` is now at `b405c16`, matching local `main` exactly.

**Decisions made:** Used a per-command credential-helper override instead of modifying `~/.gitconfig` or `.git/config`, since a persistent global credential change wasn't asked for and could affect other repos/sessions on this machine.

**Current state:** Local and remote `main` are in sync. Nothing else pending except the previously-flagged ASSUMPTIONS.md items (independent of git): AI key rotation at the provider, Vercel env var removal, `service_role` key rotation, Supabase test-data cleanup (accounts + the `should-not-insert` listing), and the staging-project/CI-key decision before any CI wiring.

**Next action (superseded, see below):** ~~awaiting direction~~ — user reported "sign-up/create account is also not working" and asked for more animations.

---

## 2026-09-16 — Session 1 (continued) — Important discovery: Vercel auto-deploys on push, plus a real sign-up bug fix

**Important discovery, flagged immediately to the user:** Checking the live site (`gear-drop-4xza.vercel.app`) to investigate the reported bug revealed it already showed the full redesign — the earlier `git push` had triggered an **automatic Vercel production deployment** (GitHub-integration default behavior), without an explicit deploy proposal/approval step as the working method calls for. Confirmed via the deployed JS bundle hash (`index-GPCzIxzB.js`) matching the exact local build. Noted as something to watch going forward: on this project, pushing to `main` **is** effectively deploying to production.

**Bug investigation:** Reproduced against the live site using the `claude-in-chrome` browser tools (not just automated Playwright, to match the user's actual reported experience as closely as possible).
- A **fresh, never-used username** signs up correctly and instantly (dialog closes, session active) — confirmed working.
- A **duplicate username** correctly shows "That username is already taken." — confirmed working.
- The actual bug: a **password under 6 characters** (native HTML5 `minLength="6"` constraint) silently blocked the `onSubmit` handler from ever running — the browser intercepts the `submit` event before our JS sees it. Compounded by the `message` state never being cleared between attempts, so a stale error from a *previous* attempt (e.g., "username already taken") would sit on screen indefinitely, making a subsequent silent-failure attempt look like "nothing is happening" or "still broken from before." This combination is exactly what "sign-up is not working" would look like to a real user.

**Fix (`src/main.tsx`, `Auth` component):**
- Added `noValidate` to the form so our own JS validation always runs instead of the browser silently intercepting `submit`.
- Added explicit username (≥3 chars) and password (≥6 chars) checks at the top of `submit()`, mirroring the `validateListing()` pattern from Phase 4, with clear messages.
- Messages now clear automatically when the user edits either field, or switches between sign-in/sign-up mode — no more stale errors.
- Replaced the barely-styled `.warning` class with the dedicated `.field-error` component (defined in `tokens.css` back in Phase 9.1 but never actually used until now), with `role="alert"` for screen-reader announcement.
- Added a `submitting` state disabling the button and showing "Please wait…" during the request, so a slow network doesn't invite a confusing double-click either.
- Added a permanent regression test (`tests/e2e/critical-flows.spec.ts`) proving the short-password case shows a clear inline error (not silence) and that editing the field clears it.

**Animation additions** (user asked for more, explicitly): restored a scroll-triggered section reveal (`animation-timeline: view()`) that existed in the *original* pre-redesign `styles.css` but was accidentally dropped during the Phase 9.1 rewrite; added a nav-link underline hover, product-card image hover-zoom, toast slide-in, and a category-icon hover lift.

**Real bug caught while adding the scroll-reveal**: the reduced-motion fallback only shortened animation *durations*, which does nothing for a scroll-linked timeline (its progress is driven by scroll position, not time) — under `prefers-reduced-motion`, sections would have stayed invisible forever since the timeline could never "complete." Fixed by gating the whole animation behind `@media (prefers-reduced-motion: no-preference)` so reduced-motion users simply see full content immediately, which is the correct fallback.

**Test-suite lesson learned**: the axe accessibility tests initially failed after restoring the scroll-reveal. First hypothesis (scroll-then-scroll-back-to-top to "reveal everything") was itself wrong — `animation-timeline: view()` continuously re-links to scroll position, so scrolling back up un-reveals sections again; it's not a one-shot trigger. Fixed by testing contrast under `reducedMotion: "reduce"` (Playwright's `test.use()`), which is both simpler and more correct: contrast auditing should check the page's stable rendered colors, not chase a moving mid-scroll animation frame.

**Tests run and results:** `pnpm build` clean throughout. Final `pnpm test`: **20 Vitest + 11 Playwright (31 total)**, all green, re-run twice for stability.

**Self-review (OWASP-frame):** The sign-up fix closes a real usability/reliability defect (not a security one) — the account was actually being created server-side in the broken case some of the time, but the UI gave the user no way to know that, which could lead to duplicate signup attempts or abandoned accounts. **Not handled**: the Vercel auto-deploy behavior discovery means recent pushes have already gone live without an explicit deploy conversation — flagging this prominently to the user rather than treating it as routine, since the working method calls for deploys to be proposed and confirmed individually.

**Next action (superseded, see below):** ~~awaiting direction~~ — user said "commit and push it."

---

## 2026-09-16 — Session 1 (continued) — Committed, pushed, deployed, live-verified

**What happened:** Committed the sign-up fix + animation additions (`4f05815`, "Fix sign-up validation feedback and add scroll/hover motion"). Fetched first to check for remote divergence (none this time) before pushing. Pushed to `origin/main`, which — per the auto-deploy behavior discovered earlier this session — triggered a new Vercel production build automatically. Polled the live site (via a backgrounded Monitor task, not manual sleeping) until its served bundle hash matched the new local build exactly, confirming the deploy completed.

**Final live verification:** Rather than trust the bundle-hash match alone, re-ran the exact short-password reproduction against the **live production site** using the browser tools: filled a fresh username with a 3-character password, clicked "Create account," and confirmed "Password must be at least 6 characters." now renders immediately in the dialog — the fix is live and confirmed working in production, not just locally. No test account was created this time (validation now blocks the network call from firing at all on invalid input), so no new Supabase cleanup item was added.

**Current state:** `origin/main` at `4f05815`, live production deployment matches. Working tree clean.

**Next action (superseded, see below):** ~~none planned~~ — user reported still seeing the sign-up issue, with a screenshot.

---

## 2026-09-16 — Session 1 (continued) — Real follow-up bug: autofill doesn't clear stale errors

**What happened:** User sent a screenshot showing the "Password must be at least 6 characters." error still displayed, with the username field showing a browser-autofilled email (`monmargarcia@yahoo.com`, visibly highlighted blue — Chrome's autofill indicator) and a password field with ~10 characters already entered.

**Root cause:** Chrome (and most autofill/password-manager mechanisms) sets an input's value using the native property setter, which does **not** dispatch the `input`/`change` events that React's `onChange` listens for. The stale-error-clearing logic added in the previous fix (`onChange={() => setMessage("")}`) never ran for autofilled fields, so a leftover error from an earlier failed attempt stayed on screen even after autofill supplied a valid password — looking exactly like "still broken," even though a real submit click would very likely have succeeded.

**Fix (`src/tokens.css`, `src/main.tsx`):** Standard cross-browser autofill-detection technique — bound a 1ms no-op CSS keyframe to the `:-webkit-autofill`/`:autofill` pseudo-class, and added an `onAnimationStart` handler on both fields that clears the stale message when that specific animation fires (autofill and only autofill triggers it). Kept the existing `onChange` clearing too, for normal typing/pasting.

**Test added:** Playwright can't trigger real OS/browser-level autofill, so `tests/e2e/critical-flows.spec.ts` reproduces the exact underlying mechanism instead of the visual autofill UI: sets the password input's value via the native property setter (bypassing React's synthetic events, exactly like autofill does) and dispatches the same `animationstart` event Chrome fires, then asserts the stale error clears. This tests the real fix mechanism, not just a proxy for it.

**Tests run and results:** `pnpm build` clean. Full `pnpm test`: **20 Vitest + 12 Playwright (32 total)**, all green.

**Self-review (OWASP-frame):** Another usability/reliability fix, not a security boundary change. **Not handled**: no way to test actual OS-level password-manager autofill (1Password, Bitwarden, etc.) in this automated suite — the fix targets the documented `:autofill`/`:-webkit-autofill` CSS pseudo-class mechanism that these tools also trigger through the browser's native autofill API, but hasn't been manually verified against a specific third-party password manager extension.

**Next action (superseded, see below):** ~~awaiting confirmation~~ — user asked to add email-based sign-up as a feature.

---

## 2026-09-17 — Session 1 (continued) — Feature: username-or-email sign-in

**Context:** User asked to add email-based registration, prompted by a (mistaken, on inspection) theory that a username validation error might be displaying as a password error. Checked the actual code first — the two validation checks are field-isolated `if` statements, no path for that misattribution exists. Treated the email-signup ask as a genuine, separate feature request and asked a clarifying design question before building, since it changes the auth architecture documented in `FEATURE-BRIEF.md`'s "Auth quirk" section.

**Design decision (user's choice):** support sign-in via *either* username or email, not a straight replacement. This requires resolving a username to its real email before calling Supabase's `signInWithPassword` — but `profiles` is intentionally public-readable (username only) and must never gain an email column, per the original security brief. Solution: a narrow `SECURITY DEFINER` Postgres function (`email_for_username`, new `supabase-email-lookup.sql`) that looks up `auth.users.email` (never exposed via the REST API otherwise) by username and returns only that string.

**What changed:**
- `src/supabase.ts`: removed the `identity()` username→fake-email synthesis (no longer needed for new signups); added `isEmailLike()`; `signUp(username, email, password)` now uses the real email directly; `signIn(identifier, password)` resolves username-or-email transparently via the new RPC. Fixed a related correctness issue while restructuring: `signIn` previously always called `ensureProfile()` with whatever was typed to log in — safe when that was always a username, but would have silently overwritten a real username with an email string once email-based sign-in existed. Now only self-heals the profile when the identifier used to sign in was a username, never an email.
- `friendlyAuthError()`: "already registered" now reads "That email is already registered" (previously said "username," inaccurate now that emails are real and enforce their own uniqueness).
- `src/main.tsx` `Auth` component: sign-up now collects Username + Email + Password; sign-in collects a single "Username or email" field + Password. Added client-side email-format validation on sign-up.
- New `supabase-email-lookup.sql`: the lookup function, with its security rationale and accepted residual risk (see below) documented inline — **the user ran this in the Supabase SQL editor** (no DB write access from this session).

**Explicitly flagged residual risk (not hidden):** `email_for_username` is necessarily an oracle — given any username, it reveals whether an account exists and, if so, its real email. This is a deliberate trade-off for supporting username-based sign-in; it extends the enumeration exposure the site already had (via the "username already taken" signup error) to also leak the associated email string, with no rate limiting (no serverless proxy layer exists in this client-only SPA). Documented as acceptable for this project's threat model (a demo marketplace), explicitly flagged as something to revisit before this pattern is reused anywhere more sensitive.

**Tests added** (`tests/e2e/critical-flows.spec.ts`): sign-up-then-sign-in-with-email (doesn't need the new RPC, tests the direct-email path), and sign-up-then-sign-in-with-username (exercises the RPC end to end). Updated the three existing sign-up-completing tests to fill the new required email field.

**Tests run and results:**
- Before the user ran the SQL: `pnpm test` → 13/14 Playwright tests passed; the username-sign-in test failed exactly as expected with "No account found with that username or email," correctly identifying the missing RPC rather than a real app bug (confirmed the RPC didn't exist yet via a direct REST probe first).
- After the user ran the SQL: re-probed the RPC directly (returned `null` for an unknown username, correct), then re-ran the full suite: **20 Vitest + 14 Playwright (34 total), all green**, re-run twice for stability.
- Also visually verified both forms via real Playwright screenshots (not just automated assertions) — sign-in shows "Username or email," sign-up shows Username/Email/Password with the real-email rationale copy.

**Self-review (OWASP-frame):** Primarily addresses API2:2023-adjacent broken-authentication ergonomics (real recoverable accounts vs. unrecoverable synthesized ones) while introducing one new, explicitly-documented enumeration/oracle risk (the lookup function) — a deliberate, disclosed trade-off rather than a silently-accepted one. Also fixed a genuine data-integrity bug found during the refactor (profile-clobbering on email-based sign-in) before it ever shipped. **Not handled**: no rate limiting on the new RPC; no password-reset flow yet exists to make the "real email" actually useful for account recovery (still the same documented gap from Phase 3.3) — collecting a real email is a necessary precondition for that but doesn't build it.

**Next action (superseded, see below):** ~~report and await direction~~ — committed and pushed per user's "go ahead"; deploy confirmed live.

---

## 2026-09-17 — Session 1 (continued) — Root-causing the *recurring* stale-error bug properly

**Context:** User reported the same-looking stale "Password must be at least 6 characters" error a *third* time, this time with the email field showing browser autofill (blue-highlighted `monmargarcia@yahoo.com`) and asked to check thoroughly why this keeps recurring rather than accept another point patch.

**Why the previous fix (the `:-webkit-autofill`/`animationstart` CSS trick, from the 2026-09-16 session) wasn't enough:** it only fires **once** — the first time a field transitions into the browser's autofill-matched state. It does not fire again if: the field is autofilled a second time, a *different* autofill mechanism is used for a different field (e.g. Chrome's "suggest a strong password" affordance, which can populate the password field through a different code path than a saved-credential autofill), or an extension/password manager sets the value through yet another mechanism entirely. In the reported screenshot, the email field was autofilled (which the trick does handle) but the password field's ~10-character value most likely arrived through a different mechanism that never re-triggered the CSS animation for that field, so its stale error just sat there. This is a fundamentally fragile approach — every fix in this direction is chasing one more event-emission edge case among an open-ended set.

**Actual fix — stopped depending on events at all.** Extracted the three local validation checks into a pure `localAuthError(mode, identifier, email, password)` function, and while a *local* validation error is displayed, poll the form's live values every 250ms via `FormData` on a form ref and clear the message the instant it's no longer true — regardless of what changed the field or whether anything fired an event to say so. This is correct by construction: it directly inspects the DOM state rather than inferring it from event side-channels.

Kept a `isLocalError` ref to distinguish "local validation message that should be cleared reactively" from "server-side message (wrong password, already registered, etc.) that should persist until the next explicit submit" — confirmed via a throwaway test that a genuine server error is *not* incorrectly cleared by the poll (would have been an easy regression to introduce here: naively clearing on live re-validation could wipe legitimate server errors too).

**Removed the superseded CSS mechanism** (`tokens.css`'s `autofill-detect` keyframe and the `onAnimationStart` handlers) rather than leaving it alongside the new fix as dead code.

**Test rewritten to prove the actual worst case**, not a proxy for it: sets the password field's value via the native property setter and dispatches **zero events of any kind** — no `input`, `change`, or `animationstart` — and confirms the stale error still clears. This is strictly harder than what real autofill does (real autofill at least changes CSS pseudo-class state) and passing it means the fix is correct independent of *any* future autofill mechanism, not just the ones observed so far. Also verified via two throwaway tests (not committed) that: a real server-side error is untouched by the poll for over a second, and normal live editing still updates errors correctly across multiple submit attempts.

**Tests run and results:** `pnpm build` clean. Full `pnpm test`: **20 Vitest + 14 Playwright (34 total)**, all green, re-run twice for stability.

**Self-review (OWASP-frame):** Still a usability/reliability fix, not a security-boundary change. This iteration specifically corrects a *process* mistake from the prior session — patching the observed symptom (one specific autofill event) instead of the actual mechanism-independent root cause (stale UI state vs. live DOM truth) — which is why the same class of bug kept recurring under slightly different triggers. **Not handled**: the 250ms poll only runs while a local error is visible (negligible cost), but is still a poll rather than an event-driven mechanism — an accepted trade-off given no reliable event exists to replace it with.

**Next action:** Report to user; awaiting commit/push direction (push auto-deploys, as established).

---

## 2026-09-17 — Session 1 (continued) — The actual bug: hardcoded "6" was simply wrong (real minimum is 12)

**This was never an autofill bug at all.** User reported the exact password `Welcome123!` (11 characters — well past any length that should trip a 6-character minimum) still produced "Password must be at least 6 characters," typed manually, no autofill involved, and asked directly whether the number in the message might be wrong. That question was the key — two prior sessions fixed how the stale-error UI *cleared*, without ever questioning whether the number in the message was *correct*.

**Verified directly against the live Supabase Auth API** (not assumed): `POST /auth/v1/signup` with `Welcome123!` returns `{"error_code":"weak_password","msg":"Password should be at least 12 characters.","weak_password":{"reasons":["length"]}}`. This project's real Auth password-policy minimum is **12 characters**, not 6. Also checked whether leaked-password protection was active (a length-independent way this same class of bug could resurface) — confirmed it is not; length is the only active policy.

**Root cause:** `friendlyAuthError()` in `src/supabase.ts` had a broad rule — any error containing "password" and ("short"|"weak"|"least") — that rewrote Supabase's own (correct) message to a hardcoded `"Password must be at least 6 characters."` The real "should be at least 12 characters" message was being silently overwritten with a wrong number on every single attempt. Compounding it, `main.tsx`'s client-side pre-validation used the same wrong hardcoded 6, so even a careful user typing something reasonable like `Welcome123!` (11 characters) would always fail against the *actual* 12-character policy while being told the wrong threshold to fix it against.

**Fix:**
- `friendlyAuthError()` now passes password-policy messages through verbatim instead of rewriting them — Supabase's own wording is already accurate and safe to show; hardcoding a guess at a server-side policy value was the actual mistake, not the rewriting mechanism itself.
- `main.tsx`'s client-side check now uses `MIN_PASSWORD_LENGTH = 12` (confirmed against the live API, with a comment on how to re-verify if this project's policy ever changes) and moved the check to only apply during sign-up (it had incorrectly also gated sign-in, which should never re-validate an existing account's password against current policy).
- Added `tests/unit/auth-errors.test.ts` — a regression test asserting password-policy messages pass through verbatim regardless of the actual number involved, so a future hardcoded-guess mistake like this one would fail the suite immediately.
- Updated existing E2E assertions from "6 characters" to "12 characters" to match reality.

**Live verification performed** (not just automated tests): reproduced the exact reported password against a running local build via the browser tools — confirmed `Welcome123!` now correctly shows "Password must be at least 12 characters." (accurate, actionable), and confirmed `Welcome123!1` (12 characters) signs up successfully end to end.

**Tests run and results:** `pnpm build` clean. Full `pnpm test`: **23 Vitest (was 20 — added the new auth-errors unit test) + 14 Playwright = 37 total**, all green.

**Self-review (OWASP-frame):** This was a real correctness bug affecting every sign-up attempt with a 6–11 character password — a meaningfully large share of "reasonable-looking" passwords a real user would try first. Also a broader process lesson: two prior sessions treated the symptom (autofill mechanics) as the whole problem because that's what a user's screenshot happened to show alongside it (an autofilled email), without verifying the actual numeric claim in the error message against the real server policy. The user's direct question — "what is the actual password length?" — is what actually found it; asking "is this hardcoded value even correct" should have been the first check, not the third. **Not handled**: no other hardcoded-guess-at-a-server-policy values have been specifically audited for the same mistake pattern elsewhere in the codebase; worth a pass if more auth/validation bugs surface.

**New leftover test accounts**: `welcometest_probe@example.com` and `weaktest_probe@example.com` (created while probing the live Auth API directly), plus `welcometest_verify@example.com` (created during live UI verification) — added to the batch of test-data cleanup items.

**Next action:** Report to user; awaiting commit/push direction (push auto-deploys, as established).

---

## 2026-09-17 — Session 1 (continued) — Design: purple accent swap + hero starfield

**Request:** swap the brass/amber accent to purple, and add "gamer-like" background atmosphere to just the hero section (above "Shop by setup").

**What changed:**
- `tokens.css`: swapped `--brass`/`--brass-strong`/`--brass-ink`/`--brass-soft` from amber to purple (light theme: `#6d3cc7`/`#7d50d7`/`#6d3cc7`; dark theme: `#b98aff`/`#c199ff`/`#b98aff`), all contrast-verified computationally before applying, same rigor as the earlier brass work. Added a new `--on-accent` token (white in light theme, near-black-purple in dark theme) replacing 8 places that hardcoded `#1a1200` (a color tuned for amber fills, wrong pairing for purple).
- **Hit the same class of bug as the original brass fix, caught before shipping**: a single purple value can't serve as both "text on light surfaces" and "text on the permanently-dark hero/nyx/safety-hero sections" — verified via axe, which caught 2 real violations (nyx eyebrow and example link at 2.87/2.64 contrast against the dark void). Added a new `--accent-on-dark` token (`#b98aff`, theme-invariant since those sections stay dark regardless of theme) and re-routed every dark-section text usage to it: `.hero .eyebrow`/`.nyx .eyebrow`/`.safety-hero .eyebrow`, `.hero i`, `.nyx .example`, `.mini-nyx`, `.antenna`, and the `.compare-nyx textarea` focus outline.
- Swapped remaining hardcoded amber `rgba()` tints to purple equivalents: `.nyx-answer` background/border, `.safety-hero` glow, `.nyx-mascot` box-shadow and `.glow` (mouth glow, brightened for actual visibility against the dark mascot body rather than reusing the same low-opacity tint used for light-surface badges).
- Regenerated `favicon.svg` and `og-image.png` with the purple accent for full brand consistency (not strictly asked, but they're the same "accent color" the request was about).
- **Hero starfield**: added a `.hero::after` layer (tiled dot pattern, two densities, white + purple-tinted) alongside the existing radial glow in `.hero::before`, scoped only to `.hero` per the request — the Nyx/space identity already leans sci-fi, so this reads as "gamer atmosphere" without introducing an unrelated generic gaming trope. Purely decorative, no motion, no reduced-motion concern.

**Tests run and results:** `pnpm build` clean throughout. Full `pnpm test`: **23 Vitest + 14 Playwright (37 total)**, all green after the `--accent-on-dark` fix, re-run twice for stability. Real visual verification via the browser tools across light theme, dark theme, and the Nyx section mid-scroll-reveal — confirmed the accent reads consistently and legibly everywhere, and the starfield is present only in the hero as requested.

**Self-review (OWASP-frame):** Pure visual/branding change; the only substantive risk was the reintroduced light-surface-vs-dark-surface contrast trap, caught by the same automated axe suite that caught it the first time — validating that the test investment from Phase 9 continues to pay for itself on unrelated future changes, exactly as intended.

**Next action:** Report to user; awaiting commit/push direction (push auto-deploys, as established).

---

## 2026-09-17 — Session 1 (continued) — Hero image-strip background (gaming-gear collage, purple duotone)

**Request:** add a background effect to the hero (only, per follow-up clarification: "top section before Shop by setup") inspired by a reference image showing tall rectangular strips of gaming key art forming a moody collage.

**Flagged before building:** the reference used actual Valorant/CS:GO/etc. key art, which is copyrighted/trademarked material owned by the respective publishers — reproducing it on a live commercial-feeling site is a real IP risk, not just a style question. Asked the user how to proceed; they chose reusing gaming-peripheral/setup photography (royalty-free, same Unsplash source already used site-wide) over custom abstract vector art.

**What changed (`src/main.tsx`, `src/styles.css`):**
- Added `.hero-strips`, a row of 7 tall `<img>` strips (`flex:1` each) using photo IDs already confirmed working elsewhere in the codebase (headset/mic/mouse/keyboard photos from `data.ts` listings) — no new external image sources introduced, `aria-hidden="true"` since it's purely decorative.
- Positioned as a background layer (`position:absolute;inset:0;z-index:0`) behind the existing radial glow, starfield dots, and foreground content — required re-numbering the hero's stacking order (`z-index:2` for real content, `1` for the glow/dot pseudo-elements, `0` for the strips) since they're now three distinct layers instead of two.
- Strips get a purple duotone via CSS `filter` (grayscale → sepia → hue-rotate → saturate), tuned through two visual iterations (checked with real screenshots, not guessed) — the first pass was too bright/saturated and competed with the foreground tagged product photos; darkened further and extended the existing left-to-right dark gradient (already used to keep the headline legible) to cover more of the strip layer.
- Everything else in the hero (headline, CTA, existing tagged product-photo collage, starfield) is unchanged.

**Tests run and results:** `pnpm build` clean. Full `pnpm test`: **23 Vitest + 14 Playwright (37 total)**, all green including all 4 axe accessibility audits — confirms the new background layer doesn't regress text contrast. Re-run twice for stability. Visually verified via the browser tools across two brightness iterations before settling on the final treatment.

**Self-review (OWASP-frame):** Pure visual change, no logic/security surface touched. The one real risk in this task was IP/copyright, not code — addressed by not reproducing the reference's actual copyrighted source material and confirming the substitute approach with the user first rather than assuming.

**Next action:** Report to user; awaiting commit/push direction (push auto-deploys, as established).

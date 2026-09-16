# Assumptions & Open Questions

Each item marked OPEN or RESOLVED (with resolution + date).

## OPEN

12. **CI wiring decision.** `pnpm test` is fully green (30 tests: 20 Vitest + 10 Playwright) and covers unit, integration (live RLS), and E2E (including both critical flows named in the brief). It is deliberately NOT wired into any CI pipeline yet, because doing so would run the account-creating integration/E2E tests automatically and compound item #10 below every time CI runs. Needs the staging-project-or-service-role-key decision (#10) resolved first. — OPEN since 2026-09-16.

11. **Leftover garbage listing in production**: `id=12`, `name: "should-not-insert"`, `image: "http://x"` — created by a bug in the Phase 7 integration test before it was fixed (see PLAN.md Phase 6/7 notes); currently visible on the live public listings feed. Needs manual deletion via Supabase Table Editor — added to the batch of test-data cleanup items alongside the leftover auth accounts. — OPEN since 2026-09-16.

10. **No staging/test Supabase project exists**, and the integration/E2E tests create disposable auth users in the **production** database on every run: `tests/integration/rls.test.ts` (2), `tests/e2e/xss.spec.ts` (1), `tests/e2e/critical-flows.spec.ts` (1) — 4 per full `pnpm test` run. Fine for occasional manual runs during this audit, but not safe to wire into CI as-is (see #12). Needs a decision: stand up a separate staging Supabase project for tests, or provide a service-role key scoped only to CI secrets (never pasted into chat) so the suite can clean up after itself. — OPEN since 2026-09-16.

9. **Leftover test account `rlstest_temp_c@nyx.local`** created during Phase 3 functional smoke testing — its test listing was cleaned up, but the account/profile itself needs manual deletion via Supabase Dashboard, same as `rlstest_temp_a`/`rlstest_temp_b` from Phase 2. — OPEN since 2026-09-16.

8. **`service_role` key rotation.** User pasted the Supabase `service_role` secret key into this chat session on 2026-09-16 while trying to get the `is_admin()` fix applied. It was never used successfully (the one attempt was blocked by the harness before execution) and was never written to disk/repo, but it has now been typed into a chat transcript. Recommend the user rotate it via Supabase Dashboard → Project Settings → API if they consider that exposure meaningful — their call, not auto-actioned. — OPEN since 2026-09-16.

3. **Live `pg_policies` output.** Not yet obtained directly from SQL editor, but behavior confirmed empirically via anon-key HTTP probes instead (see RESOLVED). If a full text diff of policy definitions is still wanted, would need the user to run `select * from pg_policies where schemaname = 'public';`. — OPEN (low priority; behavior already verified) since 2026-09-16.

5. **Vercel project configuration.** Need to know whether the Vercel project's root directory is already set to `2026-09-14/hel/work/GearDrop/`, and whether the user wants the nested path flattened (moving the app to repo root) or left as-is with documentation. Moving it requires updating Vercel's root directory setting — user's call, and must be confirmed before any move. — OPEN since 2026-09-16.

6. **Git history rewrite for the leaked key.** Per the brief, this is the user's call and should only be recommended, not executed, even after rotation is confirmed. — OPEN (decision deferred until after rotation).

7. **`.idea/` directory** appears as untracked in `git status` at the repo root. Not part of this audit's scope unless the user wants it addressed (likely should be gitignored too, but leaving alone unless asked). — OPEN, low priority.

## RESOLVED

- **Key rotation status.** User confirmed on 2026-09-16 the key is NOT rotated ("not yet but I'll remove later"). Live bundle scan (below) confirms it's not exposed client-side regardless. — RESOLVED as: proceed with removal + rotation recommendation in Phase 1, no serverless proxy needed (see next item).
- **AI_PROVIDER_API_KEY usage decided.** User confirmed (2026-09-16): remove entirely. No real Nyx AI-provider feature exists or is planned right now; the key sits unused in Vercel env vars with no code path reading it (confirmed via live bundle scan — no `AI_PROVIDER`/leaked-secret pattern found in the deployed JS). Phase 5 (serverless proxy) is dropped from the plan; Phase 1 will include deleting the Vercel env var alongside the file/`.gitignore` work. — RESOLVED 2026-09-16.
- **Live Supabase URL + publishable key obtained** directly from the deployed bundle (`https://vtulwvjjvgbrgxqzeemi.supabase.co`, `sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u`) — these are intentionally public client-side values, safe to have pulled this way. — RESOLVED 2026-09-16.
- **RLS behavior verified live** (user approved creating disposable test accounts/data, 2026-09-16): anon SELECT listings/profiles → allowed; anon INSERT listing → rejected (401, RLS violation); anon DELETE and cross-user DELETE on a real listing (id=10, owned by test user A) → both silently matched 0 rows (HTTP 204, listing persisted) — confirmed correct via before/after existence check; owner DELETE → succeeded, listing actually removed. Matches the SQL policies. One drift found: `is_admin()` RPC is callable by anon (returns `false`) because Postgres grants `EXECUTE` to `PUBLIC` by default and the admin SQL never revokes it — not currently exploitable but a least-privilege gap, added to PLAN.md as a fix. **Leftover test data**: profiles `rlstest_temp_a`/`rlstest_temp_b` and their two auth.users rows still exist in the live database (test listing was cleaned up). No delete policy exists on `profiles` and this session has no service-role key, so these can only be removed by the user via the Supabase dashboard (Authentication → Users → delete; cascades to the profile row). — RESOLVED 2026-09-16.
- **Nested app path confirmed.** The real app lives at `2026-09-14/hel/work/GearDrop/`, containing `package.json`, `src/`, `supabase-setup.sql`, `supabase-admin-setup.sql`, `TheKey.env`, and a committed `dist/`. Repo root only has README/docx files. — RESOLVED 2026-09-16.
- **No `.gitignore` exists anywhere in the repo** (root or nested app dir), despite the root README claiming "Git ignores local environment/key files and build/dependency folders." That claim is false in the current tree — `TheKey.env` and `dist/` are both tracked. — RESOLVED 2026-09-16.
- **No `@supabase/supabase-js` dependency currently installed** — confirmed hand-rolled `fetch`-based REST client in `src/supabase.ts`, matching the brief. — RESOLVED 2026-09-16.
- **No test tooling installed** (`package.json` has only vite/react/typescript deps) — matches the brief; test stack to be proposed as its own step. — RESOLVED 2026-09-16.
- **No `dangerouslySetInnerHTML`/`innerHTML` usage found** in `src/main.tsx` — all user content rendered as JSX text, which React escapes. Residual risk is limited to unescaped `href`/`src` attribute schemes, not markup injection. — RESOLVED 2026-09-16.
- **No `vercel.json` exists anywhere in the repo** — security headers need to be added from scratch. — RESOLVED 2026-09-16.

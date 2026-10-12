# GearDrop completion

Authorized on 2026-10-12: finish existing work, profiles, recovery, listing status,
personalization, isolated tests, security review/documentation, star favourites,
and seller price/specification editing. Reporting controls are excluded.
Preserve pre-existing working-tree changes. The user subsequently authorized a
local commit on 2026-10-12. Push and deployment remain outside this authorization.

- [x] Stabilize modal lifecycle and verify account flows without production writes.
- [x] Verify existing public profiles, chat integration and mascot fixes.
- [x] Add favourites and owner-only price/specification/status editing.
- [x] Add persona/platform selection, persistence, browse ordering and Nyx context.
- [x] Add recovery links, password reset and password-wrapped chat-key migration.
- [x] Separate offline checks from explicitly configured staging checks; prepare CI.
- [x] Run build, unit/browser checks; update stale docs and security follow-ups.

Verification: 120 unit tests and 37 mocked browser tests passed; TypeScript and
Vite build passed. Mobile personalization screenshot inspected. No live RLS or
email-delivery test was run; those need staging/external setup.

- [x] Separate My profile (username/email/ratings) from Settings.
- [x] Add current-password-verified password change and email reset in Settings.
- [x] Remove guest-favourites/admin implementation notes and add favourite Q&A.
- [x] Diagnose preferences save failure: required Supabase tables are missing.
- [x] Add bounded Groq photo analysis and desktop/laptop matching to Nyx.
- [x] Reduce Nyx allowance to 15 questions per rolling 24 hours; prepare RPC SQL.
- [ ] Activate updated Nyx function and allowance RPC; verify real photo accuracy.

- [ ] Apply preferences SQL in Supabase (user dashboard).
- [ ] Configure/verify recovery redirects and email delivery.
- [ ] Deploy updated Nyx function and frontend after approval.
- [ ] Configure isolated staging and run live RLS/integration checks.
- [ ] Review historical production test data before cleanup; no deletion performed.

User confirmed 2026-10-12: the previously exposed provider API key was revoked.
Backup copies and pre-existing changes are preserved. Generated outputs and
named backup directories are ignored, rather than deleted.

External setup: user runs new SQL in Supabase, configures recovery redirect URLs,
and supplies a separate staging project before live integration tests/CI run.
Key rotation, production data removal, history rewriting and deployments are not
performed automatically. They require provider access or explicit approval.

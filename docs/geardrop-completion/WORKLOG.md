# Worklog

## 2026-10-12 — Completion work, favourites and seller editing

**Authorization:** user approved completing the unfinished work, star favourites
and seller price/specification editing. Reporting controls were excluded. No
commit, push or deployment was performed.

**Initial state:** marketplace, accounts, encrypted chat/deals/PayNow, reviews and
AI Nyx existed. Profiles, chat profile links, mascot/modal fixes were uncommitted.
Two saved signin failures were timeouts, not proof of a live Auth failure.
Preferences/recovery UI and seller editing/status controls were absent. Tests
defaulted to production Supabase.

**Changes:** stable modal callbacks and stack-aware Escape/scroll/focus handling;
existing profile/mascot changes retained and tested; independent accessible star
buttons/Favourites filter; browser guest persistence and private account tables;
seller editor for validated decimal price, structured specs and listing status;
optional persona/platform, tailored hero mood/copy and All gear ordering, Settings
and reset, allowlisted Nyx context; recovery/reset with same-key rewrapping and
backup-only retry; old keys preserved when the previous password is forgotten;
chat unlock can later migrate an old backup after authenticating the current
password; incomplete key setup is never silently overwritten.

Tests now default to unit and mocked-browser checks. Staging-only configs, direct
integration guards and CI are prepared; production URL/key fallbacks were removed
from live test files. No production test accounts were created. Documentation,
privacy explanations and generated-output/backup ignores updated. Existing
backup copies, user changes and unrelated backlog CLI preserved.

**Checks:** `node tools/run-checks.mjs all`: 14 unit files / **111 tests passed**;
**34 browser tests passed**. Includes the formerly failing account paths, listing
creation/deletion, favourites refresh/keyboard, owner editing, persona reset/Nyx
payload, recovery warnings/failure retry, nested profiles/chat focus, mascot,
mobile layouts and axe light/dark checks. `tsc --noEmit` and Vite build passed;
mobile picker PNG inspected. `git diff --check` passed.

Build retains the existing Vercel Analytics bundling warning and a main bundle
above 500 kB (584.62 kB minified / 168.14 kB gzip); no dependency was added.
Splitting the bundle is an optional future performance improvement.

**Limits/external setup:** offline checks do not prove deployed RLS or email
delivery. New staging RLS tests were written but not run; no staging project is
configured. CI was not run on GitHub. New SQL was reviewed, not applied. Follow
`SETUP.md` for preferences SQL, recovery redirects/email delivery, approved Nyx
and frontend deployment, then optional staging and live checks.

**Security:** user confirmed the previously exposed provider API key was revoked.
Historical key content remains in Git; no history rewrite performed. This does
not establish the status of the separately documented Supabase service-role key.
Historical production test records need dashboard review before deletion.
Recovery cannot recover old encrypted messages without the old password/key.

**Handover:** local server running on http://localhost:5173 for user testing.
Its existing Supabase connection means listing writes affect real data.

## 2026-10-12 - Profile and Settings follow-up

User requested a separate My profile menu item. Previously Settings contained
account details, email management and ratings. These now appear in My profile;
public profiles still hide email. Settings retains personalization and optional
admin usage stats, adds Change password and Reset password by email, and removes
the feedback-table implementation note. Password change verifies the current
password and rewraps the existing encrypted chat backup.

Removed the guest-favourites browser-storage note from Browse. Added the exact
Q&A: "How do I favourite listings?" / "Simply click the star on the listing."

A read-only anonymous REST check returned HTTP 404 / PGRST205 for both
user_preferences and favorites, confirming the missing-table cause of the
preferences save error. Advised running supabase-preferences-setup.sql in the
Supabase SQL Editor. No migration or production data write was performed.

Validation: 111 unit tests and 37 mocked browser tests passed, including private
profile/public email privacy, Settings actions, wrong-current-password rejection,
successful password change with backup preservation, and favourite Q&A.
TypeScript and production build passed. Existing Analytics and bundle-size
warnings remain (586.45 kB minified / 168.54 kB gzip). No dependency added.

## 2026-10-12 - Nyx photo analysis and allowance

User requested more accurate responses using listing photos, especially avoiding
laptops for a $5000 PC request. User chose the same Groq provider and a reduction
from 20 to 15 questions per user. Previously photos were absent from Nyx's data
and the combined PC/Laptops category had no subtype constraint.

Added server-loaded photos, desktop/laptop matching, conflicting/unknown type
exclusion, and bounded image analysis through the existing Groq key/base URL.
Groq documentation currently shows qwen/qwen3.8-27b for vision; it is the Groq
default, overridable with AI_VISION_MODEL. Six listings/two photos each maximum,
request-scoped caching, timeout and honest text-only fallback. Photos never
establish hidden specs or condition. Only approved public photo hosts are sent.
Lowered client/server cap to 15 and prepared a minimal remaining-counter SQL
update. Existing usage is retained, with the same rolling 24-hour window.

Validation: 120 unit tests and 37 mocked browser tests passed. Frontend and pure
Edge helper TypeScript checks passed, as did the build. Regression tests cover
$5000 desktop requests, laptop requests, uncertain/conflicting photos, forged
client photos, provider errors, parsing and usage cap/cache. Build retains the
existing Analytics and bundle-size warnings. No dependency, deployment, SQL
execution or live Groq request. Actual photo accuracy awaits live acceptance.
Activation and cost/coverage limitations are in NYX-VISION.md.

## 2026-10-12 - Local commit requested

User reported that everything is well and authorized committing the GearDrop
work. Include the implemented app features, tests, CI, migrations, project
instructions and continuity documents. Exclude unrelated backlog tools, local
Claude launch settings, Office lock files, generated outputs and secrets. No
push or deployment is authorized by this request. READMEFIRST retains external
setup/live-verification items because their completion has not been established.
Latest code verification remains 120 unit and 37 mocked browser tests passing,
TypeScript and build passing. No code changed for the commit preparation.

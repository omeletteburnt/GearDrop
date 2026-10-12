# GearDrop: local changes and setup

Active app: `2026-09-14/hel/work/GearDrop/`.
Local preview: http://localhost:5173 (the running development server).
The preview uses the existing Supabase configuration: editing or creating real
listings changes the existing database, even though the website is on localhost.

## What's changed

| Before | Current local implementation |
| --- | --- |
| No saved listings | Separate star button on every card; Favourites filter; browser persistence for guests and private account persistence after SQL setup |
| Sellers could publish/delete only | Owner-only editor for price, structured specifications and Available/Reserved/Sold; changes update browse/detail/comparison views |
| Profile work was unverified | Listing/chat profile links, join date, buyer/seller reviews and listings; stacked modal focus/scroll handling verified |
| One homepage for everyone | Optional competitive/creator/casual/budget persona and platform, tailored hero mood/copy, browse ordering and Nyx context |
| No password recovery | Real-email recovery, new-password form, chat-backup rewrapping when the previous password is known; old keys preserved when it is forgotten |
| Tests wrote production data | Default unit and mocked browser checks, explicitly guarded staging-only live tests, CI workflow with no deployment job |

Persona sorting applies to the unsearched All gear view. Explicit search and
category filters preserve their existing order. Active personas put Available
before Reserved and Sold; default preserves the original order. Listing photos
are never replaced by persona mood images.

Guests and signed-in users have separate preferences/favourites. Guest choices
are not automatically uploaded into an account. A missing database migration
causes a friendly save error; it does not claim to have saved account data.

## Required in the existing Supabase project

1. Open SQL Editor and run the complete contents of
   `2026-09-14/hel/work/GearDrop/supabase-preferences-setup.sql`.
   It creates `user_preferences` and `favorites`, with owner-only row policies.
   It does not change the existing public profiles table or delete existing data.
2. In Authentication > URL Configuration, allow these exact recovery destinations:
   - `http://localhost:5173/#reset-password`
   - `https://gear-drop-4xza.vercel.app/#reset-password`
   Keep the production Site URL as the production website. Do not switch it to
   localhost. Verify recovery email delivery/SMTP settings using an account you own.
3. The local Nyx client now sends persona/platform enums. Redeploy the updated
   `supabase/functions/nyx/` function to make the live AI use them. This deployment
   has not been performed. The existing function continues answering without
   personalization until updated. No new AI secret or provider dependency is needed.
   Nyx also now supports Groq photo analysis and a 15-question allowance. Deploy
   the complete function folder and run `supabase-nyx-limit-update.sql` so the
   server and display counter agree. See [NYX-VISION.md](NYX-VISION.md).
4. Manually verify that another account cannot read/update your preferences or
   favourites, and cannot change your listing price/specifications/status.

Do not re-run all historical migrations in production just to enable these
features. Owner-only listing update policies already exist. Only the new
preferences migration is required for the new account data.

## Password recovery and encrypted chats

The separate My profile menu contains username, private email management and
your buyer/seller ratings. Public profiles continue to hide email. Settings
contains personalization, Change password and Reset password by email.
Changing a password verifies the current password and preserves the chat backup.

A real email must have been added beforehand. Placeholder-only accounts cannot
receive recovery email. Recovery requests give the same success text regardless
of whether an eligible account exists.

A read-only check on 2026-10-12 confirmed that `user_preferences` and `favorites`
return HTTP 404 / PGRST205 (missing tables in the schema cache). This explains
the account preferences save error. Run the preferences SQL above and refresh
localhost; the migration has not been applied during this work.

The previous password can decrypt and rewrap the same chat key under the new
password. Password changes and backup writes are separate server operations:
if the backup write fails after the password changes, keep the reset window open
and use Retry chat backup. It does not change the password a second time.

If the previous password is forgotten, the old public key and backup remain
untouched. Existing messages may remain locked. GearDrop deliberately does not
silently replace the key or promise it can recover the messages. If the previous
password is remembered later, the chat unlock form has a previous-backup-password
option that rewraps the original backup after checking the current login password.

## Local checks and CI

From the active app directory:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node tools/run-checks.mjs all
```

With pnpm installed, `pnpm build` and `pnpm test` are equivalent. No lint script
exists. Default tests use in-memory API responses and an invalid offline Supabase
hostname; unexpected external browser requests are blocked. These tests cover UI
behavior, not the actual database permissions or email delivery.

`.github/workflows/checks.yml` prepares build and offline tests for push/PR. The
manual staging job is separate. The user authorized a local commit of the work
on 2026-10-12. The workflow has not run on GitHub; no push or deployment was performed.

## Separate staging project (optional until live tests are needed)

A staging project is another Supabase project with test users/tables, separate
from the real website. The existing production project is not a staging project.

Create a new test project or use an isolated Supabase branch, then reproduce the
schema without copying real users, messages or payment information. For a fresh
project, review/run the setup files in this order:

1. `supabase-setup.sql`, `supabase-admin-setup.sql`, `supabase-email-lookup.sql`
2. `supabase-account-setup.sql`, `supabase-chat-setup.sql`, `supabase-reviews-setup.sql`
3. `supabase-nyx-setup.sql`, `supabase-hardening.sql`, `supabase-photos-setup.sql`
4. `supabase-advisor-fixes.sql`, `supabase-stats-setup.sql`, `supabase-security-setup.sql`
5. `supabase-preferences-setup.sql`

Important: historical SQL contains production-specific photo URL prefixes.
Replace the production project reference with the staging reference in the
staging SQL before executing it (in particular `listing_photo_prefix()`). Do not
change the production SQL/editor values. Use the same minimum password policy
(12 characters); email-confirmation settings must permit disposable staging users
to receive immediate sessions for the existing signup tests.

Set these in the PowerShell session, without editing or committing `.env` files:

```powershell
$env:GEARDROP_STAGING_TESTS = '1'
$env:GEARDROP_STAGING_HOST = 'YOUR-STAGING-REF.supabase.co'
$env:VITE_SUPABASE_URL = 'https://YOUR-STAGING-REF.supabase.co'
$env:VITE_SUPABASE_ANON_KEY = 'YOUR-STAGING-PUBLISHABLE-KEY'
node tools/run-checks.mjs staging
```

The runner/configs and integration files refuse the known production host and
require an exact matching staging host. They do not need a service-role key.
The browser staging server uses port 4174; the manual preview uses port 5173.
Tests still create disposable accounts in staging; review/reset those test users
there periodically. Some legacy suites leave uploaded test photos as well.
`CHAT_E2E=1` and `NYX_LIVE=1` enable extra live checks only after staging is ready.
For live Nyx checks, deploy/configure the function on staging, including its
ALLOWED_ORIGINS for `http://localhost:4174`; default offline CI makes no AI calls.

For GitHub's optional staging job, configure the `staging` environment:
variables `GEARDROP_STAGING_HOST`, `VITE_SUPABASE_URL`, and secret
`VITE_SUPABASE_ANON_KEY`. Never supply production credentials or a service-role
key. Run the workflow manually with staging selected.

## Security and repository follow-ups

- User confirmed on 2026-10-12 that the previously exposed provider API key was
  revoked. Historical Git content still contains the revoked key; history rewriting
  remains an optional separately approved action. The status of a separately
  mentioned Supabase service-role key is not established by this confirmation.
- Historical test accounts and the old test listing need a fresh dashboard review
  before deleting anything. No production records were deleted during this work.
- Screenshot/build/test output is ignored. Existing backup directories are
  preserved and ignored to avoid accidentally committing duplicate repositories.
- Existing user changes and the game-backlog CLI were preserved. No reporting
  control was added.

## Manual acceptance checklist

- Star/unstar listings; filter favourites; refresh; repeat as guest and signed in.
- Edit your own price/specifications/status; refresh; check another seller has no
  edit control. Try decimal prices and invalid/duplicate specification names.
- Open profiles from a listing and chat. Escape closes only the upper popup and
  returns focus; the underlying modal continues locking page scroll.
- Select each persona/platform, check the hero and browse, reset to default,
  switch accounts/log out, and check no account choices leak to another account.
- After function deployment, ask Nyx a persona-specific question and verify the
  response still uses actual listing details and your exact budget.
- Request recovery using an account you own. Test preserving its chat backup with
  the previous password. Do not reset an important account without understanding
  the encrypted-chat warning.

# Task: GearDrop site-stats PDF report skill

> Copy everything below this line into Claude Code, started from the repo root
> (`D:\DPP-ITE\Internship\Geardrop`).

---

## Context
GearDrop is a second-hand gaming gear marketplace (Vite + React 19 + TypeScript,
Supabase, deployed on Vercel; pushing to main deploys to production). The app
lives in `2026-09-14/hel/work/GearDrop/`. Conventions are in
`docs/geardrop-hardening/` (read WORKLOG.md's last two entries, dated 2026-10-09).

## Goal
A Claude Code skill called `site-stats`. When I say something like "make a site
stats report", it runs immediately, without asking me anything, and saves a dated
PDF report I can keep. Then it replies with the PDF's path and 2-3 headline numbers.

## What the report shows (live Supabase data, aggregates only)
- Users: total, new in 7 days, new in 30 days
- Listings: total created, new in 7 days, average price, counts by status and by category
- Deals: started -> both confirmed -> completed (PayNow sent), plus completed value.
  The site has no "mark as sold" button, so completed deals are the sales figure.
- Reviews: total, average stars, 1-5 star distribution
- Chat: conversations, messages, messages in 7 days (counts only, chat is E2EE)
- Nyx: questions total and in 7 days, helpful/unhelpful feedback
- Last-30-day daily charts (Singapore dates): new users, listings, deals completed, messages
- Visitors: from Vercel Web Analytics. Only include a number if I give one in my
  request. Never ask for it and never invent it.

## Existing work (built in another session, uncommitted, never run for real)
- `2026-09-14/hel/work/GearDrop/supabase-stats-setup.sql`: `private.site_stats()`
  SECURITY DEFINER plus a public SECURITY INVOKER wrapper returning one jsonb of
  aggregates. Anon can call it (no PII), so no password or service_role key is needed.
- `tools/claude-skills/site-stats/SKILL.md` and `scripts/site-stats.mjs`: Node script,
  no new dependencies. It calls the RPC with the anon/publishable key from the app's
  `.env` or `.env.local`, builds the HTML, and prints it to an A4 PDF using the
  app's own Playwright Chromium. The PDF is saved to `Documents\GearDrop Reports\
  GearDrop-site-stats-YYYY-MM-DD_HHMM.pdf`, and `GEARDROP_REPORTS_DIR` or `--out`
  overrides the folder.
- `index.html`: adds the Vercel Web Analytics script tag
  (`<script defer src="/_vercel/insights/script.js">`, same-origin so the CSP allows it).

## What I want you to do
1. Read the files above and review them. If any are missing, build them to the spec here.
2. Install the skill: copy `tools/claude-skills/site-stats/` to `.claude/skills/site-stats/`.
3. Tell me to run `supabase-stats-setup.sql` in the Supabase SQL Editor and wait for me
   to confirm. Don't try to run SQL against the database yourself.
4. Run the skill for real and open the PDF. Check that the numbers make sense and that
   nothing is cut off or split badly across pages. Fix anything that's wrong.
5. Run `pnpm build` and `pnpm test` in the app folder. They must stay green (the index.html change touches the site).
6. Add a WORKLOG entry in the same format as the existing ones.
7. Show me the diff and ask before you commit. Don't push, because pushing deploys.

## Rules
- Never use or ask for the service_role / `sb_secret_` key.
- Don't add npm dependencies.
- Reports must not be saved inside the repo.
- If Chromium is missing, tell me to run `pnpm exec playwright install chromium` in the app folder.
- Files can show as "modified" only because of CRLF line endings. Don't commit those.

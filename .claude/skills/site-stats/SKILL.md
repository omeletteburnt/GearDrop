---
name: site-stats
description: Generate and save a GearDrop site-stats PDF report (users, listings created, listings by status/category, completed deals and value, reviews, chat activity, Nyx usage, last-30-day trends) from live Supabase data. Use when the user asks for site stats, a stats/analytics report, metrics, "how is the site doing", or how many users/listings/sales GearDrop has.
---

# GearDrop site stats report

One job: produce a dated PDF report and tell the user where it was saved.
Don't ask questions first - just run it.

## Steps

1. **Run the script** from inside the GearDrop repo:

   ```bash
   node .claude/skills/site-stats/scripts/site-stats.mjs
   ```

   Only if the user's message already includes a visitor number from Vercel
   Analytics, add it (never ask for it, never invent one):

   ```bash
   node .claude/skills/site-stats/scripts/site-stats.mjs --visitors 1234 --visitors-label "Last 30 days"
   ```

   If the user names a different folder to save to, add `--out "<folder>"`.

2. **Reply briefly**: the full path of the saved PDF (the script prints it as
   `Report: ...`) and 2-3 headline numbers from the printed summary. Nothing
   else unless the user asks.

## Where reports go

Default: `Documents\GearDrop Reports\GearDrop-site-stats-YYYY-MM-DD_HHMM.pdf`
(or `OneDrive\Documents\...` if Documents lives there). Each run creates a new
dated file; old reports are kept. The `GEARDROP_REPORTS_DIR` environment
variable or `--out` overrides the folder.

## Troubleshooting (tell the user the fix; don't work around it)

- **"public.site_stats() doesn't exist yet"**: run
  `2026-09-14/hel/work/GearDrop/supabase-stats-setup.sql` once in Supabase
  Dashboard -> SQL Editor.
- **"Supabase URL/key not found"**: the app's `.env.local` needs the same
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the site uses.
- **"Playwright's Chromium isn't installed"**: run
  `pnpm exec playwright install chromium` in the app folder.
- **"Playwright not found"**: run `pnpm install` in the app folder.

## Rules

- Never use or ask for the `service_role` / `sb_secret_` key; the script
  refuses it on purpose.
- Numbers cover real Supabase data only; the 22 built-in demo listings are not
  counted. The site has no mark-as-sold button, so **completed deals** are the
  sales figure.

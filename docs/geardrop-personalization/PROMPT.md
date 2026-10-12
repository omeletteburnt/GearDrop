# Implementation update (2026-10-12)

The MVP is now implemented locally: optional persona/platform picker, guest browser persistence, private account tables, Settings/reset, tailored hero mood/copy, browse ordering and validated Nyx context. The preferences SQL and updated Nyx Edge Function still require applying/deployment. See `../geardrop-completion/SETUP.md`. The brief below is retained for reference.

# Task: Persona-based personalization for GearDrop (MVP)

> Copy everything below this line into a new coding session to start the work.

---

## Context
GearDrop is a second-hand gaming gear marketplace (Vite + React 19 + TypeScript,
Supabase, deployed on Vercel; pushing to main deploys to production).
The app lives in `2026-09-14/hel/work/GearDrop/`. Before writing any code, read:
- `docs/geardrop-hardening/` (FEATURE-BRIEF, PLAN, ASSUMPTIONS, WORKLOG) for conventions
- `src/main.tsx` (hero section, browse grid, Nyx section), `src/data.ts` (Listing type,
  categories, starterListings), `src/recommend.ts` (existing `rank()`),
  `src/Settings.tsx`, `src/NyxUI.tsx`, `supabase/functions/nyx/` (logic.ts + index.ts)
- `supabase-setup.sql` (profiles/listings + RLS) and one other `supabase-*-setup.sql`
  to copy their style

## Goal
Make GearDrop feel tailored to each visitor, the way an interior design site shows a
lifestyle that matches the viewer. The site should frame the same marketplace
differently for each gamer persona: different hero mood and copy, different listing
order, and a Nyx that knows who it's talking to.

## Personas (fixed enum, no free text)
- `competitive`: FPS/esports. Priority: Mouses, Keyboards. Boost light weight,
  wireless, rapid trigger, 60%/75% layouts, high refresh rate.
  Hero tone: "Every millisecond counts."
- `creator`: streamers/content creators. Priority: Mics, Headsets. Boost USB/XLR,
  cardioid, RGB. Hero tone: "Look and sound the part."
- `casual`: relaxed/couch/cozy gamers. Priority: Headsets, Laptops. Boost comfort,
  wireless, battery life. Hero tone: "Your comfy corner, upgraded."
- `budget`: budget builders. Priority: PC/Laptops, any category. Boost lower price
  and "Good"/"Like new" condition. Hero tone: "Pro-level gear, second-hand prices."
- `default`: guests or anyone who hasn't chosen. Keep the current hero exactly as it is.

Also capture an optional `platform`: pc | playstation | xbox | switch | mac
(this matches the existing `specs.Platform` values).

## Scope (MVP)
1. Data
   - New file `supabase-personalization-setup.sql`, written in the same style as the
     other setup files. Add `persona` and `platform` to `profiles` (or a separate
     1:1 table if that fits existing RLS better; explain the choice). Use CHECK
     constraints for the enums. RLS: only the owner can read or update their own
     persona. It must NOT be readable by other users.
   - Guests: store the persona in localStorage only.
2. Picking a persona
   - After sign-up, and as a "Personalize" chip for guests: a small picker with 4
     cards plus "Skip". It must be optional and dismissible, and must reuse the
     existing modal accessibility (`useModalA11y`).
   - Add a persona/platform section to Settings, including "Reset to default".
   - A visible label near Browse: "Showing you: Competitive setups · Change".
3. Presentation
   - Hero: swap the eyebrow, headline, subtext and hero-strip/gallery scene images
     per persona. Scene images are mood/banner images ONLY. Never replace or alter
     a listing's own photo, because second-hand listings must show the real item.
   - Browse grid: add a pure function `personaScore(listing, persona, platform)` in
     `src/recommend.ts` and use it to order the "All gear" view. Explicit search and
     category filters still behave as they do today; persona only breaks ties.
     Sold items always stay below available ones.
4. Nyx
   - Send the persona/platform enum to the nyx edge function, and validate it
     server-side against the allowlist (never put raw client text into the prompt).
   - Add one short persona hint to `systemPrompt()`, e.g. "The user describes
     themselves as a competitive FPS player on PC; tailor picks, but answer what
     they actually ask."
   - Persona-specific Nyx greeting and "Try an example" prompt.

## Out of scope (do not build)
- Learning the persona from clicks/behaviour (Phase 2, later)
- AI-generated images
- Any change to listing photos, chat, reviews, or PayNow flows

## Constraints
- Start in plan mode: propose a phased plan and wait for my approval before editing.
- Check the CSP / security headers (vercel.json or wherever they're set) still
  allow any new image sources.
- Keep everything accessible (alt text, contrast in both light/dark themes; the
  existing axe e2e test must pass).
- Don't commit files whose only change is CRLF line endings.
- Add a WORKLOG entry for each phase, matching the existing format.
- Never commit or push without asking me first (push = production deploy).
- Give me the SQL to paste into the Supabase SQL editor myself; don't assume it has run.

## Tests
- Unit: `personaScore` ordering for each persona, platform boost, sold-items-last,
  default persona = unchanged order.
- Unit: Nyx persona allowlist validation (rejects unknown values).
- Integration: RLS — a user cannot read or update another user's persona.
- E2E: guest picks a persona → hero copy changes; reset → default hero returns.
- `pnpm build` and the existing test suites must still pass.

## Done when
A signed-in user and a guest can each choose a persona and see a different hero,
re-ordered "All gear" grid, and persona-aware Nyx; they can change or reset it; and
all tests pass.

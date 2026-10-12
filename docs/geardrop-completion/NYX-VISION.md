# Nyx photo analysis and 15-question allowance

Before: Nyx received listing text only, with desktops and laptops sharing the
PC/Laptops category. Its models defaulted to text-only GPT-OSS. A desktop request
could therefore receive laptop suggestions.

Local changes: a computer search now distinguishes desktop/laptop/unknown,
including a server-enforced subtype for explicit PC or laptop questions. PC means
desktop; accessory questions and PC-versus-laptop comparisons are not constrained.
Unconfirmed or contradictory types do not match a subtype request. The server
loads real photos from Supabase, ignoring browser-supplied real-listing photos.
Demo photos are still marked as demos.

Groq photo analysis uses the existing AI_API_KEY and AI_BASE_URL. The default on
Groq is `qwen/qwen3.8-27b`, currently documented on Groq's vision page:
https://console.groq.com/docs/vision (checked 2026-10-12). It supports image URLs
and JSON mode. AI_VISION_MODEL can override this model; `none` disables photos.
Non-Groq base URLs require an explicit compatible AI_VISION_MODEL.

Each question checks at most six candidate listings, with up to two photos per
listing. Repeated search/detail calls reuse results within that request. This
adds up to six Groq requests, plus the existing answer/search loop; it consumes
provider rate limits and may cost money on a paid plan. One user question still
counts as one question in GearDrop. There is no persistent cache or new schema
for photo analysis. Candidate-limited searches cannot prove that no other match
exists anywhere in the marketplace.

Photos can establish visible form factor, but cannot verify hidden components,
working condition or authenticity. Unclear photos are labelled unknown; conflicts
with text are excluded from subtype recommendations. Missing/blocked photos,
provider limits, timeout or malformed results produce labelled text-only advice,
without claiming visual verification. Photos are restricted to public listing
storage and the existing demo image hosts, not arbitrary URLs.

## Activation in the existing Supabase project

1. Deploy the updated `supabase/functions/nyx/` folder (includes `vision.ts`).
   Keep the existing Groq API key/base URL. No key needs to be pasted into chat.
2. Run `2026-09-14/hel/work/GearDrop/supabase-nyx-limit-update.sql` in SQL Editor.
   This updates the remaining-questions display RPC to 15 and preserves usage.
3. Publish the frontend when ready; localhost already displays a 15-question cap.
4. Manually test a desktop PC request, laptop request, unclear photo and a
   misleading photo with an account you own. These tests consume Groq usage.

The limit remains a rolling 24 hours, not a midnight reset. Existing requests
count toward the reduced limit. No live deployment, SQL execution or paid Groq
call was performed during implementation. Offline tests verify filtering and
provider request/failure behavior; actual photo accuracy needs live acceptance.

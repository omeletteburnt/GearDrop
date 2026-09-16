# GearDrop
THIS IS AN UNFINISHED DEMO.
GearDrop is a website where all casual-competitive gamers come together and buy/sell off gaming equipment other fellow gamers have.
The Game Industry sustains a big market, and I believe this website can actually give gamers a second alternative to gaming equipment.

# TECH-STACK:

- Frontend: React + TypeScript
- Build tool/dev server: Vite
- Styling: Custom CSS (no UI framework)
- Database and authentication: Supabase
  - Supabase Auth for username/password sign-in
  - Supabase PostgreSQL for user profiles, listings, and admin permissions
  - Row Level Security policies for seller/admin permissions
- Hosting/deployment: Vercel
- Source control: GitHub
- Product images: external image URLs, mainly Unsplash and selected product image sources
Second-hand marketplace, but for gamers.


# My GearDrop website currently includes:
- Gaming marketplace for PC/Laptops, Keyboards, Mouses, Mics, and Headsets.
- Search bar and category filters.
- 22 demo product listings with product photos, prices, conditions, stock status, specs, and missing-information notices.
- Product detail pop-up for each listing.
- “Ask Nyx” AI assistant for general gear guidance and product-specific questions.
- Requirement-based recommendations that update when users describe what they need.
- Alternative recommendations with explanations of why Nyx picked them.
- Missing listing information warnings.
- Same-category product comparison: price, condition, availability, specifications, and missing details side-by-side.
- Nyx Q&A panel for the two selected comparison models.
- Responsive/mobile-friendly layout.
- Light/dark theme toggle, including adaptive comparison and safety sections.
- Animated Nyx mascot, product-card movement, and scroll/hover visual effects.
- Space-game styled hero background with stars, planet glow, and alien-horizon styling.
- Sign-up and sign-in with username and password.
- Logout feature.
- Sell-listing form with a warning when key specifications are missing.
- Listings saved in Supabase, so real user listings stay after refresh.
- Seller-created listings appear alongside the demo listings.
- Sellers can delete their own persisted listings after a Yes/No confirmation.
- Red hover state on the final “Yes” delete button.
- Admin role through Supabase:
  - Admin badge when logged in.
  - Admin can delete any real Supabase listing.
  - Normal sellers can only delete their own.
- Privacy & Safety page:
  - Buyer/seller safety tips.
  - Privacy advice.
  - Expandable Q&A.
  - Navigation link that opens directly at the Q&A section.
- Git ignores local environment/key files and build/dependency folders.
- Production build verified successfully.
One distinction: the original demo products are local display data, so only real-life listings that are stored inside Supabase can persist, be owned, or be deleted.

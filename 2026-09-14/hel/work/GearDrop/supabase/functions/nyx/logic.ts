// Pure helpers for the nyx Edge Function (no Deno APIs, so vitest can test them).

export const DAILY_LIMIT = 20;
export const MAX_HISTORY = 20;       // earlier turns sent with each question
export const MAX_TEXT = 1500;        // per question / per history message
export const MAX_CATALOG = 400;
export const CATEGORIES = ["PC/Laptops", "Keyboards", "Mouses", "Mics", "Headsets"] as const;

export type CatalogItem = {
  id: number; name: string; category: string; price: number; condition: string;
  status: string; description: string; specs: Record<string, string>; missing: string[];
  seller: string; demo: boolean;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);

// The catalog comes from the browser (it's the same public data shown on the
// page), so it's cleaned and capped rather than trusted.
export function sanitizeCatalog(input: unknown): CatalogItem[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_CATALOG).flatMap((x): CatalogItem[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const price = Number(o.price);
    if (!Number.isFinite(o.id as number) || !Number.isFinite(price)) return [];
    const specs: Record<string, string> = {};
    if (o.specs && typeof o.specs === "object") for (const [k, v] of Object.entries(o.specs).slice(0, 12)) specs[str(k, 40)] = str(v, 120);
    return [{
      id: Number(o.id), name: str(o.name, 120), category: str(o.category, 20), price,
      condition: str(o.condition, 20), status: str(o.status, 20), description: str(o.description, 600),
      specs, missing: Array.isArray(o.missing) ? o.missing.slice(0, 8).map(m => str(m, 80)) : [],
      seller: str(o.seller, 40), demo: o.demo === true,
    }];
  });
}

export type SearchArgs = { category?: string; max_price?: number; min_price?: number; keywords?: string; include_unavailable?: boolean; sort?: "price_asc" | "price_desc" };

// Deterministic filtering, so budgets and availability are never "guessed"
// by the model: whatever it recommends has to come from these results.
export function searchListings(catalog: CatalogItem[], args: SearchArgs) {
  const words = (args.keywords ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
  let hits = catalog.filter(x =>
    (!args.category || x.category === args.category) &&
    (args.max_price == null || x.price <= args.max_price) &&
    (args.min_price == null || x.price >= args.min_price) &&
    (args.include_unavailable || x.status === "Available"));
  if (words.length) {
    const scored = hits.map(x => {
      const hay = `${x.name} ${x.description} ${Object.entries(x.specs).flat().join(" ")}`.toLowerCase();
      return { x, score: words.filter(w => hay.includes(w)).length };
    });
    // Keywords rank results; they only filter when something actually matched.
    const matched = scored.filter(s => s.score > 0);
    hits = (matched.length ? matched : scored).sort((a, b) => b.score - a.score).map(s => s.x);
  }
  if (args.sort === "price_asc") hits = [...hits].sort((a, b) => a.price - b.price);
  if (args.sort === "price_desc") hits = [...hits].sort((a, b) => b.price - a.price);
  // Specs and missing info are included so the model never has to guess them.
  return { total: hits.length, results: hits.slice(0, 12).map(x => ({ id: x.id, name: x.name, category: x.category, price: x.price, condition: x.condition, status: x.status, demo: x.demo, specs: x.specs, missing: x.missing })) };
}

export function getListing(catalog: CatalogItem[], id: number) {
  return catalog.find(x => x.id === id) ?? { error: "No listing with that id." };
}

// OpenAI-style tool definitions (used by GitHub Models, Groq, OpenRouter...).
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_listings",
      description: "Search GearDrop's current listings. Always use this before recommending or naming any listing. Only returns Available listings unless include_unavailable is true.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...CATEGORIES], description: "Product category" },
          max_price: { type: "number", description: "Budget ceiling in USD" },
          min_price: { type: "number", description: "Minimum price in USD" },
          keywords: { type: "string", description: "Words to rank by, e.g. 'wireless lightweight' or 'RTX'" },
          include_unavailable: { type: "boolean", description: "Include Reserved and Sold listings" },
          sort: { type: "string", enum: ["price_asc", "price_desc"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_listing",
      description: "Get the full details (description, specs, missing information) of one listing by id.",
      parameters: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
    },
  },
];

export type Mode = "general" | "listing" | "compare";

export function systemPrompt(mode: Mode, focus: CatalogItem[]): string {
  const base = `You are Nyx, the AI assistant of GearDrop, a marketplace for second-hand gaming gear (PC/Laptops, Keyboards, Mouses, Mics, Headsets).

How to answer:
- Write for gamers: short, simple, friendly. Plain words; explain any tech term in a few words (e.g. "VRAM = the GPU's own memory"). Aim for under 180 words unless the user asks for detail.
- Formatting: short paragraphs and "- " bullet points only. **Bold** is fine. Never use tables or # headings.
- Only name real-world products, models or prices from general knowledge when you are sure they are correct; otherwise describe what to look for instead.
- Be conservative with performance and battery claims (e.g. gaming on a laptop battery is usually only 1-2 hours) and say they vary.
- You know PC and laptop hardware (CPUs, GPUs, RAM, storage, PSUs, cooling, displays), keyboards (switches, layouts), mice (sensors, weight, shape), mics (dynamic vs condenser, USB vs XLR, pickup patterns) and headsets (drivers, wireless, comfort). Use that knowledge freely for advice.

Rules about listings (very important):
- Never invent listings, prices, or specs. Before naming or recommending any GearDrop listing, call search_listings, and use get_listing for details.
- Only state a listing's specs exactly as they appear in its data (CPU, GPU, RAM, storage, weight...). If a spec isn't in the data, say it isn't listed; never fill it in.
- Only mention GearDrop features that exist: browsing by category, search, listing details, comparing two models, messaging sellers, offers and PayNow in chat, and reviews. There are no other filters, toggles or listing types, so never tell users to use one.
- Only recommend listings returned by your searches. Respect the user's budget exactly: never suggest something over it.
- Recommend Available listings. Mention Reserved/Sold only if asked, and say they can't be bought now.
- If nothing fits, say so honestly, then suggest what to look for or how to adjust (e.g. a higher budget or a different category). Never imply other listings exist unless your searches returned them; if you want to suggest a higher budget, search that range first.
- When a listing is missing key info (shown in "missing"), tell the user to ask the seller about it.
- Listings with demo=true are sample listings: say they're demos and can't be bought or messaged. Never suggest messaging or making an offer to a demo listing's seller. If demo listings are the only matches, still list them (name, price, link) so the user can see what's there, and say they're demos.
- Every time you mention a GearDrop listing (including demo listings), write its link as [[listing:ID]] right after its name, e.g. "Logitech G305 [[listing:13]]".
- Separate what the listing says from general knowledge ("The listing says 16 GB RAM; in general that's plenty for gaming.").
- Prices are in USD.

Scope: help with anything about gear, setups, buying and selling, trading safely and using GearDrop. Politely decline requests unrelated to that or that could cause harm, in one sentence. Never ask for or repeat passwords, bank details or other personal data.`;
  if (mode === "listing" && focus[0]) return `${base}\n\nThe user is looking at this listing and asking about it:\n${JSON.stringify(focus[0])}`;
  if (mode === "compare" && focus.length === 2) return `${base}\n\nThe user is comparing these two listings. Compare them clearly with bullet points and say which suits what kind of player:\n${JSON.stringify(focus)}`;
  return base;
}

export type Turn = { role: "user" | "nyx"; text: string };
export function sanitizeHistory(input: unknown): Turn[] {
  if (!Array.isArray(input)) return [];
  return input.slice(-MAX_HISTORY).flatMap((t): Turn[] => {
    if (!t || typeof t !== "object") return [];
    const o = t as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "nyx") return [];
    const text = str(o.text, MAX_TEXT).trim();
    return text ? [{ role: o.role, text }] : [];
  });
}

// Only [[listing:ID]] references to real catalog ids survive; anything else
// the model wrote in that shape is dropped.
export function cleanCitations(answer: string, catalog: CatalogItem[]): string {
  const ids = new Set(catalog.map(x => x.id));
  return answer.replace(/\[\[listing:(\d+)\]\]/g, (m, id) => ids.has(Number(id)) ? m : "");
}

import type { Category, Listing } from "./data";
import { categories } from "./data";

const CATEGORY_NAMES = categories.map(c => c.name);
const CONDITIONS: Listing["condition"][] = ["Like new", "Good", "Fair"];
const MAX_PRICE = 100_000;

export type ListingDraft = {
  seller: string;
  name: string;
  category: string;
  price: string;
  condition: string;
  description: string;
  details: string;
};

export type ValidatedListing = {
  seller: string;
  name: string;
  category: Category;
  price: number;
  condition: Listing["condition"];
  description: string;
};

// Mirrors the DB check constraints in supabase-setup.sql so obviously-invalid
// submissions are rejected before a network round trip, instead of only
// surfacing as a raw Postgres error after the fact.
export function validateListing(draft: ListingDraft): { value: ValidatedListing } | { error: string } {
  const seller = draft.seller.trim();
  const name = draft.name.trim();
  const description = draft.description.trim();
  const price = Number(draft.price);

  if (!seller || seller.length > 40) return { error: "Seller username must be between 1 and 40 characters." };
  if (!name || name.length > 120) return { error: "Product name must be between 1 and 120 characters." };
  if (!CATEGORY_NAMES.includes(draft.category as Category)) return { error: "Choose a valid category." };
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) return { error: `Price must be a number between 1 and ${MAX_PRICE}.` };
  if (!CONDITIONS.includes(draft.condition as Listing["condition"])) return { error: "Choose a valid condition." };
  if (!description || description.length > 2000) return { error: "Description must be between 1 and 2000 characters." };

  return { value: { seller, name, category: draft.category as Category, price, condition: draft.condition as Listing["condition"], description } };
}

// Only http(s) image sources are ever rendered — blocks javascript:/data:/vbscript:
// URIs from reaching an <img src>, even though modern browsers already refuse to
// execute script through that attribute. Defense in depth for the day a seller-
// supplied image URL field is added (see PLAN.md Phase 4).
const SAFE_IMAGE_SCHEME = /^https?:\/\//i;

export function safeImageUrl(url: string, fallback = "/placeholder-product.svg"): string {
  return SAFE_IMAGE_SCHEME.test(url) ? url : fallback;
}

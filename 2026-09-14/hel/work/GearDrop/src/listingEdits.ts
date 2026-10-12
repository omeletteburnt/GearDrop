import type { Listing } from "./data";
export type ListingEdit = Pick<Listing, "price" | "status" | "specs">;
export function validateListingEdit(price: string, status: string, rows: [string,string][]): ListingEdit {
  const amount = Number(price);
  if (!price.trim() || !Number.isFinite(amount) || amount <= 0 || amount > 100_000 || Math.abs(Math.round(amount*100)-amount*100)>1e-6) throw new Error("Enter a price above 0 and up to 100,000, with at most two decimal places.");
  if (!["Available","Reserved","Sold"].includes(status)) throw new Error("Choose a valid listing status.");
  const entries = rows.filter(([k,v])=>k.trim() || v.trim()).map(([k,v])=>[k.trim(),v.trim()] as [string,string]);
  if (entries.length>12 || entries.some(([k,v])=>!k || !v || k.length>40 || v.length>120)) throw new Error("Use up to 12 specifications, with names up to 40 and values up to 120 characters.");
  if (new Set(entries.map(([k])=>k.toLowerCase())).size!==entries.length) throw new Error("Each specification needs a unique name.");
  const specs = Object.fromEntries(entries);
  if (new TextEncoder().encode(JSON.stringify(specs)).length>3000) throw new Error("The specifications are too long. Please shorten them.");
  return { price: amount, status: status as Listing["status"], specs };
}

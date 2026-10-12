import type { Listing } from "./data";
import type { Persona, Platform } from "./preferences";

export function personaScore(item: Listing, persona: Persona, platform: Platform): number {
  if (persona === "default") return 0;
  const text = `${item.name} ${item.description} ${Object.values(item.specs).join(" ")}`.toLowerCase();
  let score = 0;
  if (persona === "competitive") {
    if (["Mouses", "Keyboards"].includes(item.category)) score += 30;
    if (/lightweight|wireless|rapid trigger|60%|75%|\b(144|165|240|360)\s*hz/.test(text)) score += 12;
  } else if (persona === "creator") {
    if (["Mics", "Headsets"].includes(item.category)) score += 30;
    if (/usb|xlr|cardioid|rgb/.test(text)) score += 12;
  } else if (persona === "casual") {
    if (item.category === "Headsets" || /laptop/i.test(item.name)) score += 30;
    if (/comfort|wireless|battery/.test(text)) score += 12;
  } else {
    score += 30 / (1 + item.price / 100);
    if (item.condition !== "Fair") score += 5;
    if (item.category === "PC/Laptops") score += 5;
  }
  const compat = (item.specs.Platform ?? "").toLowerCase();
  if (platform && (compat.includes(platform) || (compat.includes("console") && ["playstation", "xbox", "switch"].includes(platform)))) score += 8;
  return score;
}

export function personalizeListings(items: Listing[], persona: Persona, platform: Platform): Listing[] {
  if (persona === "default") return items;
  const order = { Available: 0, Reserved: 1, Sold: 2 };
  return [...items].sort((a,b)=>order[a.status]-order[b.status] || personaScore(b,persona,platform)-personaScore(a,persona,platform));
}

export function rank(item: Listing, need: string) {
  const text = (item.name + " " + item.description + " " + Object.values(item.specs).join(" ")).toLowerCase();
  let points = item.status === "Available" ? 3 : -4;
  need.toLowerCase().split(" ").forEach(word => { if (word.length > 2 && text.includes(word)) points += 2; });
  const money = need.match(/(\d+)/);
  if (money) points += item.price <= Number(money[1]) ? 4 : -3;
  return points;
}

import type { Listing } from "./data";

export function rank(item: Listing, need: string) {
  const text = (item.name + " " + item.description + " " + Object.values(item.specs).join(" ")).toLowerCase();
  let points = item.status === "Available" ? 3 : -4;
  need.toLowerCase().split(" ").forEach(word => { if (word.length > 2 && text.includes(word)) points += 2; });
  const money = need.match(/(\d+)/);
  if (money) points += item.price <= Number(money[1]) ? 4 : -3;
  return points;
}

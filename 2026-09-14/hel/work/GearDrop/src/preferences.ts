export const PERSONAS = ["default", "competitive", "creator", "casual", "budget"] as const;
export const PLATFORMS = ["pc", "playstation", "xbox", "switch", "mac"] as const;
export type Persona = typeof PERSONAS[number];
export type Platform = typeof PLATFORMS[number] | "";
export type Preferences = { persona: Persona; platform: Platform };
export const DEFAULT_PREFERENCES: Preferences = { persona: "default", platform: "" };
export function validPreferences(input: unknown): Preferences {
  const p = input as Partial<Preferences> | null;
  return { persona: PERSONAS.includes(p?.persona as Persona) ? p!.persona! : "default", platform: PLATFORMS.includes(p?.platform as Exclude<Platform, "">) ? p!.platform! : "" };
}
export const PERSONA_COPY = {
  default: { label: "All gamers", eyebrow: "SECOND-HAND. FIRST-CLASS.", title: "Your next loadout is already here.", description: "Pre-loved gaming gear, matched to the way you play.", greeting: "Hi Nyx! What can you help me with?", example: "Lightweight wireless mouse under $80 for FPS, what do you recommend?", scene: "photo-1527814050087-3793815479db" },
  competitive: { label: "Competitive setups", eyebrow: "EVERY MILLISECOND COUNTS.", title: "Gear up for your next win.", description: "Find responsive keyboards, lightweight mice and high-refresh setups.", greeting: "Hi Nyx! Help me find gear for competitive gaming.", example: "What lightweight mouse and rapid-trigger keyboard can I find?", scene: "photo-1587829741301-dc798b83add3" },
  creator: { label: "Creator setups", eyebrow: "LOOK AND SOUND THE PART.", title: "Make your setup stream-ready.", description: "Explore microphones, headsets and gear for your next creation.", greeting: "Hi Nyx! Help me improve my streaming setup.", example: "What microphone would suit streaming and voice recording?", scene: "photo-1590602847861-f357a9332bbc" },
  casual: { label: "Casual setups", eyebrow: "YOUR COMFY CORNER, UPGRADED.", title: "Settle in for your next adventure.", description: "Discover comfortable headsets and relaxed gaming setups.", greeting: "Hi Nyx! Help me build a comfortable gaming setup.", example: "What comfortable wireless headset can I find?", scene: "photo-1505740420928-5e560c06d30e" },
  budget: { label: "Budget setups", eyebrow: "PRO-LEVEL GEAR, SECOND-HAND PRICES.", title: "More play for your budget.", description: "Find affordable gear in good condition, with honest listing details.", greeting: "Hi Nyx! Help me get good value on a budget.", example: "What available gaming gear gives the best value under $100?", scene: "photo-1587202372775-e229f172b9d7" },
};

export function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
export function writeStored(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function favoriteKey(id: number, databaseId?: number): string { return databaseId ? `listing:${databaseId}` : `demo:${id}`; }
export function validFavorites(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === "string" && /^(listing|demo):[1-9]\d*$/.test(x)))].slice(0,1000) : [];
}

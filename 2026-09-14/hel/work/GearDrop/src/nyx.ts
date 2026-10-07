import { supabase } from "./supabase";
import type { Listing } from "./data";

export type NyxTurn = { role: "user" | "nyx"; text: string };
export type NyxMode = "general" | "listing" | "compare";
export const NYX_DAILY_LIMIT = 20;
export const MAX_IMPORTED_TURNS = 40;

// The listings currently on the page, in the compact shape the Edge Function
// expects. Demo (starter) listings are included but flagged.
export function toCatalog(items: Listing[]) {
  return items.map(x => ({ id: x.id, name: x.name, category: x.category, price: x.price, condition: x.condition, status: x.status, description: x.description, specs: x.specs, missing: x.missing, seller: x.seller, demo: !x.databaseId }));
}

export type NyxReply = { answer: string; remaining: number | null };

export async function askNyx(question: string, opts: { mode: NyxMode; items: Listing[]; focusIds?: number[]; history?: NyxTurn[] }): Promise<NyxReply> {
  const { data, error } = await supabase.functions.invoke("nyx", {
    body: { question, mode: opts.mode, focusIds: opts.focusIds ?? [], history: opts.history ?? [], catalog: toCatalog(opts.items) },
  });
  if (error) {
    // Non-2xx responses carry a friendly { error, remaining } body.
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    const e = new Error(body?.error ?? "Nyx couldn't answer right now. Please try again.") as Error & { remaining?: number };
    if (typeof body?.remaining === "number") e.remaining = body.remaining;
    throw e;
  }
  return { answer: String(data?.answer ?? ""), remaining: typeof data?.remaining === "number" ? data.remaining : null };
}

export async function nyxRemaining(): Promise<number | null> {
  const { data, error } = await supabase.rpc("nyx_remaining");
  return error || typeof data !== "number" ? null : data;
}

export async function sendNyxFeedback(userId: string, helpful: boolean, question: string, answer: string): Promise<void> {
  const { error } = await supabase.from("nyx_feedback").insert({ user_id: userId, helpful, question: question.slice(0, 1500), answer: answer.slice(0, 6000) });
  if (error) throw new Error("Could not send feedback.");
}

export type NyxStats = { questions_today: number; users_today: number; helpful_7d: number; unhelpful_7d: number };
export async function nyxStats(): Promise<NyxStats | null> {
  const { data } = await supabase.rpc("nyx_stats");
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

// ---------- [[listing:ID]] links in answers ----------
export type AnswerPiece = { text: string } | { listingId: number };
export function splitAnswer(answer: string): AnswerPiece[] {
  const out: AnswerPiece[] = [];
  let last = 0;
  for (const m of answer.matchAll(/\[\[listing:(\d+)\]\]/g)) {
    if (m.index! > last) out.push({ text: answer.slice(last, m.index) });
    out.push({ listingId: Number(m[1]) });
    last = m.index! + m[0].length;
  }
  if (last < answer.length) out.push({ text: answer.slice(last) });
  return out;
}

// ---------- save / resume as a Word (.doc) file ----------
// Word opens HTML saved with a .doc extension. The readable chat is the
// document body; an encoded copy rides along in a hidden element so Nyx can
// import it again exactly.
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
const readable = (t: string) => t.replace(/\[\[listing:\d+\]\]/g, "");

export function chatToDoc(turns: NyxTurn[], when = new Date()): string {
  const rows = turns.map(t => `<p><b>${t.role === "user" ? "You" : "Nyx"}:</b><br/>${escapeHtml(readable(t.text)).replace(/\n/g, "<br/>")}</p>`).join("\n");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Nyx chat</title></head><body style="font-family:Calibri,Arial,sans-serif">
<h1>Chat with Nyx (GearDrop)</h1>
<p>Saved ${escapeHtml(when.toLocaleString())}. To continue, open GearDrop, go to Ask Nyx and choose "Import chat".</p>
${rows}
<div style="display:none" id="nyx-chat-data" data-nyx="${toB64(JSON.stringify({ v: 1, turns }))}"></div>
</body></html>`;
}

export function chatFromDoc(html: string): NyxTurn[] {
  const raw = html.match(/id="nyx-chat-data" data-nyx="([A-Za-z0-9+/=]+)"/)?.[1];
  if (!raw) throw new Error("This file isn't a saved Nyx chat. If you edited it in Word, try the original download.");
  let parsed: unknown;
  try { parsed = JSON.parse(fromB64(raw)); } catch { throw new Error("This saved chat is damaged and can't be imported."); }
  const turns = (parsed as { turns?: unknown })?.turns;
  if (!Array.isArray(turns)) throw new Error("This saved chat is damaged and can't be imported.");
  return turns.slice(-MAX_IMPORTED_TURNS).flatMap((t): NyxTurn[] => {
    const o = t as Record<string, unknown>;
    return (o?.role === "user" || o?.role === "nyx") && typeof o.text === "string" && o.text.trim() ? [{ role: o.role, text: o.text.slice(0, 6000) }] : [];
  });
}

export function downloadChat(turns: NyxTurn[]): void {
  const url = URL.createObjectURL(new Blob([chatToDoc(turns)], { type: "application/msword" }));
  const a = document.createElement("a");
  a.href = url; a.download = `nyx-chat-${new Date().toISOString().slice(0, 10)}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

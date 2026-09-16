import { createClient, type Session } from "@supabase/supabase-js";
import type { Listing } from "./data";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// createClient() throws synchronously on an empty/malformed URL, which would
// crash the whole app at import time in any environment missing these vars
// (local dev without .env, CI, a misconfigured preview deploy). Falling back
// to a syntactically-valid placeholder keeps the app rendering; real calls
// against it simply fail over the network and are handled by each caller's
// existing try/catch, matching how the previous hand-rolled client degraded.
export const supabase = createClient(url || "https://placeholder.supabase.co", key || "placeholder-anon-key");
export type { Session };

export function getSession(): Promise<Session | null> {
  return supabase.auth.getSession().then(({ data }) => data.session);
}

export function onSessionChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

const identity = (username: string) => `${username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")}@nyx.local`;

// Known Supabase Auth error messages are re-worded so raw provider text
// (which can hint at account existence or internal state) never reaches the UI.
function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Incorrect username or password.";
  if (/already registered|already exists/i.test(message)) return "That username is already taken.";
  if (/password/i.test(message) && /short|weak|least/i.test(message)) return "Password must be at least 6 characters.";
  return "Something went wrong. Please try again.";
}

async function ensureProfile(session: Session, username: string) {
  const { error } = await supabase.from("profiles").upsert({ id: session.user.id, username });
  if (error) throw new Error(error.code === "23505" ? "That username is already taken." : "Could not create your seller profile.");
}

export async function signUp(username: string, password: string): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({ email: identity(username), password });
  if (error) throw new Error(friendlyAuthError(error.message));
  if (data.session) await ensureProfile(data.session, username);
  return data.session;
}

export async function signIn(username: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: identity(username), password });
  if (error) throw new Error(friendlyAuthError(error.message));
  await ensureProfile(data.session, username);
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function loadListings(): Promise<Listing[]> {
  if (!url || !key) return [];
  const { data, error } = await supabase
    .from("listings")
    .select("id,owner_id,name,category,price,condition,status,image,description,specs,missing,seller,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data.map((x: any) => ({ ...x, databaseId: x.id, ownerId: x.owner_id, posted: new Date(x.created_at).toLocaleDateString() }));
}

export async function saveListing(listing: Omit<Listing, "id" | "posted">): Promise<Listing> {
  const { data, error } = await supabase.from("listings").insert(listing).select().single();
  if (error) throw new Error("Supabase could not save this listing. Please check your details and try again.");
  return { ...data, databaseId: data.id, ownerId: data.owner_id, posted: "Just now" } as Listing;
}

export async function deleteListing(databaseId: number) {
  const { error, count } = await supabase.from("listings").delete({ count: "exact" }).eq("id", databaseId);
  if (error) throw new Error("Could not remove this listing.");
  if (!count) throw new Error("You don't have permission to remove this listing.");
}

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

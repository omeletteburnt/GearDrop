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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmailLike = (value: string) => EMAIL_RE.test(value.trim());

// Legacy accounts created before real-email sign-up existed still have a
// synthesized "username@nyx.local" address on file in auth.users — nothing
// needs to migrate, since email_for_username() just returns whatever email
// is actually on record, real or synthesized, and Supabase doesn't care
// which as long as it matches at sign-in time.
async function resolveEmailForIdentifier(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (isEmailLike(trimmed)) return trimmed.toLowerCase();
  const { data, error } = await supabase.rpc("email_for_username", { lookup_username: trimmed });
  if (error || !data) return null;
  return data as string;
}

// Known Supabase Auth error messages are re-worded so raw provider text
// (which can hint at account existence or internal state) never reaches the
// UI — EXCEPT password-policy messages (length, leaked/weak-password check,
// etc.), which are passed through verbatim. Supabase's own wording there is
// already accurate and safe to show; a previous version of this function
// rewrote every such message to a hardcoded "at least 6 characters," which
// was simply wrong once (or if) the project's real policy differs — e.g.
// this project's actual Auth minimum is 12 characters, not 6, so real
// "should be at least 12 characters" errors were being overwritten with an
// incorrect number. Never hardcode a guess at a server-side policy value;
// only the server actually knows what the policy is.
export function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Incorrect username/email or password.";
  if (/already registered|already exists/i.test(message)) return "That email is already registered.";
  if (/password/i.test(message)) return message;
  return "Something went wrong. Please try again.";
}

async function ensureProfile(session: Session, username: string) {
  const { error } = await supabase.from("profiles").upsert({ id: session.user.id, username });
  if (error) throw new Error(error.code === "23505" ? "That username is already taken." : "Could not create your seller profile.");
}

export async function signUp(username: string, email: string, password: string): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(friendlyAuthError(error.message));
  if (data.session) await ensureProfile(data.session, username);
  return data.session;
}

// `identifier` may be a username or a real email — resolved transparently.
export async function signIn(identifier: string, password: string): Promise<Session> {
  const trimmed = identifier.trim();
  const signedInWithEmailDirectly = isEmailLike(trimmed);
  const email = await resolveEmailForIdentifier(trimmed);
  if (!email) throw new Error("No account found with that username or email.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error.message));
  // Self-heals a profile row that failed to get created during signup — but
  // only when we already know the *real* username (i.e. that's what they
  // typed to sign in), never when they signed in with an email, since we
  // have no way to know their intended username in that case and must not
  // clobber a real one with the email string.
  if (!signedInWithEmailDirectly) await ensureProfile(data.session, trimmed);
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

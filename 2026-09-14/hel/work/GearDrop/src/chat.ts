import { supabase } from "./supabase";
import { decryptBytes, decryptMessage, deriveConversationKey, encryptBytes, encryptMessage, generateKeyMaterial, unwrapPrivateKey, wrapPrivateKey, type WrappedKey } from "./crypto";
import { isPayload, SAFE_IMAGE_TYPES, SAFE_VIDEO_TYPES, type Payload } from "./deal";

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const BUCKET = "chat-media";

// ---------- local private key (IndexedDB) ----------
// The private key is stored as a non-extractable CryptoKey: page scripts can
// use it to decrypt, but can never read its raw bytes back out.
type StoredKey = { privateKey: CryptoKey; publicJwk: JsonWebKey };

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("geardrop-chat", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const req = run(conn.transaction("keys", mode).objectStore("keys"));
    req.onsuccess = () => { resolve(req.result as T); conn.close(); };
    req.onerror = () => { reject(req.error); conn.close(); };
  });
}
const getLocalKey = (userId: string) => idb<StoredKey | undefined>("readonly", s => s.get(userId));
const putLocalKey = (userId: string, key: StoredKey) => idb("readwrite", s => s.put(key, userId));
export const clearLocalKeys = () => idb("readwrite", s => s.clear()).catch(() => undefined);

const sameJwk = (a: JsonWebKey, b: JsonWebKey) => a.x === b.x && a.y === b.y && a.crv === b.crv;

async function fetchPublicKey(userId: string): Promise<JsonWebKey | null> {
  const { data } = await supabase.from("public_keys").select("public_key").eq("user_id", userId).maybeSingle();
  return (data?.public_key as JsonWebKey | undefined) ?? null;
}

// Called whenever the user's password is in hand (sign-in, sign-up, unlock).
// Restores the key from the password-wrapped backup, or creates a new key
// pair the first time. Throws "Incorrect password." if the backup can't be
// unwrapped.
export async function setupChatKeys(userId: string, password: string): Promise<void> {
  const [local, published, backupRes] = await Promise.all([
    getLocalKey(userId).catch(() => undefined),
    fetchPublicKey(userId),
    supabase.from("key_backups").select("wrapped_key,salt,iv").eq("user_id", userId).maybeSingle(),
  ]);
  if (local && published && sameJwk(local.publicJwk, published)) return;
  const backup = backupRes.data as WrappedKey | null;
  if (published && backup) {
    let privateKey: CryptoKey;
    try { privateKey = await unwrapPrivateKey(backup, password); } catch { throw new Error("Incorrect password."); }
    await putLocalKey(userId, { privateKey, publicJwk: published });
    return;
  }
  // First time (or a half-finished earlier setup): create a new pair. The
  // backup is written before the public key so a key is never published
  // without a way to restore it.
  const material = await generateKeyMaterial();
  const wrapped = await wrapPrivateKey(material.pkcs8, password);
  const b = await supabase.from("key_backups").upsert({ user_id: userId, ...wrapped });
  if (b.error) throw new Error("Could not back up your chat key.");
  const p = await supabase.from("public_keys").upsert({ user_id: userId, public_key: material.publicJwk });
  if (p.error) throw new Error("Could not publish your chat key.");
  await putLocalKey(userId, { privateKey: material.privateKey, publicJwk: material.publicJwk });
}

export async function hasChatKey(userId: string): Promise<boolean> {
  const [local, published] = await Promise.all([getLocalKey(userId).catch(() => undefined), fetchPublicKey(userId)]);
  return Boolean(local && published && sameJwk(local.publicJwk, published));
}

// For sessions restored without a password (e.g. reopening the tab): the
// password is re-checked with Supabase before it is used for the key backup,
// so a typo can never wrap a new key with the wrong password.
export async function unlockChat(email: string, userId: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Incorrect password.");
  await setupChatKeys(userId, password);
}

// ---------- conversations ----------
export type Conversation = {
  id: string; listing_id: number; buyer_id: string; seller_id: string;
  last_message_at: string | null; last_sender_id: string | null;
  listing: { name: string; price: number; image: string } | null;
  buyer: { username: string } | null; seller: { username: string } | null;
};
const CONVERSATION_COLUMNS = "id,listing_id,buyer_id,seller_id,last_message_at,last_sender_id,listing:listings(name,price,image),buyer:profiles!conversations_buyer_id_fkey(username),seller:profiles!conversations_seller_id_fkey(username)";

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.from("conversations").select(CONVERSATION_COLUMNS).order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
  if (error) throw new Error("Could not load your messages.");
  return data as unknown as Conversation[];
}

export async function openConversation(listingId: number): Promise<Conversation> {
  const existing = await supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("listing_id", listingId).eq("buyer_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
  if (existing.data) return existing.data as unknown as Conversation;
  const { data, error } = await supabase.from("conversations").insert({ listing_id: listingId }).select(CONVERSATION_COLUMNS).single();
  if (error) throw new Error(/yourself/i.test(error.message) ? "This is your own listing." : "Could not start this conversation.");
  return data as unknown as Conversation;
}

const keyCache = new Map<string, CryptoKey>();
// Null when the other person hasn't set up secure chat yet (they haven't
// signed in since chat launched), so there's no public key to encrypt to.
export async function conversationKey(conv: Conversation, myId: string): Promise<CryptoKey | null> {
  const cached = keyCache.get(conv.id);
  if (cached) return cached;
  const mine = await getLocalKey(myId);
  if (!mine) return null;
  const theirs = await fetchPublicKey(myId === conv.buyer_id ? conv.seller_id : conv.buyer_id);
  if (!theirs) return null;
  const key = await deriveConversationKey(mine.privateKey, theirs, conv.id);
  keyCache.set(conv.id, key);
  return key;
}
export const forgetConversationKeys = () => keyCache.clear();

// ---------- messages ----------
type Row = { id: number; conversation_id: string; sender_id: string; ciphertext: string; iv: string; created_at: string };
export type ChatMessage = { id: number; senderId: string; createdAt: string; payload: Payload | null };

async function decode(row: Row, key: CryptoKey): Promise<ChatMessage> {
  let payload: Payload | null = null;
  try {
    const p = await decryptMessage(key, row.ciphertext, row.iv, row.conversation_id, row.sender_id);
    if (isPayload(p)) payload = p;
  } catch { /* undecryptable: shown as "can't be read" */ }
  return { id: row.id, senderId: row.sender_id, createdAt: row.created_at, payload };
}

export async function loadMessages(convId: string, key: CryptoKey, afterId = 0): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from("messages").select("id,conversation_id,sender_id,ciphertext,iv,created_at").eq("conversation_id", convId).gt("id", afterId).order("id").limit(1000);
  if (error) throw new Error("Could not load messages.");
  return Promise.all((data as Row[]).map(row => decode(row, key)));
}

export async function sendPayload(convId: string, key: CryptoKey, myId: string, payload: Payload): Promise<void> {
  const { ciphertext, iv } = await encryptMessage(key, payload, convId, myId);
  const { error } = await supabase.from("messages").insert({ conversation_id: convId, sender_id: myId, ciphertext, iv });
  if (error) throw new Error(/too quickly/i.test(error.message) ? "You are sending messages too quickly. Please wait a moment." : error.code === "42501" ? "You can't message this user." : "Message failed to send.");
}

// New messages arrive live. `onReconnect` fires immediately, on the first
// successful subscribe, and after every reconnect, so the caller can fetch anything that
// was sent while the connection was down.
// supabase.channel() returns the EXISTING channel when a name is reused, and
// listeners can't be added to an already-subscribed channel, so every
// subscription gets its own name.
const channelName = (base: string) => `${base}:${crypto.randomUUID()}`;

export function subscribeMessages(convId: string, key: CryptoKey, onMessage: (m: ChatMessage) => void, onReconnect: () => void): () => void {
  onReconnect();
  const channel = supabase.channel(channelName(`messages:${convId}`))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, payload => { decode(payload.new as Row, key).then(onMessage); })
    .subscribe(status => { if (status === "SUBSCRIBED") onReconnect(); });
  return () => { supabase.removeChannel(channel); };
}

// Calls onChange right away, on every change, and after every reconnect.
export function subscribeInbox(onChange: () => void): () => void {
  onChange();
  const channel = supabase.channel(channelName("inbox"))
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, onChange)
    .subscribe(status => { if (status === "SUBSCRIBED") onChange(); });
  return () => { supabase.removeChannel(channel); };
}

// ---------- media ----------
// Photos are re-drawn onto a canvas: this shrinks them and strips EXIF data
// (including GPS location) before encryption.
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs: white, not black, as JPEG
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not process this photo.")), "image/jpeg", 0.85));
}

export type PreparedMedia = { kind: "image" | "video"; blob: Blob; mime: string };
export async function prepareMedia(file: File): Promise<PreparedMedia> {
  if (file.size > MAX_MEDIA_BYTES) throw new Error("Files must be 25 MB or smaller.");
  if (file.type.startsWith("image/")) return { kind: "image", blob: await compressImage(file), mime: "image/jpeg" };
  if (SAFE_VIDEO_TYPES.includes(file.type)) return { kind: "video", blob: file, mime: file.type };
  throw new Error("Only photos and MP4 / WebM / MOV videos can be sent.");
}

export async function uploadMedia(convId: string, key: CryptoKey, myId: string, blob: Blob): Promise<string> {
  const encrypted = await encryptBytes(key, new Uint8Array(await blob.arrayBuffer()), convId, myId);
  const path = `${convId}/${crypto.randomUUID()}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, new Blob([encrypted], { type: "application/octet-stream" }), { contentType: "application/octet-stream" });
  if (error) throw new Error("Upload failed. Please try again.");
  return path;
}

const mediaCache = new Map<string, Promise<string>>();
// Returns a blob: URL for the decrypted file (cached per path).
export function mediaUrl(convId: string, key: CryptoKey, senderId: string, path: string, mime: string): Promise<string> {
  if (!path.startsWith(convId + "/")) return Promise.reject(new Error("Invalid media path."));
  // Second line of defence (isPayload already checks): never create a blob
  // with a type the browser could render as a page.
  if (![...SAFE_IMAGE_TYPES, ...SAFE_VIDEO_TYPES].includes(mime)) return Promise.reject(new Error("Unsupported file type."));
  let url = mediaCache.get(path);
  if (!url) {
    url = (async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error("Could not load this file.");
      const plain = await decryptBytes(key, new Uint8Array(await data.arrayBuffer()), convId, senderId);
      return URL.createObjectURL(new Blob([plain], { type: mime }));
    })();
    url.catch(() => mediaCache.delete(path));
    mediaCache.set(path, url);
  }
  return url;
}

// ---------- unread markers ----------
export async function loadReads(): Promise<Record<string, string>> {
  const { data } = await supabase.from("conversation_reads").select("conversation_id,last_read_at");
  return Object.fromEntries((data ?? []).map(r => [r.conversation_id, r.last_read_at]));
}
// Uses the server's last_message_at (not the local clock) so a device with a
// wrong clock can't hide or resurrect unread badges.
export async function markRead(conv: Conversation, myId: string, lastMessageAt: string): Promise<void> {
  await supabase.from("conversation_reads").upsert({ user_id: myId, conversation_id: conv.id, last_read_at: lastMessageAt });
}
export function isUnread(conv: Conversation, myId: string, reads: Record<string, string>): boolean {
  if (!conv.last_message_at || conv.last_sender_id === myId) return false;
  const read = reads[conv.id];
  return !read || new Date(conv.last_message_at) > new Date(read);
}

// ---------- blocking ----------
export async function blockedByMe(): Promise<string[]> {
  const { data } = await supabase.from("blocks").select("blocked_id");
  return (data ?? []).map(r => r.blocked_id as string);
}
export async function setBlocked(myId: string, otherId: string, blocked: boolean): Promise<void> {
  const { error } = blocked
    ? await supabase.from("blocks").insert({ blocker_id: myId, blocked_id: otherId })
    : await supabase.from("blocks").delete().eq("blocker_id", myId).eq("blocked_id", otherId);
  if (error) throw new Error(blocked ? "Could not block this user." : "Could not unblock this user.");
}

// ---------- held messages ("waiting to deliver") ----------
// Encrypted to the sender's own key (ECDH with their own public key), so only
// the sender can read them until they are re-encrypted for the recipient.
async function selfKey(myId: string, convId: string): Promise<CryptoKey | null> {
  const mine = await getLocalKey(myId).catch(() => undefined);
  return mine ? deriveConversationKey(mine.privateKey, mine.publicJwk, `held|${convId}`) : null;
}

export type HeldMessage = { id: number; createdAt: string; body: string | null };

export async function holdMessage(convId: string, myId: string, body: string): Promise<void> {
  const key = await selfKey(myId, convId);
  if (!key) throw new Error("Unlock secure chat first.");
  const { ciphertext, iv } = await encryptMessage(key, { t: "text", body }, convId, myId);
  const { error } = await supabase.from("pending_messages").insert({ conversation_id: convId, sender_id: myId, ciphertext, iv });
  if (error) throw new Error(/too many/i.test(error.message) ? "Too many messages waiting to deliver. Please wait until they've signed in." : error.code === "42501" ? "You can't message this user." : "Message failed to send.");
}

export async function loadHeld(convId: string, myId: string): Promise<HeldMessage[]> {
  const key = await selfKey(myId, convId);
  const { data } = await supabase.from("pending_messages").select("id,ciphertext,iv,created_at").eq("conversation_id", convId).eq("sender_id", myId).order("id");
  return Promise.all((data ?? []).map(async r => {
    let body: string | null = null;
    try { const p = key && await decryptMessage(key, r.ciphertext, r.iv, convId, myId); if (isPayload(p) && p.t === "text") body = p.body; } catch { /* unreadable */ }
    return { id: r.id as number, createdAt: r.created_at as string, body };
  }));
}

// Re-encrypts held messages for every conversation whose other person now
// has a key, sends them, then removes the held copies. Safe to call often:
// conversations still without a key are skipped and retried next time.
// Only one delivery run at a time per tab, so the app and an open chat
// window can't both send the same held message.
let delivering: Promise<number> | null = null;
export function deliverHeld(myId: string): Promise<number> {
  delivering ??= deliverHeldOnce(myId).finally(() => { delivering = null; });
  return delivering;
}
async function deliverHeldOnce(myId: string): Promise<number> {
  const { data } = await supabase.from("pending_messages").select("id,conversation_id,ciphertext,iv").eq("sender_id", myId).order("id");
  if (!data?.length) return 0;
  let delivered = 0;
  for (const convId of [...new Set(data.map(r => r.conversation_id as string))]) {
    const { data: conv } = await supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("id", convId).maybeSingle();
    const key = conv && await conversationKey(conv as unknown as Conversation, myId);
    const own = await selfKey(myId, convId);
    if (!key || !own) continue;
    for (const r of data.filter(row => row.conversation_id === convId)) {
      let payload: unknown = null;
      try { payload = await decryptMessage(own, r.ciphertext, r.iv, convId, myId); } catch { /* key changed: can never be delivered */ }
      if (isPayload(payload)) await sendPayload(convId, key, myId, payload);
      await supabase.from("pending_messages").delete().eq("id", r.id);
      delivered++;
    }
  }
  return delivered;
}

export async function incomingHeldCount(convId: string): Promise<number> {
  const { data } = await supabase.rpc("incoming_pending_count", { conv: convId });
  return typeof data === "number" ? data : 0;
}

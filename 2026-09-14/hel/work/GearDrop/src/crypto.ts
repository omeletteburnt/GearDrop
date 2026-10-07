// End-to-end encryption for chat, built only on the browser's Web Crypto API.
//
// - Each user has an ECDH P-256 key pair. The public key is published; the
//   private key stays in the browser (IndexedDB, non-extractable) and is only
//   ever uploaded wrapped with a password-derived key (see wrapPrivateKey).
// - Each conversation gets its own AES-256-GCM key: ECDH(mine, theirs) ->
//   HKDF-SHA256 with the conversation id as `info`. Both sides derive the same
//   key and it never leaves the browser.
// - Every ciphertext is bound to `conversationId|senderId` as additional
//   authenticated data, so it can't be replayed into another conversation or
//   re-attributed to a different sender.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const ECDH: EcKeyImportParams = { name: "ECDH", namedCurve: "P-256" };
export const PBKDF2_ITERATIONS = 600_000;

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export type KeyMaterial = { privateKey: CryptoKey; publicJwk: JsonWebKey; pkcs8: Uint8Array<ArrayBuffer> };

// Generates a fresh pair. `pkcs8` is returned once so it can be wrapped for
// backup; the returned privateKey itself is re-imported as non-extractable.
export async function generateKeyMaterial(): Promise<KeyMaterial> {
  const pair = await subtle.generateKey(ECDH, true, ["deriveBits"]);
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const publicJwk = await subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: await importPrivateKey(pkcs8), publicJwk, pkcs8 };
}

export function importPrivateKey(pkcs8: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return subtle.importKey("pkcs8", pkcs8, ECDH, false, ["deriveBits"]);
}

export type WrappedKey = { wrapped_key: string; salt: string; iv: string };

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function wrapPrivateKey(pkcs8: Uint8Array<ArrayBuffer>, password: string): Promise<WrappedKey> {
  const salt = randomBytes(16), iv = randomBytes(12);
  const wrapped = await subtle.encrypt({ name: "AES-GCM", iv }, await passwordKey(password, salt), pkcs8);
  return { wrapped_key: toBase64(new Uint8Array(wrapped)), salt: toBase64(salt), iv: toBase64(iv) };
}

// Throws if the password is wrong (AES-GCM authentication fails).
export async function unwrapPrivateKey(backup: WrappedKey, password: string): Promise<CryptoKey> {
  const key = await passwordKey(password, fromBase64(backup.salt));
  const pkcs8 = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: fromBase64(backup.iv) }, key, fromBase64(backup.wrapped_key)));
  return importPrivateKey(pkcs8);
}

export async function deriveConversationKey(myPrivateKey: CryptoKey, theirPublicJwk: JsonWebKey, conversationId: string): Promise<CryptoKey> {
  const theirs = await subtle.importKey("jwk", theirPublicJwk, ECDH, false, []);
  const shared = await subtle.deriveBits({ name: "ECDH", public: theirs }, myPrivateKey, 256);
  const hkdf = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("geardrop-chat-v1"), info: enc.encode(conversationId) }, hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const aad = (conversationId: string, senderId: string, kind: "msg" | "media") => enc.encode(`${kind}|${conversationId}|${senderId}`);

export async function encryptMessage(key: CryptoKey, payload: unknown, conversationId: string, senderId: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(conversationId, senderId, "msg") }, key, enc.encode(JSON.stringify(payload)));
  return { ciphertext: toBase64(new Uint8Array(ct)), iv: toBase64(iv) };
}

// Throws on wrong key, wrong conversation/sender, or any tampering.
export async function decryptMessage(key: CryptoKey, ciphertext: string, iv: string, conversationId: string, senderId: string): Promise<unknown> {
  const pt = await subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: aad(conversationId, senderId, "msg") }, key, fromBase64(ciphertext));
  return JSON.parse(dec.decode(pt));
}

// Media files are stored as IV (12 bytes) || AES-GCM ciphertext.
export async function encryptBytes(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>, conversationId: string, senderId: string): Promise<Uint8Array<ArrayBuffer>> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(conversationId, senderId, "media") }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}

export async function decryptBytes(key: CryptoKey, blob: Uint8Array<ArrayBuffer>, conversationId: string, senderId: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: blob.subarray(0, 12), additionalData: aad(conversationId, senderId, "media") }, key, blob.subarray(12)));
}

import { describe, expect, it } from "vitest";
import { decryptBytes, decryptMessage, deriveConversationKey, encryptBytes, encryptMessage, generateKeyMaterial, unwrapPrivateKey, wrapPrivateKey } from "../../src/crypto";

const CONV = "11111111-1111-4111-8111-111111111111";
const OTHER_CONV = "22222222-2222-4222-8222-222222222222";

async function pair() {
  const alice = await generateKeyMaterial();
  const bob = await generateKeyMaterial();
  const aliceKey = await deriveConversationKey(alice.privateKey, bob.publicJwk, CONV);
  const bobKey = await deriveConversationKey(bob.privateKey, alice.publicJwk, CONV);
  return { alice, bob, aliceKey, bobKey };
}

describe("chat encryption", () => {
  it("both sides derive the same key: alice encrypts, bob decrypts", async () => {
    const { aliceKey, bobKey } = await pair();
    const payload = { t: "offer", offerId: "x", amount: 70 };
    const { ciphertext, iv } = await encryptMessage(aliceKey, payload, CONV, "alice");
    expect(ciphertext).not.toContain("70");
    expect(await decryptMessage(bobKey, ciphertext, iv, CONV, "alice")).toEqual(payload);
  });

  it("private keys are non-extractable", async () => {
    const { alice } = await pair();
    expect(alice.privateKey.extractable).toBe(false);
  });

  it("fails with a third party's key", async () => {
    const { aliceKey, bob } = await pair();
    const eve = await generateKeyMaterial();
    const eveKey = await deriveConversationKey(eve.privateKey, bob.publicJwk, CONV);
    const { ciphertext, iv } = await encryptMessage(aliceKey, { t: "text", body: "hi" }, CONV, "alice");
    await expect(decryptMessage(eveKey, ciphertext, iv, CONV, "alice")).rejects.toThrow();
  });

  it("fails if replayed into another conversation or re-attributed to another sender", async () => {
    const { aliceKey, bobKey } = await pair();
    const { ciphertext, iv } = await encryptMessage(aliceKey, { t: "text", body: "hi" }, CONV, "alice");
    await expect(decryptMessage(bobKey, ciphertext, iv, OTHER_CONV, "alice")).rejects.toThrow();
    await expect(decryptMessage(bobKey, ciphertext, iv, CONV, "bob")).rejects.toThrow();
  });

  it("each conversation gets a different key", async () => {
    const { alice, bob, aliceKey } = await pair();
    const otherKey = await deriveConversationKey(bob.privateKey, alice.publicJwk, OTHER_CONV);
    const { ciphertext, iv } = await encryptMessage(aliceKey, { t: "text", body: "hi" }, CONV, "alice");
    await expect(decryptMessage(otherKey, ciphertext, iv, CONV, "alice")).rejects.toThrow();
  });

  it("detects tampered ciphertext", async () => {
    const { aliceKey, bobKey } = await pair();
    const { ciphertext, iv } = await encryptMessage(aliceKey, { t: "text", body: "hi" }, CONV, "alice");
    const tampered = (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1);
    await expect(decryptMessage(bobKey, tampered, iv, CONV, "alice")).rejects.toThrow();
  });

  it("encrypts media bytes and rejects tampering", async () => {
    const { aliceKey, bobKey } = await pair();
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250]);
    const enc = await encryptBytes(aliceKey, bytes, CONV, "alice");
    expect(Array.from(await decryptBytes(bobKey, enc, CONV, "alice"))).toEqual(Array.from(bytes));
    enc[enc.length - 1] ^= 1;
    await expect(decryptBytes(bobKey, enc, CONV, "alice")).rejects.toThrow();
  });

  it("password backup: right password restores a working key, wrong password fails", async () => {
    const alice = await generateKeyMaterial();
    const bob = await generateKeyMaterial();
    const backup = await wrapPrivateKey(alice.pkcs8, "correct horse battery");
    await expect(unwrapPrivateKey(backup, "wrong password!!")).rejects.toThrow();
    const restored = await unwrapPrivateKey(backup, "correct horse battery");
    const restoredKey = await deriveConversationKey(restored, bob.publicJwk, CONV);
    const bobKey = await deriveConversationKey(bob.privateKey, alice.publicJwk, CONV);
    const { ciphertext, iv } = await encryptMessage(bobKey, { t: "text", body: "still readable" }, CONV, "bob");
    expect(await decryptMessage(restoredKey, ciphertext, iv, CONV, "bob")).toEqual({ t: "text", body: "still readable" });
  }, 20_000);
});

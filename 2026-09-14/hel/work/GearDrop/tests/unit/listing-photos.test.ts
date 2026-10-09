import { describe, expect, it } from "vitest";
import { checkPhotoFiles, MAX_PHOTOS, photoPath } from "../../src/listingPhotos";

const jpg = (name: string, size = 1000) => ({ name, type: "image/jpeg", size });

describe("checkPhotoFiles", () => {
  it("accepts photos up to the limit of 5", () => {
    expect(MAX_PHOTOS).toBe(5);
    expect(checkPhotoFiles(0, [jpg("a"), jpg("b")])).toEqual({ ok: [0, 1], error: "" });
  });
  it("only adds as many as there's room for, and says why", () => {
    const r = checkPhotoFiles(4, [jpg("a"), jpg("b"), jpg("c")]);
    expect(r.ok).toEqual([0]);
    expect(r.error).toBe("Only 5 photos per listing.");
  });
  it("rejects files that aren't photos", () => {
    const r = checkPhotoFiles(0, [{ name: "notes.pdf", type: "application/pdf", size: 10 }, { name: "page.html", type: "text/html", size: 10 }, jpg("ok")]);
    expect(r.ok).toEqual([2]);
    expect(r.error).toBe("notes.pdf isn't a photo. page.html isn't a photo.");
  });
  it("rejects photos over 25 MB", () => expect(checkPhotoFiles(0, [jpg("huge", 26 * 1024 * 1024)]).error).toBe("huge is over 25 MB."));
  it("accepts phone formats (HEIC) and PNG / WebP", () =>
    expect(checkPhotoFiles(0, ["image/heic", "image/png", "image/webp"].map(type => ({ name: "x", type, size: 5 }))).ok).toEqual([0, 1, 2]));
});

describe("photoPath", () => {
  const base = "https://proj.supabase.co/storage/v1/object/public/listing-photos/";
  const user = "11111111-2222-3333-4444-555555555555", file = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg";
  it("finds the storage path of one of our uploads", () => expect(photoPath(base + `${user}/${file}`, base)).toBe(`${user}/${file}`));
  it("ignores stock photos and other sites", () => {
    expect(photoPath("https://images.unsplash.com/photo-1?w=900", base)).toBeNull();
    expect(photoPath("https://evil.example/listing-photos/" + `${user}/${file}`, base)).toBeNull();
  });
  it("refuses anything that isn't exactly <user>/<photo>.jpg (no tricks like ../)", () => {
    expect(photoPath(base + `${user}/../other/${file}`, base)).toBeNull();
    expect(photoPath(base + `${user}/${file}?x=1`, base)).toBeNull();
  });
});

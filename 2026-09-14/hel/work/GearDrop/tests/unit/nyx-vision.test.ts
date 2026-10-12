import { describe, expect, it, vi } from "vitest";
import { DAILY_LIMIT, listingDeviceType, mergeCatalog, requestedDeviceType, sanitizeCatalog, searchListings } from "../../supabase/functions/nyx/logic";
import { allowedPhoto, createPhotoInspector, MAX_PHOTO_LISTINGS, parsePhotoAssessment } from "../../supabase/functions/nyx/vision";
import { NYX_DAILY_LIMIT } from "../../src/nyx";

const base = "https://project.supabase.co";
const photo = `${base}/storage/v1/object/public/listing-photos/user/photo.jpg`;
const items = sanitizeCatalog([
  { id: 1, name: "Gaming PC", category: "PC/Laptops", price: 4000, status: "Available", image: photo },
  { id: 2, name: "Gaming laptop", category: "PC/Laptops", price: 3000, status: "Available" },
  { id: 3, name: "RTX 4090", category: "PC/Laptops", price: 4500, status: "Available" },
  { id: 4, name: "Desktop tower", category: "PC/Laptops", price: 6000, status: "Available" },
]);
const config = { baseUrl: "https://api.groq.com/openai/v1", apiKey: "test-key", model: "test-vision", supabaseUrl: base };
const response = (device_type = "desktop") => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ device_type, summary: "Visible computer body." }) } }] }));

describe("Nyx computer matching", () => {
  it("uses the same 15-question limit on the server and client", () => {
    expect(DAILY_LIMIT).toBe(15); expect(NYX_DAILY_LIMIT).toBe(15);
  });
  it("treats the user's $5000 PC request as desktop, not laptop", () => {
    expect(requestedDeviceType("Suggest me a PC for $5000")).toBe("desktop");
    expect(searchListings(items, { device_type: "desktop", max_price: 5000 }).results.map(x => x.id)).toEqual([1]);
    expect(searchListings(items, { device_type: "laptop", max_price: 5000 }).results.map(x => x.id)).toEqual([2]);
    expect(requestedDeviceType("Recommend a laptop")).toBe("laptop");
    expect(requestedDeviceType("PC or laptop, either is fine")).toBeUndefined();
    expect(requestedDeviceType("Suggest a headset for my PC")).toBeUndefined();
  });
  it("does not substitute laptops or unknown devices when no desktop fits", () => {
    expect(searchListings(items.slice(1), { device_type: "desktop", max_price: 5000 }).results).toEqual([]);
  });
  it("rejects conflicting/unclear photos, but classifies otherwise unknown listings", () => {
    const conflict = { ...items[0], photoAssessment: { status: "checked" as const, device_type: "laptop" as const, summary: "Hinged laptop." } };
    expect(listingDeviceType(conflict)).toBe("unknown");
    expect(searchListings([conflict], { device_type: "desktop" }).results).toEqual([]);
    expect(listingDeviceType({ ...items[0], photoAssessment: { ...conflict.photoAssessment, device_type: "unknown" } })).toBe("unknown");
    expect(listingDeviceType({ ...items[2], photoAssessment: { ...conflict.photoAssessment, device_type: "desktop" } })).toBe("desktop");
  });
  it("ignores client-forged real photos and photo assessments", () => {
    const merged = mergeCatalog([{ ...items[0], id: 1 }], [{ ...items[0], id: 1000001, image: "https://evil.example/x.jpg", photoAssessment: { status: "checked", device_type: "desktop" } }]);
    expect(merged[0].photos).toEqual([photo]); expect(merged[0].photoAssessment).toBeUndefined();
  });
});

describe("bounded Groq photo analysis", () => {
  it("allows public listing photos and demo hosts, rejecting private/arbitrary URLs", () => {
    expect(allowedPhoto(photo, base, false)).toBe(true);
    for (const url of ["http://127.0.0.1/a", "https://evil.example/a", `${base}/storage/v1/object/private/a`, `https://user:pass@project.supabase.co/storage/v1/object/public/listing-photos/a`, `${base}/storage/v1/object/public/listing-photos/%2e%2e/secret`]) expect(allowedPhoto(url, base, false)).toBe(false);
    expect(allowedPhoto("https://images.unsplash.com/photo.jpg", base, true)).toBe(true);
    expect(allowedPhoto("https://images.unsplash.com/photo.jpg", base, false)).toBe(false);
  });
  it("sends images to the same provider and reuses results within a question", async () => {
    const request = vi.fn(async () => response());
    const inspect = createPhotoInspector(config, request);
    const [a, b] = await Promise.all([inspect(items[0]), inspect(items[0])]);
    expect(a).toEqual(b); expect(a.status).toBe("checked"); expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${config.baseUrl}/chat/completions`);
    expect(JSON.parse(options.body as string).messages[1].content[1].image_url.url).toBe(photo);
    expect(JSON.parse(options.body as string).model).toBe("test-vision");
  });
  it("never sends more than six listing analyses per question", async () => {
    const request = vi.fn(async () => response()); const inspect = createPhotoInspector(config, request);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => inspect({ ...items[0], id: i })));
    expect(request).toHaveBeenCalledTimes(MAX_PHOTO_LISTINGS);
    expect(results.slice(MAX_PHOTO_LISTINGS).every(r => r.status === "unavailable")).toBe(true);
  });
  it("reports missing configuration, missing photos, provider failure and invalid JSON honestly", async () => {
    const request = vi.fn(async () => new Response("busy", { status: 429 }));
    expect((await createPhotoInspector({ ...config, model: "" }, request)(items[0])).status).toBe("unavailable");
    expect(request).not.toHaveBeenCalled();
    expect((await createPhotoInspector(config, request)(items[1])).status).toBe("unavailable");
    expect((await createPhotoInspector(config, request)(items[0])).status).toBe("unavailable");
    expect(parsePhotoAssessment('"not an assessment"').status).toBe("unavailable");
    expect(parsePhotoAssessment('{"device_type":"RTX 4090","summary":"guess"}').status).toBe("unavailable");
    expect(parsePhotoAssessment('{"device_type":"unknown","summary":"Blurry photo"}').status).toBe("checked");
  });
});

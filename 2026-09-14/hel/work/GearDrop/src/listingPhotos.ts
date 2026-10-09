import { compressImage } from "./chat";
import { supabase } from "./supabase";

// Listing photos: 1-5 per listing, uploaded to the public "listing-photos"
// bucket into the seller's own folder (<user id>/<random>.jpg). Each photo is
// re-drawn first, which shrinks it and strips hidden data such as GPS location.
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024; // before shrinking; the stored copy is far smaller
const BUCKET = "listing-photos";
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "image/avif"];

// Which of the picked files can be added, given how many photos are already there (unit-tested).
export function checkPhotoFiles(existing: number, files: { name: string; type: string; size: number }[]) {
  const room = Math.max(0, MAX_PHOTOS - existing);
  const ok: number[] = [], errors: string[] = [];
  files.forEach((f, i) => {
    if (!PHOTO_TYPES.includes(f.type)) errors.push(`${f.name} isn't a photo.`);
    else if (f.size > MAX_PHOTO_BYTES) errors.push(`${f.name} is over 25 MB.`);
    else if (ok.length >= room) { if (!errors.some(e => e.startsWith("Only"))) errors.push(`Only ${MAX_PHOTOS} photos per listing.`); }
    else ok.push(i);
  });
  return { ok, error: errors.join(" ") };
}

// The storage path of one of our uploaded photos, or null for anything else (unit-tested).
export function photoPath(url: string, base = publicBase()): string | null {
  if (!base || !url.startsWith(base)) return null;
  const path = url.slice(base.length);
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path) ? path : null;
}
function publicBase() {
  return supabase.storage.from(BUCKET).getPublicUrl("").data.publicUrl.replace(/\/?$/, "/");
}

export async function uploadListingPhoto(userId: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Photo upload failed. Please try again.");
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Best effort: unused photos are only clutter, never a reason to show an error.
export async function removeListingPhotos(urls: string[]): Promise<void> {
  const paths = urls.map(u => photoPath(u)).filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
}

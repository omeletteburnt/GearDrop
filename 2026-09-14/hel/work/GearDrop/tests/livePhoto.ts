import type { SupabaseClient } from "@supabase/supabase-js";

// For tests that create listings on the live project: listings need at least
// one photo from the seller's own folder in the listing-photos bucket.
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export async function testPhoto(db: SupabaseClient, userId: string): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const bytes = Uint8Array.from(atob(PNG_1PX), c => c.charCodeAt(0));
  const { error } = await db.storage.from("listing-photos").upload(path, new Blob([bytes], { type: "image/png" }), { contentType: "image/png" });
  if (error) throw error;
  return db.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;
}

export async function removeTestPhotos(db: SupabaseClient, urls: string[]) {
  const paths = urls.map(u => u.split("/listing-photos/")[1]).filter(Boolean);
  if (paths.length) await db.storage.from("listing-photos").remove(paths);
}

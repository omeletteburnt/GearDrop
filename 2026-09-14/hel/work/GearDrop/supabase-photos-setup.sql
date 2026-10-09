-- Listing photos. Run once in Supabase Dashboard > SQL Editor > New query,
-- AFTER all the other supabase-*.sql files. Safe to re-run.
--
-- Sellers upload 1-5 photos per listing into the public "listing-photos"
-- bucket, each into their own folder (<their user id>/...). The website
-- shrinks every photo and strips its hidden data (including GPS location)
-- before uploading. A listing's cover image is always its first photo.

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Anyone can view the photos (listings are public, served by public URL).
-- Only the owner can add or remove files in their own folder; admins can
-- remove any (to clean up after deleting someone's listing).
drop policy if exists "Owners read own listing photos" on storage.objects;
drop policy if exists "Owners upload listing photos" on storage.objects;
drop policy if exists "Owners delete listing photos" on storage.objects;
create policy "Owners read own listing photos" on storage.objects for select to authenticated
  using (bucket_id = 'listing-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "Owners upload listing photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owners delete listing photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- listings ----------
alter table public.listings add column if not exists photos text[] not null default '{}';

-- Where uploaded photos live (this project's public bucket URL).
create or replace function public.listing_photo_prefix() returns text
language sql immutable as $$
  select 'https://vtulwvjjvgbrgxqzeemi.supabase.co/storage/v1/object/public/listing-photos/'
$$;

-- At most 5 photos, every one from this project's bucket.
create or replace function public.listing_photos_ok(p text[]) returns boolean
language sql immutable as $$
  select cardinality(p) <= 5
    and coalesce(bool_and(u like public.listing_photo_prefix() || '%' and char_length(u) <= 300), true)
  from unnest(p) u
$$;
alter table public.listings drop constraint if exists listings_photos_ok;
alter table public.listings add constraint listings_photos_ok check (public.listing_photos_ok(photos)) not valid;

-- The cover image may now also be an uploaded photo (still never any other site).
alter table public.listings drop constraint if exists listings_image_host;
alter table public.listings add constraint listings_image_host check (
  (image like 'https://images.unsplash.com/%' or image like public.listing_photo_prefix() || '%')
  and char_length(image) <= 300) not valid;

-- New listings need at least one photo, photos must come from the seller's
-- own folder, and the cover is always the first photo.
create or replace function public.listing_photos_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and cardinality(new.photos) < 1 then
    raise exception 'Add at least one photo' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.photos) u
             where u not like public.listing_photo_prefix() || new.owner_id::text || '/%') then
    raise exception 'Photos must be your own uploads' using errcode = '42501';
  end if;
  if cardinality(new.photos) > 0 then new.image := new.photos[1]; end if;
  return new;
end $$;
-- Runs after listing_guard (alphabetical), so owner_id is already settled.
drop trigger if exists listing_photos_guard on public.listings;
create trigger listing_photos_guard before insert or update on public.listings
for each row execute function public.listing_photos_guard();
revoke execute on function public.listing_photos_guard() from public, anon, authenticated;

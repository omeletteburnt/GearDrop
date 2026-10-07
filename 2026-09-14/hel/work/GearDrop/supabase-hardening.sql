-- Security hardening. Run once in Supabase Dashboard > SQL Editor > New
-- query, AFTER all the other supabase-*.sql files. Safe to re-run.
--
-- New CHECK constraints are added NOT VALID: they apply to every new insert
-- and update, but don't fail on rows that already exist.

-- ---------- listings ----------
-- 1. Owners could change owner_id on update (no WITH CHECK), handing a
--    listing to someone else's account.
drop policy if exists "Owners update listings" on public.listings;
create policy "Owners update listings" on public.listings for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 2. "seller" was free text, so anyone could list as any username. It now
--    always comes from the owner's profile. Also keeps owner_id/created_at
--    fixed after creation (admins included).
create or replace function public.listing_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  select username into new.seller from public.profiles where id = new.owner_id;
  if new.seller is null then raise exception 'Create your profile before listing' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists listing_guard on public.listings;
create trigger listing_guard before insert or update on public.listings
for each row execute function public.listing_guard();

-- 3 + 4. Server-side limits matching the website's own validation. Images
--    are only ever the category photos from images.unsplash.com.
alter table public.listings drop constraint if exists listings_name_len;
alter table public.listings drop constraint if exists listings_description_len;
alter table public.listings drop constraint if exists listings_price_max;
alter table public.listings drop constraint if exists listings_image_host;
alter table public.listings drop constraint if exists listings_specs_shape;
alter table public.listings drop constraint if exists listings_missing_len;
alter table public.listings add constraint listings_name_len check (char_length(name) between 1 and 120) not valid;
alter table public.listings add constraint listings_description_len check (char_length(description) between 1 and 2000) not valid;
alter table public.listings add constraint listings_price_max check (price <= 100000) not valid;
alter table public.listings add constraint listings_image_host check (image like 'https://images.unsplash.com/%' and char_length(image) <= 300) not valid;
alter table public.listings add constraint listings_specs_shape check (jsonb_typeof(specs) = 'object' and pg_column_size(specs) <= 4000) not valid;
alter table public.listings add constraint listings_missing_len check (cardinality(missing) <= 10) not valid;

-- ---------- profiles ----------
drop policy if exists "Owners update profile" on public.profiles;
create policy "Owners update profile" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- Nyx feedback ----------
-- 5. At most 50 ratings a day per user.
create or replace function public.nyx_feedback_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.nyx_feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'Too much feedback today. Thanks, we have plenty!';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists nyx_feedback_limit on public.nyx_feedback;
create trigger nyx_feedback_limit before insert on public.nyx_feedback
for each row execute function public.nyx_feedback_limit();

-- ---------- chat media ----------
-- 6. Uploads are always encrypted bytes; refuse any other declared type.
update storage.buckets set allowed_mime_types = array['application/octet-stream'] where id = 'chat-media';

-- ---------- function permissions ----------
-- Supabase grants EXECUTE to everyone on new functions. Helper functions
-- only meant for policies/triggers are taken away from anonymous callers.
revoke execute on function public.is_conversation_participant(uuid) from public, anon;
revoke execute on function public.conversation_is_blocked(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.conversation_is_blocked(uuid) to authenticated;
revoke execute on function public.listing_guard() from public, anon, authenticated;
revoke execute on function public.nyx_feedback_limit() from public, anon, authenticated;

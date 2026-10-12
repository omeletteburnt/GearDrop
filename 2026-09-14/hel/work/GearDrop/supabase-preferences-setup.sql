-- Run in Supabase SQL Editor after the existing setup migrations. Re-runnable.
-- Preferences live separately because public profiles are readable by everyone.
begin;
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  persona text not null default 'default' check (persona in ('default','competitive','creator','casual','budget')),
  platform text not null default '' check (platform in ('','pc','playstation','xbox','switch','mac'))
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;
drop policy if exists "Own preferences" on public.user_preferences;
create policy "Own preferences" on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Website ids include demo ids and stable database ids, so users can star either.
create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_key text not null check (listing_key ~ '^(listing|demo):[1-9][0-9]*$' and char_length(listing_key) <= 40),
  primary key (user_id, listing_key)
);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon;
grant select, insert, delete on public.favorites to authenticated;
drop policy if exists "Own favorites" on public.favorites;
create policy "Own favorites" on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
commit;

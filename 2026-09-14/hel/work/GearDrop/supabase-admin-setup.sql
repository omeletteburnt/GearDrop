-- Run this after you create the Admin account in Supabase Authentication.
-- This securely stores admin membership separately from editable user profiles.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on public.admin_users from anon, authenticated;
grant execute on function public.is_admin() to authenticated;

create policy "Admins manage every listing"
on public.listings for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Find the Admin account's UUID in Authentication > Users, then run this once:
-- insert into public.admin_users (user_id) values ('PASTE-ADMIN-USER-UUID-HERE');

-- Update the display counter to match Nyx's 15-question rolling 24-hour limit.
-- Run in Supabase SQL Editor alongside deployment of the updated nyx function.
-- Existing usage records remain intact.
create or replace function public.nyx_remaining()
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, 15 - count(*)::int) from public.nyx_usage
   where user_id = auth.uid() and asked_at >= now() - interval '24 hours';
$$;
revoke execute on function public.nyx_remaining() from public, anon;
grant execute on function public.nyx_remaining() to authenticated;

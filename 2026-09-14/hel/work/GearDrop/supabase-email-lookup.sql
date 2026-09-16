-- Enables signing in with either a username or a real email address.
-- Run this once in Supabase Dashboard > SQL Editor > New query.
--
-- Why this exists: `profiles` is intentionally public-readable (username
-- only) and must stay that way — email must never be added as a column
-- there. This function is the one narrow, deliberate bridge: given a
-- username, it looks up the matching auth.users.email (auth.users is not
-- exposed via the REST API at all, so this is the only way the client can
-- ever learn an email from a username) and returns *only* that email, never
-- any other row/column. It runs as SECURITY DEFINER because anon/authenticated
-- have no read access to auth.users otherwise, and it must be callable by
-- anon since it runs before the user is authenticated (during sign-in).
--
-- Residual risk (accepted, not eliminated): this function is intentionally
-- an oracle for "does this username exist, and what email is behind it."
-- That is a real, deliberate privacy trade-off for the username-or-email
-- sign-in feature — same enumeration exposure the sign-up flow already has
-- via "that username is already taken", extended to also reveal the email
-- string itself. There is no rate limiting on it (no serverless proxy layer
-- exists in this client-only SPA); a determined caller could enumerate
-- usernames and harvest associated emails. Acceptable for this project's
-- threat model (a demo second-hand marketplace), but would need addressing
-- (e.g. rate limiting via a serverless proxy, or dropping username-based
-- sign-in) before this pattern is reused somewhere more sensitive.
create or replace function public.email_for_username(lookup_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(lookup_username)
  limit 1;
$$;

revoke execute on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

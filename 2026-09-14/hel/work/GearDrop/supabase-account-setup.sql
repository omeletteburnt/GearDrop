-- Lets a user remove the email from their own account.
-- Run this once in Supabase Dashboard > SQL Editor > New query. Safe to re-run.
--
-- Supabase Auth can only CHANGE an email to a new address that confirms it,
-- so removal is done here: the email is swapped for an undeliverable
-- placeholder (the same "@nyx.local" kind used for accounts created without
-- an email), and the user keeps signing in with their username.
--
-- Proof of ownership: the caller's current session must come from the
-- emailed sign-in link (JWT "amr" method otp/magiclink) within the last
-- 10 minutes. A stolen password alone can't remove someone's email.
create or replace function public.remove_my_email()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  placeholder text := 'user-' || gen_random_uuid() || '@nyx.local';
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
    where e ->> 'method' in ('otp', 'magiclink')
      and to_timestamp((e ->> 'timestamp')::bigint) > now() - interval '10 minutes'
  ) then
    raise exception 'Confirm using the link we emailed you first' using errcode = '42501';
  end if;

  update auth.users
     set email = placeholder,
         email_change = '',
         email_change_token_new = '',
         email_change_token_current = '',
         email_change_confirm_status = 0,
         updated_at = now()
   where id = uid;

  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', placeholder),
         updated_at = now()
   where user_id = uid and provider = 'email';
end $$;

revoke execute on function public.remove_my_email() from public, anon;
grant execute on function public.remove_my_email() to authenticated;

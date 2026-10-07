-- Clears Supabase Security Advisor warnings 0028/0029 ("SECURITY DEFINER
-- function executable by anon / authenticated").
-- Run once in Supabase Dashboard > SQL Editor > New query, AFTER every other
-- supabase-*.sql file. Safe to re-run. If you ever re-run an older setup
-- file, run this one again afterwards.
--
-- Pattern (recommended by Supabase): the privileged SECURITY DEFINER
-- function lives in a `private` schema that the API doesn't expose; the
-- public name becomes a thin SECURITY INVOKER wrapper calling it. RLS
-- policies and triggers point at the function itself (not its name), so
-- they keep working unchanged, and so does the website.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- ---------- 1. trigger-only functions: nobody may call them directly ----------
-- (Triggers still fire; EXECUTE is only checked when the trigger is created.)
revoke execute on function public.conversation_set_seller() from public, anon, authenticated;
revoke execute on function public.message_before_insert() from public, anon, authenticated;
revoke execute on function public.pending_before_insert() from public, anon, authenticated;
revoke execute on function public.review_before_insert() from public, anon, authenticated;

-- ---------- 2. callable functions: move to private, wrap in public ----------
do $$
declare
  f record;
begin
  for f in select * from (values
    ('is_admin', ''),
    ('is_conversation_participant', 'uuid'),
    ('conversation_is_blocked', 'uuid'),
    ('email_for_username', 'text'),
    ('incoming_pending_count', 'uuid'),
    ('nyx_remaining', ''),
    ('nyx_stats', ''),
    ('rating_summary', 'uuid[]'),
    ('reviews_for', 'uuid'),
    ('add_review_followup', 'bigint, smallint, text'),
    ('record_deal_step', 'uuid, text'),
    ('remove_my_email', ''),
    ('reply_to_review', 'bigint, text')
  ) as t(name, args)
  loop
    -- Move only once: if the public one is still the privileged original.
    if to_regprocedure(format('private.%I(%s)', f.name, f.args)) is null then
      execute format('alter function public.%I(%s) set schema private', f.name, f.args);
    elsif (select prosecdef from pg_proc where oid = to_regprocedure(format('public.%I(%s)', f.name, f.args))) then
      -- An older setup file re-created the privileged version in public:
      -- refresh the private copy from it, then the wrapper replaces it below.
      execute format('drop function private.%I(%s)', f.name, f.args);
      execute format('alter function public.%I(%s) set schema private', f.name, f.args);
    end if;
    execute format('revoke all on function private.%I(%s) from public', f.name, f.args);
  end loop;
end $$;

-- Who may run the privileged versions (through the wrappers / policies).
grant execute on function private.email_for_username(text) to anon, authenticated;
grant execute on function private.rating_summary(uuid[]) to anon, authenticated;
grant execute on function private.reviews_for(uuid) to anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_conversation_participant(uuid) to authenticated;
grant execute on function private.conversation_is_blocked(uuid) to authenticated;
grant execute on function private.incoming_pending_count(uuid) to authenticated;
grant execute on function private.nyx_remaining() to authenticated;
grant execute on function private.nyx_stats() to authenticated;
grant execute on function private.add_review_followup(bigint, smallint, text) to authenticated;
grant execute on function private.record_deal_step(uuid, text) to authenticated;
grant execute on function private.remove_my_email() to authenticated;
grant execute on function private.reply_to_review(bigint, text) to authenticated;

-- Thin public wrappers (same names and parameter names the website uses).
create or replace function public.is_admin() returns boolean
  language sql stable security invoker set search_path = '' as $$ select private.is_admin() $$;
create or replace function public.is_conversation_participant(conv uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select private.is_conversation_participant(conv) $$;
create or replace function public.conversation_is_blocked(conv uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$ select private.conversation_is_blocked(conv) $$;
create or replace function public.email_for_username(lookup_username text) returns text
  language sql stable security invoker set search_path = '' as $$ select private.email_for_username(lookup_username) $$;
create or replace function public.incoming_pending_count(conv uuid) returns integer
  language sql stable security invoker set search_path = '' as $$ select private.incoming_pending_count(conv) $$;
create or replace function public.nyx_remaining() returns int
  language sql stable security invoker set search_path = '' as $$ select private.nyx_remaining() $$;
create or replace function public.nyx_stats()
  returns table (questions_today int, users_today int, helpful_7d int, unhelpful_7d int)
  language sql stable security invoker set search_path = '' as $$ select * from private.nyx_stats() $$;
create or replace function public.rating_summary(users uuid[])
  returns table (user_id uuid, as_seller_avg numeric, as_seller_count int, as_buyer_avg numeric, as_buyer_count int)
  language sql stable security invoker set search_path = '' as $$ select * from private.rating_summary(users) $$;
create or replace function public.reviews_for(target uuid)
  returns table (id bigint, reviewer_name text, reviewer_role text, listing_name text, stars smallint, comment text,
                 followup_stars smallint, followup_comment text, followup_at timestamptz,
                 seller_reply text, seller_reply_at timestamptz, created_at timestamptz)
  language sql stable security invoker set search_path = '' as $$ select * from private.reviews_for(target) $$;
create or replace function public.add_review_followup(review bigint, new_stars smallint, new_comment text) returns void
  language sql security invoker set search_path = '' as $$ select private.add_review_followup(review, new_stars, new_comment) $$;
create or replace function public.record_deal_step(conv uuid, step text) returns void
  language sql security invoker set search_path = '' as $$ select private.record_deal_step(conv, step) $$;
create or replace function public.remove_my_email() returns void
  language sql security invoker set search_path = '' as $$ select private.remove_my_email() $$;
create or replace function public.reply_to_review(review bigint, reply text) returns void
  language sql security invoker set search_path = '' as $$ select private.reply_to_review(review, reply) $$;

-- Same callers as before, now on the wrappers.
revoke execute on function public.is_admin(), public.is_conversation_participant(uuid), public.conversation_is_blocked(uuid),
  public.email_for_username(text), public.incoming_pending_count(uuid), public.nyx_remaining(), public.nyx_stats(),
  public.rating_summary(uuid[]), public.reviews_for(uuid), public.add_review_followup(bigint, smallint, text),
  public.record_deal_step(uuid, text), public.remove_my_email(), public.reply_to_review(bigint, text) from public;
grant execute on function public.email_for_username(text), public.rating_summary(uuid[]), public.reviews_for(uuid) to anon, authenticated;
grant execute on function public.is_admin(), public.is_conversation_participant(uuid), public.conversation_is_blocked(uuid),
  public.incoming_pending_count(uuid), public.nyx_remaining(), public.nyx_stats(), public.add_review_followup(bigint, smallint, text),
  public.record_deal_step(uuid, text), public.remove_my_email(), public.reply_to_review(bigint, text) to authenticated;

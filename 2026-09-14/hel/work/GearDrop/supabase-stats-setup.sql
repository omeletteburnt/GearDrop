-- Site stats for the `site-stats` Claude Code skill (.claude/skills/site-stats).
-- Run once in Supabase Dashboard > SQL Editor > New query, AFTER every other
-- supabase-*.sql file (it reads tables they create). Safe to re-run.
--
-- What it exposes: ONLY aggregate counts/averages - no usernames, emails,
-- ids, listing names, message contents or review text. That is why the
-- public wrapper can be called with the anon (publishable) key, so the skill
-- needs no password or service_role key on your machine.
-- If you ever want it admin-only instead, see the note at the bottom.
--
-- Pattern (same as supabase-advisor-fixes.sql): the privileged SECURITY
-- DEFINER function lives in the unexposed `private` schema; the public name
-- is a thin SECURITY INVOKER wrapper, so the Security Advisor stays clean.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.site_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(
      ((now() at time zone 'Asia/Singapore')::date - 29)::timestamp,
      ((now() at time zone 'Asia/Singapore')::date)::timestamp,
      interval '1 day'
    )::date as day
  )
  select jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total',  (select count(*) from public.profiles),
      'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'new_30d',(select count(*) from public.profiles where created_at > now() - interval '30 days')
    ),
    'listings', jsonb_build_object(
      'total',     (select count(*) from public.listings),
      'new_7d',    (select count(*) from public.listings where created_at > now() - interval '7 days'),
      'avg_price', (select round(avg(price), 2) from public.listings),
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                      from (select status, count(*) n from public.listings group by status) s),
      'by_category', (select coalesce(jsonb_object_agg(category, n), '{}'::jsonb)
                        from (select category, count(*) n from public.listings group by category) c)
    ),
    'deals', jsonb_build_object(
      -- A deal row appears when either side first confirms in chat.
      'started',        (select count(*) from public.transactions),
      'both_confirmed', (select count(*) from public.transactions
                          where buyer_confirmed_at is not null and seller_confirmed_at is not null),
      -- "Completed" = both confirmed AND the seller sent PayNow details
      -- (the same point at which reviews unlock).
      'completed',      (select count(*) from public.transactions where payment_sent_at is not null),
      -- Deals don't store a price, so value only covers deals whose listing
      -- still exists; completed_priced says how many that is.
      'completed_value',(select coalesce(sum(l.price), 0) from public.transactions t
                           join public.listings l on l.id = t.listing_id
                          where t.payment_sent_at is not null),
      'completed_priced',(select count(*) from public.transactions t
                           join public.listings l on l.id = t.listing_id
                          where t.payment_sent_at is not null)
    ),
    -- A buyer's follow-up stars replace the original, same as the site (effectiveStars).
    'reviews', jsonb_build_object(
      'total',     (select count(*) from public.reviews),
      'avg_stars', (select round(avg(coalesce(followup_stars, stars)), 2) from public.reviews),
      'by_stars',  (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                      from (select coalesce(followup_stars, stars) s, count(*) n from public.reviews group by 1) r)
    ),
    'chat', jsonb_build_object(
      'conversations', (select count(*) from public.conversations),
      'messages',      (select count(*) from public.messages),
      'messages_7d',   (select count(*) from public.messages where created_at > now() - interval '7 days')
    ),
    'nyx', jsonb_build_object(
      'questions',     (select count(*) from public.nyx_usage),
      'questions_7d',  (select count(*) from public.nyx_usage where asked_at > now() - interval '7 days'),
      'helpful',       (select count(*) from public.nyx_feedback where helpful),
      'unhelpful',     (select count(*) from public.nyx_feedback where not helpful)
    ),
    -- Last 30 days (Singapore dates), one entry per day, zeros included.
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'signups',  (select count(*) from public.profiles p
                      where (p.created_at at time zone 'Asia/Singapore')::date = d.day),
        'listings', (select count(*) from public.listings l
                      where (l.created_at at time zone 'Asia/Singapore')::date = d.day),
        'messages', (select count(*) from public.messages m
                      where (m.created_at at time zone 'Asia/Singapore')::date = d.day),
        'deals_completed', (select count(*) from public.transactions t
                      where (t.payment_sent_at at time zone 'Asia/Singapore')::date = d.day)
      ) order by d.day)
      from days d
    )
  );
$$;

revoke all on function private.site_stats() from public;
grant execute on function private.site_stats() to anon, authenticated;

create or replace function public.site_stats() returns jsonb
  language sql stable security invoker set search_path = ''
  as $$ select private.site_stats() $$;
revoke all on function public.site_stats() from public;
grant execute on function public.site_stats() to anon, authenticated;

-- Admin-only variant (optional): replace the body of private.site_stats with
-- plpgsql that starts with
--   if not private.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
-- and revoke execute from anon. The skill would then need to sign in as the
-- admin account (see .claude/skills/site-stats/SKILL.md).

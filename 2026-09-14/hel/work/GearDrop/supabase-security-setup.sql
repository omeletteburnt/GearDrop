-- Security report for the `website-security-check` Claude Code skill.
-- Run once in Supabase Dashboard > SQL Editor > New query, AFTER every other
-- supabase-*.sql file (it reads tables they create). Safe to re-run.
--
-- ADMIN ONLY: unlike site_stats(), this returns sign-in IP addresses and
-- usernames, so it raises "Admins only" for anyone who isn't in
-- public.admin_users. anon can't call it at all. The skill signs in as the
-- admin account (credentials stay in a file on your laptop, outside the repo).
--
-- Pattern (same as supabase-advisor-fixes.sql): the SECURITY DEFINER function
-- lives in the unexposed `private` schema; the public name is a thin
-- SECURITY INVOKER wrapper.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.security_report(days int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  span int := greatest(1, least(coalesce(days, 7), 30));
  since timestamptz := now() - make_interval(days => span);
  -- Routine session noise; everything else in the auth log is an account change.
  routine text[] := array['login', 'logout', 'token_refreshed', 'token_revoked', 'user_signedup'];
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'days', span,
    'caller', auth.uid(),

    -- Everyone with admin rights (should be exactly one: you).
    'admins', (select coalesce(jsonb_agg(jsonb_build_object(
                  'user_id', a.user_id, 'username', p.username, 'email', u.email, 'added_at', a.created_at)), '[]'::jsonb)
                from public.admin_users a
                left join public.profiles p on p.id = a.user_id
                left join auth.users u on u.id = a.user_id),

    -- Supabase can be set to stop writing the auth log to the database; 0 here means
    -- the login checks have nothing to read.
    'audit_rows_total', (select count(*) from auth.audit_log_entries),
    'audit_rows_window', (select count(*) from auth.audit_log_entries where created_at > since),

    'auth_actions', (select coalesce(jsonb_object_agg(action, n), '{}'::jsonb) from (
                       select payload->>'action' as action, count(*) as n
                         from auth.audit_log_entries where created_at > since group by 1) x),

    -- Sign-ins per person per IP, with the first time that IP was ever seen.
    'logins', (select coalesce(jsonb_agg(to_jsonb(y) order by y.is_admin desc, y.last_at desc), '[]'::jsonb) from (
                 select x.*,
                        exists(select 1 from public.admin_users a where a.user_id::text = x.user_id) as is_admin,
                        (select min(f.created_at) from auth.audit_log_entries f where f.ip_address = coalesce(x.ip, '')) as ip_first_seen
                   from (select e.payload->>'actor_id' as user_id,
                                coalesce(p.username, e.payload->>'actor_username') as who,
                                nullif(e.ip_address, '') as ip,
                                count(*) as n, min(e.created_at) as first_at, max(e.created_at) as last_at
                           from auth.audit_log_entries e
                           left join public.profiles p on p.id::text = e.payload->>'actor_id'
                          where e.created_at > since and e.payload->>'action' = 'login'
                          group by 1, 2, 3
                          order by max(e.created_at) desc
                          limit 300) x) y),

    'signups_by_ip', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc), '[]'::jsonb) from (
                        select nullif(ip_address, '') as ip, count(*) as n, min(created_at) as first_at, max(created_at) as last_at
                          from auth.audit_log_entries
                         where created_at > since and payload->>'action' = 'user_signedup'
                         group by 1 order by 2 desc limit 15) x),

    -- Password changes, deletions, recovery requests, MFA changes, etc.
    'account_changes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.at desc), '[]'::jsonb) from (
                          select e.payload->>'action' as action,
                                 coalesce(p.username, e.payload->>'actor_username') as who,
                                 exists(select 1 from public.admin_users a where a.user_id::text = e.payload->>'actor_id') as is_admin,
                                 nullif(e.ip_address, '') as ip, e.created_at as at
                            from auth.audit_log_entries e
                            left join public.profiles p on p.id::text = e.payload->>'actor_id'
                           where e.created_at > since and not (e.payload->>'action' = any(routine))
                           order by e.created_at desc limit 100) x),

    -- Activity per hour (UTC) for spike detection.
    'hourly', (select jsonb_agg(jsonb_build_object(
                  'hour', h.hour,
                  'signups',  (select count(*) from public.profiles t where t.created_at >= h.hour and t.created_at < h.hour + interval '1 hour'),
                  'logins',   (select count(*) from auth.audit_log_entries t where t.payload->>'action' = 'login' and t.created_at >= h.hour and t.created_at < h.hour + interval '1 hour'),
                  'listings', (select count(*) from public.listings t where t.created_at >= h.hour and t.created_at < h.hour + interval '1 hour'),
                  'messages', (select count(*) from public.messages t where t.created_at >= h.hour and t.created_at < h.hour + interval '1 hour'),
                  'nyx',      (select count(*) from public.nyx_usage t where t.asked_at >= h.hour and t.asked_at < h.hour + interval '1 hour'),
                  'deals',    (select count(*) from public.transactions t where t.created_at >= h.hour and t.created_at < h.hour + interval '1 hour')
                ) order by h.hour)
                from (select generate_series(date_trunc('hour', since), date_trunc('hour', now()), interval '1 hour') as hour) h),

    -- Database exposure: public tables without row level security, and
    -- SECURITY DEFINER functions still in the exposed public schema (trigger
    -- functions are skipped: the API can't call them).
    'tables_without_rls', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
                             from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
    'public_definer_functions', (select coalesce(jsonb_agg(distinct p.proname), '[]'::jsonb)
                                   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname = 'public' and p.prosecdef
                                    and p.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype)
  );
end $$;

revoke all on function private.security_report(int) from public, anon;
grant execute on function private.security_report(int) to authenticated;

create or replace function public.security_report(days int default 7) returns jsonb
  language sql stable security invoker set search_path = ''
  as $$ select private.security_report(days) $$;
revoke all on function public.security_report(int) from public, anon;
grant execute on function public.security_report(int) to authenticated;

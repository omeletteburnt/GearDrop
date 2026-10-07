-- Nyx AI: daily question limits, admin usage counter and answer feedback.
-- Run once in Supabase Dashboard > SQL Editor > New query, AFTER
-- supabase-admin-setup.sql. Safe to re-run.

-- One row per question. Written by the nyx Edge Function (service role);
-- RLS on with no client policies = clients can't read or write it.
create table if not exists public.nyx_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'general',
  asked_at timestamptz not null default now()
);
create index if not exists nyx_usage_user_time_idx on public.nyx_usage (user_id, asked_at);
alter table public.nyx_usage enable row level security;

-- Questions you have left today (for the "x questions left" hint).
create or replace function public.nyx_remaining()
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, 20 - count(*)::int) from public.nyx_usage
   where user_id = auth.uid() and asked_at > now() - interval '24 hours';
$$;
revoke execute on function public.nyx_remaining() from public, anon;
grant execute on function public.nyx_remaining() to authenticated;

-- Thumbs up/down. Stores the question and answer so admins can see what went
-- wrong; users are told this next to the buttons.
create table if not exists public.nyx_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  helpful boolean not null,
  question text not null check (char_length(question) <= 1500),
  answer text not null check (char_length(answer) <= 6000),
  created_at timestamptz not null default now()
);
alter table public.nyx_feedback enable row level security;
drop policy if exists "Users send feedback" on public.nyx_feedback;
drop policy if exists "Admins read feedback" on public.nyx_feedback;
create policy "Users send feedback" on public.nyx_feedback for insert to authenticated with check (user_id = auth.uid());
create policy "Admins read feedback" on public.nyx_feedback for select to authenticated using (public.is_admin());

-- Admin counter: questions and people today, and feedback in the last 7 days.
create or replace function public.nyx_stats()
returns table (questions_today int, users_today int, helpful_7d int, unhelpful_7d int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query select
    (select count(*)::int from public.nyx_usage where asked_at > now() - interval '24 hours'),
    (select count(distinct user_id)::int from public.nyx_usage where asked_at > now() - interval '24 hours'),
    (select count(*)::int from public.nyx_feedback where helpful and created_at > now() - interval '7 days'),
    (select count(*)::int from public.nyx_feedback where not helpful and created_at > now() - interval '7 days');
end $$;
revoke execute on function public.nyx_stats() from public, anon;
grant execute on function public.nyx_stats() to authenticated;

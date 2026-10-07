-- GearDrop reviews: buyers and sellers rate each other after a transaction.
-- Run this once in Supabase Dashboard > SQL Editor > New query, AFTER
-- supabase-chat-setup.sql and supabase-admin-setup.sql. Safe to re-run.

-- ---------- transactions ----------
-- Records only THAT a deal happened: both sides confirmed it in chat and the
-- seller sent payment details. No amounts or PayNow details (those stay
-- end-to-end encrypted in the chat). Deliberately not tied to the listing or
-- conversation by a cascading key, so deleting a listing can't wipe a
-- seller's reviews.
create table if not exists public.transactions (
  conversation_id uuid primary key,
  listing_id bigint,
  listing_name text not null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_confirmed_at timestamptz,
  seller_confirmed_at timestamptz,
  payment_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
drop policy if exists "Participants read own transactions" on public.transactions;
create policy "Participants read own transactions" on public.transactions for select to authenticated using (auth.uid() in (buyer_id, seller_id));
-- No insert/update policies: only record_deal_step() below writes here.

-- Called by the chat when YOU confirm the deal ('confirm') and, for the
-- seller, when payment details are sent ('payment'). Each person can only
-- record their own step; payment only counts once both have confirmed.
create or replace function public.record_deal_step(conv uuid, step text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  uid uuid := auth.uid();
begin
  select co.buyer_id, co.seller_id, co.listing_id, l.name as listing_name
    into c from public.conversations co join public.listings l on l.id = co.listing_id
   where co.id = conv and uid in (co.buyer_id, co.seller_id);
  if not found then raise exception 'Not a participant' using errcode = '42501'; end if;

  insert into public.transactions (conversation_id, listing_id, listing_name, buyer_id, seller_id)
  values (conv, c.listing_id, c.listing_name, c.buyer_id, c.seller_id)
  on conflict (conversation_id) do nothing;

  if step = 'confirm' then
    update public.transactions set
      buyer_confirmed_at = case when uid = c.buyer_id then coalesce(buyer_confirmed_at, now()) else buyer_confirmed_at end,
      seller_confirmed_at = case when uid = c.seller_id then coalesce(seller_confirmed_at, now()) else seller_confirmed_at end
     where conversation_id = conv;
  elsif step = 'payment' then
    if uid <> c.seller_id then raise exception 'Only the seller sends payment details' using errcode = '42501'; end if;
    update public.transactions set payment_sent_at = coalesce(payment_sent_at, now())
     where conversation_id = conv and buyer_confirmed_at is not null and seller_confirmed_at is not null;
  else
    raise exception 'Unknown step';
  end if;
end $$;
revoke execute on function public.record_deal_step(uuid, text) from public, anon;
grant execute on function public.record_deal_step(uuid, text) to authenticated;

-- ---------- reviews ----------
create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions(conversation_id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('buyer', 'seller')),
  stars smallint not null check (stars between 1 and 5),
  comment text check (char_length(comment) <= 500),
  anonymous boolean not null default false,
  followup_stars smallint check (followup_stars between 1 and 5),
  followup_comment text check (char_length(followup_comment) <= 500),
  followup_at timestamptz,
  seller_reply text check (char_length(seller_reply) <= 500),
  seller_reply_at timestamptz,
  created_at timestamptz not null default now(),
  unique (transaction_id, reviewer_id)
);

-- Everything that matters is decided here, not trusted from the client:
-- who is being reviewed, in which role, and whether reviews are unlocked.
create or replace function public.review_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select * into t from public.transactions where conversation_id = new.transaction_id;
  if not found or t.payment_sent_at is null then
    raise exception 'Reviews unlock once the deal is confirmed and payment details are sent' using errcode = '42501';
  end if;
  if new.reviewer_id = t.buyer_id then
    new.reviewer_role := 'buyer'; new.reviewee_id := t.seller_id;
  elsif new.reviewer_id = t.seller_id then
    new.reviewer_role := 'seller'; new.reviewee_id := t.buyer_id; new.anonymous := false; -- only buyers can be anonymous
  else
    raise exception 'Not part of this transaction' using errcode = '42501';
  end if;
  new.comment := nullif(btrim(new.comment), '');
  new.followup_stars := null; new.followup_comment := null; new.followup_at := null;
  new.seller_reply := null; new.seller_reply_at := null;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists review_before_insert on public.reviews;
create trigger review_before_insert before insert on public.reviews
for each row execute function public.review_before_insert();

alter table public.reviews enable row level security;
drop policy if exists "Reviewers read own reviews" on public.reviews;
drop policy if exists "Participants write reviews" on public.reviews;
drop policy if exists "Admins read all reviews" on public.reviews;
drop policy if exists "Admins delete reviews" on public.reviews;
-- Raw rows (which include reviewer_id) are only readable by their author and
-- admins, so anonymous reviews stay anonymous. Everyone else reads them
-- through reviews_for() below.
create policy "Reviewers read own reviews" on public.reviews for select to authenticated using (reviewer_id = auth.uid());
create policy "Participants write reviews" on public.reviews for insert to authenticated with check (reviewer_id = auth.uid());
create policy "Admins read all reviews" on public.reviews for select to authenticated using (public.is_admin());
create policy "Admins delete reviews" on public.reviews for delete to authenticated using (public.is_admin());
-- No update policy: follow-ups and replies go through the functions below.

-- Buyers only, once: new stars (replacing the original in averages) + comment.
create or replace function public.add_review_followup(review bigint, new_stars smallint, new_comment text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reviews set followup_stars = new_stars, followup_comment = nullif(btrim(new_comment), ''), followup_at = now()
   where id = review and reviewer_id = auth.uid() and reviewer_role = 'buyer' and followup_at is null;
  if not found then raise exception 'You can''t add a follow-up to this review' using errcode = '42501'; end if;
end $$;

-- Sellers only, once, on a review a buyer left them.
create or replace function public.reply_to_review(review bigint, reply text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(reply), '') is null then raise exception 'Reply is empty'; end if;
  update public.reviews set seller_reply = btrim(reply), seller_reply_at = now()
   where id = review and reviewee_id = auth.uid() and reviewer_role = 'buyer' and seller_reply_at is null;
  if not found then raise exception 'You can''t reply to this review' using errcode = '42501'; end if;
end $$;

revoke execute on function public.add_review_followup(bigint, smallint, text) from public, anon;
revoke execute on function public.reply_to_review(bigint, text) from public, anon;
grant execute on function public.add_review_followup(bigint, smallint, text) to authenticated;
grant execute on function public.reply_to_review(bigint, text) to authenticated;

-- ---------- public reading ----------
-- Reviews someone has RECEIVED. reviewer_name is null for anonymous reviews;
-- reviewer ids are never returned.
create or replace function public.reviews_for(target uuid)
returns table (
  id bigint, reviewer_name text, reviewer_role text, listing_name text, stars smallint, comment text,
  followup_stars smallint, followup_comment text, followup_at timestamptz,
  seller_reply text, seller_reply_at timestamptz, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select r.id, case when r.anonymous then null else p.username end, r.reviewer_role, t.listing_name, r.stars, r.comment,
         r.followup_stars, r.followup_comment, r.followup_at, r.seller_reply, r.seller_reply_at, r.created_at
    from public.reviews r
    join public.transactions t on t.conversation_id = r.transaction_id
    left join public.profiles p on p.id = r.reviewer_id
   where r.reviewee_id = target
   order by r.created_at desc
   limit 200;
$$;

-- Average and count per user, as seller (rated by buyers) and as buyer
-- (rated by sellers). A follow-up's stars replace the original stars.
create or replace function public.rating_summary(users uuid[])
returns table (user_id uuid, as_seller_avg numeric, as_seller_count int, as_buyer_avg numeric, as_buyer_count int)
language sql stable security definer set search_path = public as $$
  select u,
         round(avg(coalesce(r.followup_stars, r.stars)) filter (where r.reviewer_role = 'buyer'), 1),
         (count(*) filter (where r.reviewer_role = 'buyer'))::int,
         round(avg(coalesce(r.followup_stars, r.stars)) filter (where r.reviewer_role = 'seller'), 1),
         (count(*) filter (where r.reviewer_role = 'seller'))::int
    from unnest(users[1:500]) u
    left join public.reviews r on r.reviewee_id = u
   group by u;
$$;

revoke execute on function public.reviews_for(uuid) from public;
revoke execute on function public.rating_summary(uuid[]) from public;
grant execute on function public.reviews_for(uuid) to anon, authenticated;
grant execute on function public.rating_summary(uuid[]) to anon, authenticated;

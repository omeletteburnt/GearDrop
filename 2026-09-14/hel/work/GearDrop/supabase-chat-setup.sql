-- GearDrop chat: end-to-end encrypted buyer <-> seller messaging.
-- Run this once in Supabase Dashboard > SQL Editor > New query, AFTER
-- supabase-setup.sql. Safe to re-run (everything is create-if-missing /
-- drop-then-create).
--
-- What the database can see: who talks to whom, about which listing, and
-- when. What it cannot see: message content, offer amounts, PayNow details,
-- photos and videos — those only ever arrive here as AES-GCM ciphertext
-- encrypted in the browser (see src/crypto.ts).

-- ---------- keys ----------
create table if not exists public.public_keys (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  public_key jsonb not null,
  created_at timestamptz not null default now()
);

-- The private key, encrypted with a key derived from the user's password
-- (PBKDF2-SHA256, 600k iterations). Only the owner can ever read it.
create table if not exists public.key_backups (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  wrapped_key text not null check (char_length(wrapped_key) < 2000),
  salt text not null check (char_length(salt) < 100),
  iv text not null check (char_length(iv) < 100)
);

-- ---------- conversations ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id bigint not null references public.listings(id) on delete cascade,
  buyer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_sender_id uuid,
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);

-- seller_id is never trusted from the client: it is always the listing's owner.
create or replace function public.conversation_set_seller()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.buyer_id := auth.uid();
  select owner_id into new.seller_id from public.listings where id = new.listing_id;
  if new.seller_id is null then raise exception 'Listing not found'; end if;
  if new.seller_id = new.buyer_id then raise exception 'You cannot message yourself'; end if;
  new.last_message_at := null;
  new.last_sender_id := null;
  return new;
end $$;
drop trigger if exists conversation_set_seller on public.conversations;
create trigger conversation_set_seller before insert on public.conversations
for each row execute function public.conversation_set_seller();

-- SECURITY DEFINER so policies on messages / storage can call it without
-- recursing through the conversations RLS policy.
create or replace function public.is_conversation_participant(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.conversations c
    where c.id = conv and auth.uid() in (c.buyer_id, c.seller_id));
$$;

-- ---------- blocks ----------
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- True if either participant has blocked the other. SECURITY DEFINER because
-- a blocked user must not be able to read the blocks table itself.
create or replace function public.conversation_is_blocked(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.conversations c join public.blocks b
    on (b.blocker_id = c.buyer_id and b.blocked_id = c.seller_id)
    or (b.blocker_id = c.seller_id and b.blocked_id = c.buyer_id)
    where c.id = conv);
$$;

-- ---------- messages ----------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) between 1 and 20000),
  iv text not null check (char_length(iv) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, id);
create index if not exists messages_sender_time_idx on public.messages (sender_id, created_at);

-- Rate limit + keep the conversation's "last message" fields current.
create or replace function public.message_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- sender_id is deliberately NOT overwritten here: a spoofed sender must be
  -- rejected by the insert policy below, not silently corrected.
  new.created_at := now();
  if (select count(*) from public.messages
      where sender_id = new.sender_id and created_at > now() - interval '60 seconds') >= 20 then
    raise exception 'You are sending messages too quickly. Please wait a moment.';
  end if;
  update public.conversations set last_message_at = new.created_at, last_sender_id = new.sender_id
    where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists message_before_insert on public.messages;
create trigger message_before_insert before insert on public.messages
for each row execute function public.message_before_insert();

-- ---------- read markers (unread badges) ----------
create table if not exists public.conversation_reads (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

-- ---------- row level security ----------
alter table public.public_keys enable row level security;
alter table public.key_backups enable row level security;
alter table public.conversations enable row level security;
alter table public.blocks enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

drop policy if exists "Signed-in users read public keys" on public.public_keys;
drop policy if exists "Users publish own key" on public.public_keys;
drop policy if exists "Users replace own key" on public.public_keys;
create policy "Signed-in users read public keys" on public.public_keys for select to authenticated using (true);
create policy "Users publish own key" on public.public_keys for insert to authenticated with check (auth.uid() = user_id);
create policy "Users replace own key" on public.public_keys for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owners manage key backup" on public.key_backups;
create policy "Owners manage key backup" on public.key_backups for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Participants read conversations" on public.conversations;
drop policy if exists "Buyers start conversations" on public.conversations;
create policy "Participants read conversations" on public.conversations for select to authenticated using (auth.uid() in (buyer_id, seller_id));
create policy "Buyers start conversations" on public.conversations for insert to authenticated with check (auth.uid() = buyer_id);
-- No update/delete policies: clients can never edit or remove a conversation.

drop policy if exists "Participants read messages" on public.messages;
drop policy if exists "Participants send messages" on public.messages;
create policy "Participants read messages" on public.messages for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "Participants send messages" on public.messages for insert to authenticated with check (
  sender_id = auth.uid()
  and public.is_conversation_participant(conversation_id)
  and not public.conversation_is_blocked(conversation_id)
);
-- No update/delete policies: messages are immutable.

drop policy if exists "Users manage own blocks" on public.blocks;
create policy "Users manage own blocks" on public.blocks for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

drop policy if exists "Users manage own read markers" on public.conversation_reads;
create policy "Users manage own read markers" on public.conversation_reads for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_conversation_participant(conversation_id));

-- ---------- encrypted photo / video storage ----------
-- Files are uploaded already encrypted, under "<conversation_id>/<random>".
-- 26 MB cap = 25 MB client-side video limit + encryption overhead.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 27262976)
on conflict (id) do update set public = false, file_size_limit = 27262976;

drop policy if exists "Participants read chat media" on storage.objects;
drop policy if exists "Participants upload chat media" on storage.objects;
create policy "Participants read chat media" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.is_conversation_participant(((storage.foldername(name))[1])::uuid));
create policy "Participants upload chat media" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
    and not public.conversation_is_blocked(((storage.foldername(name))[1])::uuid));

-- ---------- realtime (RLS still applies to what each user receives) ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- ---------- held messages ("waiting to deliver") ----------
-- When the other person has no chat key yet, text messages are encrypted to
-- the SENDER's own key and kept here. The sender's browser re-encrypts and
-- delivers them once the other person has signed in. Only the sender can
-- read or remove their own held messages.
create table if not exists public.pending_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) between 1 and 20000),
  iv text not null check (char_length(iv) between 1 and 40),
  created_at timestamptz not null default now()
);

-- At most 20 held messages per conversation, so delivery fits inside the
-- 20-messages-a-minute rate limit.
create or replace function public.pending_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.pending_messages where conversation_id = new.conversation_id and sender_id = new.sender_id) >= 20 then
    raise exception 'Too many messages waiting to deliver. Please wait until they have signed in.';
  end if;
  return new;
end $$;
drop trigger if exists pending_before_insert on public.pending_messages;
create trigger pending_before_insert before insert on public.pending_messages
for each row execute function public.pending_before_insert();

alter table public.pending_messages enable row level security;
drop policy if exists "Senders read own held messages" on public.pending_messages;
drop policy if exists "Senders hold messages" on public.pending_messages;
drop policy if exists "Senders remove own held messages" on public.pending_messages;
create policy "Senders read own held messages" on public.pending_messages for select to authenticated using (sender_id = auth.uid());
create policy "Senders hold messages" on public.pending_messages for insert to authenticated with check (
  sender_id = auth.uid()
  and public.is_conversation_participant(conversation_id)
  and not public.conversation_is_blocked(conversation_id)
);
create policy "Senders remove own held messages" on public.pending_messages for delete to authenticated using (sender_id = auth.uid());

-- Lets the RECIPIENT know messages are on the way, without revealing them.
create or replace function public.incoming_pending_count(conv uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.pending_messages p
  where p.conversation_id = conv and p.sender_id <> auth.uid() and public.is_conversation_participant(conv);
$$;
revoke execute on function public.incoming_pending_count(uuid) from public, anon;
grant execute on function public.incoming_pending_count(uuid) to authenticated;

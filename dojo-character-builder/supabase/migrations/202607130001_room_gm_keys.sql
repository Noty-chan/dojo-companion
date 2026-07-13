-- Лёгкая модель роли ГМа для комнат без обязательных аккаунтов.
-- Ключ не хранится в dojo_rooms и не попадает в select/broadcast состояния.

create extension if not exists pgcrypto;

create table if not exists public.dojo_room_secrets (
  room_id text primary key references public.dojo_rooms (id) on delete cascade,
  gm_key_hash bytea not null,
  created_at timestamptz not null default now()
);

alter table public.dojo_room_secrets enable row level security;
revoke all on public.dojo_room_secrets from anon, authenticated;

create or replace function public.create_dojo_room(p_id text, p_state jsonb, p_gm_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_id !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'invalid room id';
  end if;
  if p_gm_key !~ '^[A-Z0-9]{12}$' then
    raise exception 'invalid gm key';
  end if;
  if octet_length(p_state::text) > 8 * 1024 * 1024 then
    raise exception 'room state is too large';
  end if;

  insert into public.dojo_rooms (id, state, rev, writer)
  values (p_id, p_state, 1, 'creator');

  insert into public.dojo_room_secrets (room_id, gm_key_hash)
  values (p_id, digest(upper(p_gm_key), 'sha256'));
end;
$$;

create or replace function public.verify_dojo_gm(p_room_id text, p_gm_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.dojo_room_secrets
    where room_id = p_room_id
      and gm_key_hash = digest(upper(p_gm_key), 'sha256')
  );
$$;

revoke all on function public.create_dojo_room(text, jsonb, text) from public;
revoke all on function public.verify_dojo_gm(text, text) from public;
grant execute on function public.create_dojo_room(text, jsonb, text) to anon, authenticated;
grant execute on function public.verify_dojo_gm(text, text) to anon, authenticated;

create index if not exists dojo_rooms_updated_at_idx on public.dojo_rooms (updated_at);

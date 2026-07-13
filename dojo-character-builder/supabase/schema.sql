-- Схема Supabase для «Паники в Додзе»: облако компаньона + комнаты стола.
-- Идемпотентна: можно выполнять повторно (SQL Editor → Run) при обновлениях.

-- ============================================================
-- 1. Облако компаньона: один JSON-снапшот прогресса на аккаунт
-- ============================================================

create table if not exists public.dojo_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.dojo_snapshots enable row level security;

drop policy if exists "snapshot_select_own" on public.dojo_snapshots;
create policy "snapshot_select_own" on public.dojo_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists "snapshot_insert_own" on public.dojo_snapshots;
create policy "snapshot_insert_own" on public.dojo_snapshots
  for insert with check (auth.uid() = user_id);

drop policy if exists "snapshot_update_own" on public.dojo_snapshots;
create policy "snapshot_update_own" on public.dojo_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "snapshot_delete_own" on public.dojo_snapshots;
create policy "snapshot_delete_own" on public.dojo_snapshots
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 2. Комнаты стола: состояние стола одной строкой на комнату
-- ============================================================
-- Комната доступна всем, кто знает её код (аккаунт не нужен):
-- стол для своей компании, а не публичный сервис. Код достаточно
-- случайный, чтобы не наткнуться перебором.

create table if not exists public.dojo_rooms (
  id text primary key check (id ~ '^[A-Z0-9]{4,12}$'),
  state jsonb not null,
  rev bigint not null default 0,
  writer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dojo_rooms enable row level security;

drop policy if exists "rooms_select_all" on public.dojo_rooms;
create policy "rooms_select_all" on public.dojo_rooms
  for select to anon, authenticated using (true);

drop policy if exists "rooms_insert_all" on public.dojo_rooms;
create policy "rooms_insert_all" on public.dojo_rooms
  for insert to anon, authenticated with check (true);

drop policy if exists "rooms_update_all" on public.dojo_rooms;
create policy "rooms_update_all" on public.dojo_rooms
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "rooms_delete_all" on public.dojo_rooms;
create policy "rooms_delete_all" on public.dojo_rooms
  for delete to anon, authenticated using (true);

-- Realtime-уведомления об изменениях комнат (страховка к broadcast-каналу).
do $$
begin
  alter publication supabase_realtime add table public.dojo_rooms;
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- 3. Хранилище фонов арен (картинки не влезают в jsonb-состояние)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('dojo-backgrounds', 'dojo-backgrounds', true)
on conflict (id) do nothing;

drop policy if exists "dojo_bg_read" on storage.objects;
create policy "dojo_bg_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'dojo-backgrounds');

drop policy if exists "dojo_bg_upload" on storage.objects;
create policy "dojo_bg_upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'dojo-backgrounds');

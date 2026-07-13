import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { TableState } from "../types";
import { migrateTableState } from "../types";

// Комнаты стола: состояние комнаты — одна строка в dojo_rooms (last-write-wins по rev),
// живые обновления — broadcast-канал (state целиком) + postgres_changes как страховка,
// эфемерные эффекты (пинги, линейки) — отдельные broadcast-события без записи в базу.
//
// Проект Supabase прошит по умолчанию (publishable-ключ публичен по замыслу, доступ
// к комнате есть у любого, кто знает её код — стол для своей компании).

const SUPABASE_URL = "https://jxtuodarhifnrxplogyy.supabase.co";
const SUPABASE_KEY = "sb_publishable_NtZvUQdpCviEm0yKH6AvfA_DLPpiaFs";

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  client = client ?? createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

export function makeClientId(): string {
  return `cl-${Math.random().toString(36).slice(2, 10)}`;
}

// Код без похожих символов (0/O, 1/I): легко диктовать голосом.
export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function makeGmKey(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export interface SavedRoomSession {
  code: string;
  gmKey?: string;
  legacyGm?: boolean;
}

const roomSessionKey = "dojo-table.room-session.v2";

export function loadRoomSession(): SavedRoomSession | undefined {
  try {
    const raw = window.localStorage.getItem(roomSessionKey);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<SavedRoomSession>;
    if (typeof value.code !== "string" || !/^[A-Z0-9]{4,12}$/.test(value.code)) return undefined;
    return {
      code: value.code,
      gmKey: typeof value.gmKey === "string" ? value.gmKey : undefined,
      legacyGm: value.legacyGm === true,
    };
  } catch {
    return undefined;
  }
}

export function saveRoomSession(session?: SavedRoomSession): void {
  try {
    if (session) window.localStorage.setItem(roomSessionKey, JSON.stringify(session));
    else window.localStorage.removeItem(roomSessionKey);
  } catch {
    // Комната продолжит работать до закрытия вкладки.
  }
}

export interface RoomEventPing {
  type: "ping";
  x: number;
  y: number;
  color: string;
}

export interface RoomEventRuler {
  type: "ruler";
  clientId: string;
  color: string;
  // Ломаная линейка: узлы в координатах поля. from/to остаются для старых клиентов.
  points?: { x: number; y: number }[];
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  cells?: number;
  cost?: number;
}

export type RoomEvent = RoomEventPing | RoomEventRuler;

export interface RoomCallbacks {
  onState: (state: TableState, rev: number) => void;
  onEvent: (event: RoomEvent) => void;
  onPresence: (count: number) => void;
  onStatus: (status: "connected" | "reconnecting") => void;
}

export interface RoomConnection {
  code: string;
  clientId: string;
  channel: RealtimeChannel;
  sendState: (state: TableState, rev: number) => void;
  sendEvent: (event: RoomEvent) => void;
  leave: () => void;
}

export async function createRoom(state: TableState): Promise<{ code: string; gmKey: string; gmProtected: boolean }> {
  const code = makeRoomCode();
  const gmKey = makeGmKey();
  const { error: rpcError } = await supabase().rpc("create_dojo_room", { p_id: code, p_state: state, p_gm_key: gmKey });
  let gmProtected = true;
  if (rpcError) {
    // Совместимость до применения новой миграции: комната создаётся по старой схеме,
    // но ключ всё равно закрепляет роль в интерфейсе этого клиента.
    const { error } = await supabase().from("dojo_rooms").insert({ id: code, state, rev: 1, writer: "creator" });
    if (error) throw new Error(`Не удалось создать комнату: ${error.message}`);
    gmProtected = false;
  }
  return { code, gmKey, gmProtected };
}

export async function verifyRoomGm(code: string, gmKey: string): Promise<boolean> {
  const { data, error } = await supabase().rpc("verify_dojo_gm", { p_room_id: code, p_gm_key: gmKey.trim().toUpperCase() });
  if (error) return false;
  return data === true;
}

export async function fetchRoom(code: string): Promise<{ state: TableState; rev: number } | undefined> {
  const { data, error } = await supabase().from("dojo_rooms").select("state, rev").eq("id", code).maybeSingle();
  if (error) throw new Error(`Не удалось получить комнату: ${error.message}`);
  if (!data) return undefined;
  const state = migrateTableState(data.state);
  if (!state) return undefined;
  return { state, rev: Number(data.rev) || 0 };
}

export async function persistRoom(code: string, state: TableState, expectedRev: number, clientId: string): Promise<number | undefined> {
  const nextRev = expectedRev + 1;
  const { data, error } = await supabase()
    .from("dojo_rooms")
    .update({ state, rev: nextRev, writer: clientId, updated_at: new Date().toISOString() })
    .eq("id", code)
    .eq("rev", expectedRev)
    .select("rev")
    .maybeSingle();
  if (error) throw new Error(`Не удалось сохранить комнату: ${error.message}`);
  return data ? Number(data.rev) : undefined;
}

export function connectRoom(code: string, clientId: string, callbacks: RoomCallbacks): RoomConnection {
  const channel = supabase().channel(`room:${code}`, {
    config: { broadcast: { self: false }, presence: { key: clientId } },
  });

  channel
    .on("broadcast", { event: "state" }, (message) => {
      const payload = message.payload as { state?: unknown; rev?: number; clientId?: string };
      if (payload.clientId === clientId) return;
      const state = migrateTableState(payload.state);
      if (state) callbacks.onState(state, Number(payload.rev) || 0);
    })
    .on("broadcast", { event: "fx" }, (message) => {
      const payload = message.payload as RoomEvent & { clientId?: string };
      if (payload.clientId === clientId) return;
      callbacks.onEvent(payload);
    })
    // Страховка: если broadcast потерялся (сон вкладки), изменение строки догонит.
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dojo_rooms", filter: `id=eq.${code}` }, (message) => {
      const row = message.new as { state?: unknown; rev?: number; writer?: string };
      if (row.writer === clientId) return;
      const state = migrateTableState(row.state);
      if (state) callbacks.onState(state, Number(row.rev) || 0);
    })
    .on("presence", { event: "sync" }, () => {
      callbacks.onPresence(Object.keys(channel.presenceState()).length);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        callbacks.onStatus("connected");
        void channel.track({ joinedAt: new Date().toISOString() });
        // После (пере)подключения подтягиваем свежую строку — могли пропустить broadcast.
        fetchRoom(code)
          .then((room) => {
            if (room) callbacks.onState(room.state, room.rev);
          })
          .catch(() => undefined);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        callbacks.onStatus("reconnecting");
      }
    });

  return {
    code,
    clientId,
    channel,
    sendState: (state, rev) => {
      void channel.send({ type: "broadcast", event: "state", payload: { state, rev, clientId } });
    },
    sendEvent: (event) => {
      void channel.send({ type: "broadcast", event: "fx", payload: { ...event, clientId } });
    },
    leave: () => {
      void supabase().removeChannel(channel);
    },
  };
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Copy,
  Dices,
  DoorOpen,
  Eraser,
  Eye,
  Flag,
  ImagePlus,
  KeyRound,
  Link2,
  LocateFixed,
  MousePointer2,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Ruler,
  Send,
  Shapes,
  Swords,
  Upload,
  UserRound,
  Users,
  Webhook,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import type { BuilderData, EnemyRosterEntry } from "./companionTypes";
import {
  battleScaleById,
  battleScales,
  isMarkerType,
  markerMeta,
  markerTypes,
  maxGrid,
  migrateTableState,
  minGrid,
  pngTerrainTypes,
  terrainLabels,
  type DicePool,
  type GridType,
  type TableState,
  type TableToken,
  type TerrainType,
} from "./types";
import type { EnemyScaleId } from "./companionTypes";
import { Board, type ActivePing, type RulerFx } from "./components/Board";
import { TokenPanel } from "./components/TokenPanel";
import { InitiativePanel } from "./components/Initiative";
import { PoolDice, poolRemaining } from "./components/PoolDice";
import { advanceSlot, assignCurrentSlot, startCombat as buildCombat } from "./utils/initiative";
import { formatRoll, rollPool, rollStance, type StanceDice } from "./utils/dice";
import { tokenIgnoresWalls, tokenRangeSpec, type RangeSpec } from "./utils/range";
import { extractPortablePayload } from "./utils/portable";
import { enemyTokens, heroToken, importCompanionPayload, findFreeCell, makeTokenId } from "./utils/importers";
import { companionHeroes, companionParties, companionSceneRoster, rosterToEnemyBuild, type CompanionHero, type CompanionParty } from "./utils/library";
import { isValidWebhookUrl, loadDiscordSettings, saveDiscordSettings, sendDiscordMessage, type DiscordSettings } from "./utils/discord";
import {
  connectRoom,
  createRoom,
  fetchRoom,
  loadRoomSession,
  makeClientId,
  persistRoom,
  saveRoomSession,
  verifyRoomGm,
  type RoomConnection,
  type RoomEvent,
} from "./utils/room";
import { blobToDataUrl, fitBackground, prepareBackgroundImage, uploadBackground } from "./utils/background";
import { boardSize } from "./utils/grid";
import { mergeTableStates, sameTableState } from "./utils/merge";
import "./styles.css";

const stateStorageKey = "dojo-table.state.v1";
const clientIdStorageKey = "dojo-table.client-id.v1";

export type Tool = "select" | "erase" | "ruler" | "ping" | "draw" | TerrainType;

function emptyTable(): TableState {
  return {
    schemaVersion: 2,
    name: "Новая арена",
    gridType: "square",
    gridW: 9,
    gridH: 7,
    round: 1,
    scaleId: "feather",
    tokens: [],
    log: [],
    drawings: [],
    tray: [],
  };
}

function loadTable(): TableState {
  try {
    const raw = window.localStorage.getItem(stateStorageKey);
    if (!raw) return emptyTable();
    return migrateTableState(JSON.parse(raw)) ?? emptyTable();
  } catch {
    return emptyTable();
  }
}

function stableClientId(): string {
  try {
    const saved = window.localStorage.getItem(clientIdStorageKey);
    if (saved) return saved;
    const id = makeClientId();
    window.localStorage.setItem(clientIdStorageKey, id);
    return id;
  } catch {
    return makeClientId();
  }
}

// Цвет клиента для пингов/линеек/рисунков — стабилен между сессиями.
function clientColor(clientId: string): string {
  const palette = ["#e0b13e", "#4fb0e8", "#e8654f", "#59c98a", "#c06ce8", "#e88bc4"];
  let hash = 0;
  for (const ch of clientId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function App() {
  const [table, setTable] = useState<TableState>(() => loadTable());
  const [data, setData] = useState<BuilderData>({ items: [], sourceNotes: [] });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [tool, setTool] = useState<Tool>("select");
  // Особый режим террейна: свежепоставленная стена/ловушка/метка помечается свечением
  // («не как все» — магия и т.п.); повторный клик по такой же клетке переключает метку.
  const [terrainSpecial, setTerrainSpecial] = useState(false);
  const [discord, setDiscord] = useState<DiscordSettings>(() => loadDiscordSettings());
  const [echoToDiscord, setEchoToDiscord] = useState(false);
  const [toast, setToast] = useState("");
  const [isGM, setIsGM] = useState(true);
  const [gmKey, setGmKey] = useState<string | undefined>();

  // --- комната ---
  const clientId = useMemo(() => stableClientId(), []);
  const myColor = useMemo(() => clientColor(clientId), [clientId]);
  const [roomCode, setRoomCode] = useState<string | undefined>();
  const [roomStatus, setRoomStatus] = useState<"off" | "connected" | "reconnecting">("off");
  const [participants, setParticipants] = useState(0);
  const [joinDraft, setJoinDraft] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);
  const connRef = useRef<RoomConnection | undefined>(undefined);
  const revRef = useRef(0);
  const tableRef = useRef(table);
  tableRef.current = table;
  const baseRoomStateRef = useRef<TableState | undefined>(undefined);
  const skipRoomPersistRef = useRef(false);
  const persistTimerRef = useRef<number | undefined>(undefined);
  const persistInFlightRef = useRef(false);
  const persistQueuedRef = useRef(false);
  const autoRestoreStartedRef = useRef(false);

  // --- эфемерные эффекты ---
  const [pings, setPings] = useState<ActivePing[]>([]);
  const [remoteRulers, setRemoteRulers] = useState<Record<string, RulerFx>>({});

  // --- зум поля: 1 = вписано целиком, дальше — пан скроллом/перетаскиванием ---
  const [zoom, setZoom] = useState(1);
  const boardAreaRef = useRef<HTMLElement>(null);

  // --- упрощённое представление на фишках: кнопка-переключатель + удержание Alt ---
  const [overlaysPinned, setOverlaysPinned] = useState(false);
  const [overlaysHold, setOverlaysHold] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        event.preventDefault();
        setOverlaysHold(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") setOverlaysHold(false);
    };
    const onBlur = () => setOverlaysHold(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // --- библиотека статблоков: поиск по готовым врагам книги + мост к компаньону ---
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryGroup, setLibraryGroup] = useState("");
  const [bridgeHeroes, setBridgeHeroes] = useState<CompanionHero[]>(() => companionHeroes());
  const [bridgeParties, setBridgeParties] = useState<CompanionParty[]>(() => companionParties());
  const [bridgeScene, setBridgeScene] = useState(() => companionSceneRoster());

  // 1 = поле вписано целиком; меньше — отдаление, больше — приближение с паном.
  const minZoom = 0.5;
  const maxZoom = 3;

  function zoomDelta(factor: number) {
    setZoom((current) => Math.min(maxZoom, Math.max(minZoom, Math.round(current * factor * 100) / 100)));
  }

  // Колесо мыши = зум (как в Foundry). Нужен нативный листенер: у React wheel пассивный,
  // preventDefault иначе не сработает и страница будет скроллиться.
  useEffect(() => {
    const area = boardAreaRef.current;
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => Math.min(maxZoom, Math.max(minZoom, Math.round(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12) * 100) / 100)));
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    saveDiscordSettings(discord);
  }, [discord]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    fetch("./data/builder-data.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(setData)
      .catch((error) => console.warn("Не удалось загрузить данные книги; имена форм/стилей будут скрыты.", error));
  }, []);

  // Локальное сохранение + последовательная запись комнаты по ожидаемой ревизии.
  // Broadcast отправляется только после успешной атомарной записи в БД.
  useEffect(() => {
    try {
      window.localStorage.setItem(stateStorageKey, JSON.stringify(table));
    } catch {
      setToast("Браузер не смог сохранить стол локально — после закрытия вкладки изменения могут пропасть.");
    }
    if (skipRoomPersistRef.current) {
      skipRoomPersistRef.current = false;
      return;
    }
    const conn = connRef.current;
    if (!conn) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      void persistTableSnapshot(table);
    }, 400);
  }, [clientId, table]);

  async function persistTableSnapshot(snapshot: TableState) {
    if (persistInFlightRef.current) {
      persistQueuedRef.current = true;
      return;
    }
    const conn = connRef.current;
    if (!conn) return;
    persistInFlightRef.current = true;
    let candidate = snapshot;
    let base = baseRoomStateRef.current ?? snapshot;
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const expectedRev = revRef.current;
        const savedRev = await persistRoom(conn.code, candidate, expectedRev, clientId);
        if (savedRev !== undefined) {
          revRef.current = savedRev;
          baseRoomStateRef.current = candidate;
          conn.sendState(candidate, savedRev);
          if (sameTableState(tableRef.current, snapshot) && !sameTableState(candidate, snapshot)) {
            tableRef.current = candidate;
            skipRoomPersistRef.current = true;
            setTable(candidate);
          }
          return;
        }

        const remote = await fetchRoom(conn.code);
        if (!remote) throw new Error("Комната больше не существует.");
        let merged = mergeTableStates(base, candidate, remote.state);
        const latest = tableRef.current;
        if (!sameTableState(latest, snapshot)) merged = mergeTableStates(snapshot, latest, merged);
        base = remote.state;
        candidate = merged;
        revRef.current = remote.rev;
        baseRoomStateRef.current = remote.state;
      }
      throw new Error("Комната менялась слишком быстро; повторите действие.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось сохранить комнату.");
    } finally {
      persistInFlightRef.current = false;
      if (persistQueuedRef.current) {
        persistQueuedRef.current = false;
        window.setTimeout(() => void persistTableSnapshot(tableRef.current), 0);
      }
    }
  }

  function applyRemoteState(state: TableState, rev: number) {
    if (rev <= revRef.current) return;
    const base = baseRoomStateRef.current ?? tableRef.current;
    const merged = mergeTableStates(base, tableRef.current, state);
    revRef.current = rev;
    baseRoomStateRef.current = state;
    if (sameTableState(merged, tableRef.current)) return;
    tableRef.current = merged;
    skipRoomPersistRef.current = sameTableState(merged, state);
    setTable(merged);
  }

  function handleRoomEvent(event: RoomEvent) {
    if (event.type === "ping") {
      spawnPing(event.x, event.y, event.color);
      return;
    }
    if (event.type === "ruler") {
      setRemoteRulers((current) => {
        const next = { ...current };
        // Новые клиенты шлют ломаную (points); от старых достаточно from/to.
        const points = event.points ?? (event.from && event.to ? [event.from, event.to] : undefined);
        if (points && points.length >= 2) {
          next[event.clientId] = { points, cells: event.cells ?? 0, cost: event.cost ?? event.cells ?? 0, color: event.color };
        } else {
          delete next[event.clientId];
        }
        return next;
      });
    }
  }

  function attachRoom(code: string) {
    connRef.current?.leave();
    connRef.current = connectRoom(code, clientId, {
      onState: applyRemoteState,
      onEvent: handleRoomEvent,
      onPresence: setParticipants,
      onStatus: (status) => setRoomStatus(status === "connected" ? "connected" : "reconnecting"),
    });
    setRoomCode(code);
  }

  async function createRoomAction() {
    setRoomBusy(true);
    try {
      const { code, gmKey: createdGmKey, gmProtected } = await createRoom(table);
      revRef.current = 1;
      baseRoomStateRef.current = table;
      attachRoom(code);
      setGmKey(createdGmKey);
      setIsGM(true);
      saveRoomSession({ code, gmKey: createdGmKey, legacyGm: !gmProtected });
      navigator.clipboard?.writeText(createdGmKey).catch(() => undefined);
      setToast(`Комната ${code} создана. Ключ ГМа ${createdGmKey} скопирован — сохраните его для другого устройства.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось создать комнату.");
    } finally {
      setRoomBusy(false);
    }
  }

  async function joinRoomAction() {
    const code = joinDraft.trim().toUpperCase();
    if (code.length < 4) return;
    setRoomBusy(true);
    try {
      const room = await fetchRoom(code);
      if (!room) {
        setToast(`Комната ${code} не найдена — проверьте код.`);
        return;
      }
      revRef.current = room.rev;
      baseRoomStateRef.current = room.state;
      tableRef.current = room.state;
      skipRoomPersistRef.current = true;
      setTable(room.state);
      attachRoom(code);
      setJoinDraft("");
      setGmKey(undefined);
      setIsGM(false);
      saveRoomSession({ code });
      setToast(`Вы в комнате ${code} как игрок.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось войти в комнату.");
    } finally {
      setRoomBusy(false);
    }
  }

  function leaveRoom() {
    connRef.current?.leave();
    connRef.current = undefined;
    setRoomCode(undefined);
    setRoomStatus("off");
    setParticipants(0);
    setRemoteRulers({});
    baseRoomStateRef.current = undefined;
    revRef.current = 0;
    setGmKey(undefined);
    setIsGM(true);
    saveRoomSession(undefined);
    setToast("Вы вышли из комнаты; стол продолжает работать локально.");
  }

  async function claimGmRole() {
    if (!roomCode) return;
    const key = window.prompt("Введите 12-значный ключ ГМа для этой комнаты:")?.trim().toUpperCase();
    if (!key) return;
    const verified = await verifyRoomGm(roomCode, key);
    if (!verified) {
      setToast("Ключ ГМа не подошёл.");
      return;
    }
    setGmKey(key);
    setIsGM(true);
    saveRoomSession({ code: roomCode, gmKey: key });
    setToast("Права ГМа подтверждены для этой комнаты.");
  }

  useEffect(() => {
    if (autoRestoreStartedRef.current) return;
    autoRestoreStartedRef.current = true;
    const saved = loadRoomSession();
    if (!saved) return;
    setRoomBusy(true);
    fetchRoom(saved.code)
      .then(async (room) => {
        if (!room) {
          saveRoomSession(undefined);
          setToast(`Сохранённая комната ${saved.code} больше не найдена.`);
          return;
        }
        revRef.current = room.rev;
        baseRoomStateRef.current = room.state;
        tableRef.current = room.state;
        skipRoomPersistRef.current = true;
        setTable(room.state);
        attachRoom(saved.code);
        const verified = saved.gmKey ? saved.legacyGm === true || (await verifyRoomGm(saved.code, saved.gmKey)) : false;
        setGmKey(verified ? saved.gmKey : undefined);
        setIsGM(Boolean(verified));
        if (!verified && saved.gmKey) saveRoomSession({ code: saved.code });
        setToast(`Комната ${saved.code} восстановлена после перезапуска.`);
      })
      .catch((error) => setToast(error instanceof Error ? error.message : "Не удалось восстановить комнату."))
      .finally(() => setRoomBusy(false));
  }, []);

  const selected = useMemo(() => table.tokens.find((token) => token.id === selectedId), [selectedId, table.tokens]);
  const discordReady = isValidWebhookUrl(discord.webhookUrl);

  // Дальности активных стоек — для подсветки на поле при наведении/выборе фишки.
  const rangeByToken = useMemo(() => {
    const map: Record<string, RangeSpec | undefined> = {};
    for (const token of table.tokens) {
      if (token.kind !== "terrain") map[token.id] = tokenRangeSpec(token, data);
    }
    return map;
  }, [data, table.tokens]);

  // Кто игнорирует стены при подсветке дальности (стиль паркура).
  const ignoreWallsByToken = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const token of table.tokens) {
      if (token.kind !== "terrain") map[token.id] = tokenIgnoresWalls(token, data);
    }
    return map;
  }, [data, table.tokens]);

  const battleScale = battleScaleById(table.scaleId);

  const rosterGroups = useMemo(
    () => [...new Set((data.enemyRoster ?? []).map((entry) => entry.group).filter(Boolean))],
    [data.enemyRoster],
  );

  const filteredRoster = useMemo(() => {
    const roster = data.enemyRoster ?? [];
    const query = libraryQuery.trim().toLowerCase();
    const kindLabels = { stooge: "статисты", warrior: "воин", boss: "босс" };
    return roster.filter((entry) => {
      if (libraryGroup && entry.group !== libraryGroup) return false;
      if (!query) return true;
      return `${entry.name} ${entry.group} ${entry.styleName} ${entry.formName} ${kindLabels[entry.kind] ?? ""}`.toLowerCase().includes(query);
    });
  }, [data.enemyRoster, libraryQuery, libraryGroup]);

  function log(text: string) {
    setTable((current) => ({
      ...current,
      log: [{ id: makeTokenId(), at: new Date().toISOString(), text }, ...current.log].slice(0, 120),
    }));
    if (echoToDiscord && discordReady) {
      sendDiscordMessage(discord, text).catch(() => setToast("Не удалось отправить сообщение в Discord."));
    }
  }

  // Поля, общие для группы статистов: пачка — один юнит, трекеры у всех фишек синхронны.
  const groupSharedKeys = ["hpCurrent", "hpMax", "shield", "armorSpent", "counters", "pool", "bars"] as const;

  function patchToken(id: string, patch: Partial<TableToken>) {
    setTable((current) => {
      const target = current.tokens.find((token) => token.id === id);
      const shared: Partial<TableToken> = {};
      if (target?.groupId) {
        for (const key of groupSharedKeys) {
          if (key in patch) (shared as Record<string, unknown>)[key] = patch[key];
        }
      }
      const hasShared = Object.keys(shared).length > 0;
      return {
        ...current,
        tokens: current.tokens.map((token) => {
          if (token.id === id) return { ...token, ...patch };
          if (hasShared && target?.groupId && token.groupId === target.groupId) return { ...token, ...shared };
          return token;
        }),
      };
    });
  }

  function removeToken(id: string) {
    const token = table.tokens.find((record) => record.id === id);
    setTable((current) => ({ ...current, tokens: current.tokens.filter((record) => record.id !== id) }));
    if (selectedId === id) setSelectedId(undefined);
    if (token && token.kind !== "terrain") log(`${token.name} покидает стол.`);
  }

  function cellAction(x: number, y: number) {
    if (tool === "select" || tool === "ruler" || tool === "ping" || tool === "draw") return;
    setTable((current) => {
      const existing = current.tokens.find((token) => token.kind === "terrain" && token.x === x && token.y === y);
      if (tool === "erase") {
        return existing ? { ...current, tokens: current.tokens.filter((token) => token.id !== existing.id) } : current;
      }
      const type = tool as TerrainType;
      // Тот же тип уже стоит: в особом режиме переключаем свечение, иначе ничего не делаем.
      if (existing?.terrainType === type) {
        if (existing.variant === terrainSpecial) return current;
        return {
          ...current,
          tokens: current.tokens.map((token) => (token.id === existing.id ? { ...token, variant: terrainSpecial } : token)),
        };
      }
      const tile: TableToken = {
        id: makeTokenId(),
        kind: "terrain",
        name: terrainLabels[type],
        terrainType: type,
        x,
        y,
        color: isMarkerType(type) ? markerMeta[type].color : "#3d4c5c",
        variant: terrainSpecial || undefined,
      };
      return { ...current, tokens: [...current.tokens.filter((token) => token.id !== existing?.id), tile] };
    });
  }

  function spawnPing(x: number, y: number, color: string) {
    const id = makeTokenId();
    setPings((current) => [...current, { id, x, y, color }]);
    window.setTimeout(() => setPings((current) => current.filter((ping) => ping.id !== id)), 2400);
  }

  function handlePing(x: number, y: number) {
    spawnPing(x, y, myColor);
    connRef.current?.sendEvent({ type: "ping", x, y, color: myColor });
  }

  function handleRuler(fx?: RulerFx) {
    connRef.current?.sendEvent({
      type: "ruler",
      clientId,
      color: myColor,
      points: fx?.points,
      // from/to дублируем для клиентов со старой версией стола.
      from: fx?.points[0],
      to: fx ? fx.points[fx.points.length - 1] : undefined,
      cells: fx?.cells,
      cost: fx?.cost,
    });
  }

  // Режим указки: рисунок ярко светится и сам стирается через несколько секунд.
  const [drawMarker, setDrawMarker] = useState(false);
  const [drawColor, setDrawColor] = useState<string>();
  const penColor = drawColor ?? myColor;

  function commitDrawing(points: number[]) {
    const id = makeTokenId();
    const markerTtl = 4000;
    setTable((current) => ({
      ...current,
      drawings: [
        ...current.drawings,
        {
          id,
          color: penColor,
          points,
          glow: drawMarker || undefined,
          expiresAt: drawMarker ? new Date(Date.now() + markerTtl).toISOString() : undefined,
        },
      ].slice(-40),
    }));
    if (drawMarker) {
      window.setTimeout(() => {
        setTable((current) => ({ ...current, drawings: current.drawings.filter((drawing) => drawing.id !== id) }));
      }, markerTtl + 200);
    }
  }

  function clearDrawings() {
    setTable((current) => ({ ...current, drawings: [] }));
  }

  function addBlankHero() {
    const id = makeTokenId();
    setTable((current) => {
      const hp = battleScaleById(current.scaleId).hp;
      const heroCount = current.tokens.filter((token) => token.kind === "hero").length;
      const token: TableToken = {
        id,
        kind: "hero",
        name: `Герой ${heroCount + 1}`,
        ...findFreeCell(current, false),
        color: "#7b42b6",
        hpMax: hp,
        hpCurrent: hp,
        shield: 0,
        armorSpent: false,
        counters: {},
      };
      return { ...current, tokens: [...current.tokens, token] };
    });
    setSelectedId(id);
  }

  function addBlankEnemy() {
    const id = makeTokenId();
    setTable((current) => {
      const hp = battleScaleById(current.scaleId).hp;
      const enemyCount = current.tokens.filter((token) => token.kind === "enemy").length;
      const token: TableToken = {
        id,
        kind: "enemy",
        name: `Враг ${enemyCount + 1}`,
        ...findFreeCell(current, true),
        color: "#c53d2f",
        hpMax: hp,
        hpCurrent: hp,
        shield: 0,
        armorSpent: false,
        counters: {},
        hidden: false,
      };
      return { ...current, tokens: [...current.tokens, token] };
    });
    setSelectedId(id);
  }

  // Смена масштаба боя сразу переставляет HP всем фишкам (гл. 2: у всех
  // участников HP на шкалу одинаковы). Раненым сохраняем долю здоровья.
  function changeScale(scaleId: EnemyScaleId) {
    const scale = battleScaleById(scaleId);
    setTable((current) => ({
      ...current,
      scaleId,
      tokens: current.tokens.map((token) => {
        if (token.kind === "terrain") return token;
        const frac = token.hpMax ? (token.hpCurrent ?? 0) / token.hpMax : 1;
        return { ...token, hpMax: scale.hp, hpCurrent: Math.round(scale.hp * frac), shield: Math.min(token.shield ?? 0, scale.shieldCap) };
      }),
    }));
    log(`Масштаб «${scale.label}»: у всех ${scale.hp} HP на шкалу, лечение ${scale.heal}, щит до ${scale.shieldCap}.`);
  }

  // --- библиотека: готовые враги книги и картотека компаньона ---
  function addRosterEnemy(entry: EnemyRosterEntry) {
    setTable((current) => {
      const enemyColorIndex = new Set(current.tokens.filter((token) => token.kind === "enemy").map((token) => token.name.replace(/\s+\d+$/, ""))).size;
      const added = enemyTokens(current, rosterToEnemyBuild(entry, battleScaleById(current.scaleId).hp), enemyColorIndex)
        .map((token) => ({ ...token, statBlock: entry }));
      setToast(`${entry.name}: фишек на столе +${added.length}. Правила блока — в панели фишки.`);
      return { ...current, tokens: [...current.tokens, ...added] };
    });
  }

  function addCompanionHero(hero: CompanionHero) {
    setTable((current) => {
      const heroCount = current.tokens.filter((token) => token.kind === "hero").length;
      const token = heroToken(current, hero.build, heroCount);
      setToast(`Герой на столе: ${token.name}`);
      return { ...current, tokens: [...current.tokens, token] };
    });
  }

  function addCompanionParty(party: CompanionParty) {
    const heroes = party.heroIds
      .map((id) => bridgeHeroes.find((hero) => hero.id === id))
      .filter((hero): hero is CompanionHero => Boolean(hero));
    setTable((current) => {
      let next = current;
      let index = next.tokens.filter((token) => token.kind === "hero").length;
      heroes.forEach((hero) => {
        next = { ...next, tokens: [...next.tokens, heroToken(next, hero.build, index)] };
        index += 1;
      });
      setToast(`Пачка «${party.name}»: героев на столе +${heroes.length}.`);
      return next;
    });
  }

  function addCompanionScene() {
    setTable((current) => {
      let next = current;
      let added = 0;
      bridgeScene.forEach((enemy, index) => {
        const tokens = enemyTokens(next, enemy, index);
        next = { ...next, tokens: [...next.tokens, ...tokens] };
        added += tokens.length;
      });
      setToast(`Сцена компаньона: врагов на столе +${added}.`);
      return next;
    });
  }

  function refreshBridge() {
    setBridgeHeroes(companionHeroes());
    setBridgeParties(companionParties());
    setBridgeScene(companionSceneRoster());
  }

  async function importFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      try {
        let payload: unknown;
        if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
          payload = await extractPortablePayload(file);
          if (!payload) throw new Error("в PNG нет зашитых данных компаньона");
        } else {
          payload = JSON.parse(await file.text());
        }
        setTable((current) => {
          const result = importCompanionPayload(current, payload);
          setToast(result.message);
          return {
            ...result.state,
            log: [{ id: makeTokenId(), at: new Date().toISOString(), text: result.message }, ...result.state.log].slice(0, 120),
          };
        });
      } catch (error) {
        setToast(`Не удалось импортировать «${file.name}»: ${error instanceof Error ? error.message : "файл не распознан"}`);
      }
    }
  }

  // Бросок стойки/кубиков → активный пул действий ФИШКИ (его и тратят по PatD).
  // Пул на токене: очистка у одной фишки не трогает пулы других игроков.
  // Фиксированные пулы («7 · 5 · 3 · 1») кладутся без броска — по правилам.
  function rollDice(tokenId: string, dice: StanceDice, label: string) {
    if (dice.roll.length === 0 && dice.fixed.length === 0) return;
    const results = rollStance(dice);
    const total = results.reduce((sum, die) => sum + die.value, 0);
    patchToken(tokenId, { pool: { label, dice: results.map((die) => ({ ...die, spent: false })) } });
    setTable((current) => ({
      ...current,
      log: [{ id: makeTokenId(), at: new Date().toISOString(), text: `🎲 ${label}: ${formatRoll(results)} (сумма ${total})` }, ...current.log].slice(0, 120),
    }));
    if (echoToDiscord && discordReady) {
      sendDiscordMessage(discord, `🎲 ${label}: ${formatRoll(results)} (сумма ${total})`).catch(() => undefined);
    }
  }

  function patchPool(tokenId: string, updater: (pool: DicePool) => DicePool | undefined) {
    setTable((current) => ({
      ...current,
      tokens: current.tokens.map((token) => {
        if (token.id !== tokenId) return token;
        const pool = token.pool ?? { label: "Пул", dice: [] };
        return { ...token, pool: updater(pool) };
      }),
    }));
  }

  // Добавить одну свежую кость к пулу фишки (сборка пула на ходу, в т.ч. кастомным врагам).
  function addPoolDie(tokenId: string, sides: number) {
    const value = rollPool([sides])[0].value;
    patchPool(tokenId, (pool) => ({ label: pool.label, dice: [...pool.dice, { sides, value, spent: false }] }));
  }

  function togglePoolDie(tokenId: string, index: number) {
    patchPool(tokenId, (pool) => ({ ...pool, dice: pool.dice.map((die, i) => (i === index ? { ...die, spent: !die.spent } : die)) }));
  }

  // Правка значения кости (бонусы вроде Танцующего в бою).
  function adjustPoolDie(tokenId: string, index: number, delta: number) {
    patchPool(tokenId, (pool) => ({ ...pool, dice: pool.dice.map((die, i) => (i === index ? { ...die, value: Math.max(0, die.value + delta) } : die)) }));
  }

  // Бонус ко всем костям пула (Танцующий в бою: «+1 всем» и т.п.).
  function bumpPoolAll(tokenId: string, delta: number) {
    patchPool(tokenId, (pool) => ({ ...pool, dice: pool.dice.map((die) => ({ ...die, value: Math.max(0, die.value + delta) })) }));
  }

  function clearPool(tokenId: string) {
    patchPool(tokenId, () => undefined);
  }

  // --- фон арены ---
  async function setBackgroundFromFile(file: File) {
    try {
      const { blob, width, height } = await prepareBackgroundImage(file);
      let url: string;
      if (connRef.current) {
        url = await uploadBackground(blob);
      } else {
        url = await blobToDataUrl(blob);
      }
      setTable((current) => ({
        ...current,
        background: fitBackground(url, width, height, current.gridType, current.gridW, current.gridH),
      }));
      setToast("Фон установлен. Подгоните масштаб и положение ползунками.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Не удалось загрузить фон.");
    }
  }

  function patchBackground(patch: Partial<NonNullable<TableState["background"]>>) {
    setTable((current) => (current.background ? { ...current, background: { ...current.background, ...patch } } : current));
  }

  function nextRound() {
    setTable((current) => ({ ...current, round: current.round + 1 }));
    log(`— Раунд ${table.round + 1} —`);
  }

  function resetTable() {
    if (!window.confirm("Очистить стол? Все фишки, террейн, рисунки и лог будут удалены.")) return;
    setTable((current) => ({ ...emptyTable(), name: current.name, gridType: current.gridType, gridW: current.gridW, gridH: current.gridH }));
    setSelectedId(undefined);
  }

  function setGrid(patch: Partial<Pick<TableState, "gridType" | "gridW" | "gridH">>) {
    setTable((current) => {
      const gridW = Math.min(maxGrid, Math.max(minGrid, patch.gridW ?? current.gridW));
      const gridH = Math.min(maxGrid, Math.max(minGrid, patch.gridH ?? current.gridH));
      return {
        ...current,
        gridType: patch.gridType ?? current.gridType,
        gridW,
        gridH,
        tokens: current.tokens.filter((token) => token.x < gridW && token.y < gridH),
      };
    });
  }

  // --- инициатива (правила PatD: чередование сторон, шкалы = ходы, проход раунда) ---
  function startCombat() {
    const initiative = buildCombat(table.tokens);
    setTable((current) => ({ ...current, initiative, round: 1 }));
    log(`⚔️ Бой начат. Первыми ходят герои (ячеек на шкале: ${initiative.slots.length}).`);
  }

  function endCombat() {
    setTable((current) => ({ ...current, initiative: undefined }));
    log("Бой завершён.");
  }

  function assignActive(tokenId: string) {
    const token = table.tokens.find((record) => record.id === tokenId);
    setTable((current) => (current.initiative ? { ...current, initiative: assignCurrentSlot(current.initiative, tokenId) } : current));
    setSelectedId(tokenId);
    if (token) log(`Ход берёт ${token.name}.`);
  }

  // Откат «Следующего хода»: возвращаемся к снимку шкалы (жетоны скорости не восстанавливаются).
  function prevTurn() {
    setTable((current) => {
      const prev = current.initiative?.prev;
      if (!prev) return current;
      return {
        ...current,
        initiative: prev,
        round: prev.round,
        log: [{ id: makeTokenId(), at: new Date().toISOString(), text: "↩ Ход возвращён на шаг назад." }, ...current.log].slice(0, 120),
      };
    });
  }

  function nextTurn() {
    setTable((current) => {
      if (!current.initiative) return current;
      // Конец хода (фаза 8): все сбрасывают жетоны скорости.
      const tokens = current.tokens.map((token) =>
        token.counters?.speed ? { ...token, counters: { ...token.counters, speed: 0 } } : token,
      );
      const { initiative, roundAdvanced } = advanceSlot(current.initiative, tokens);
      const nextLog = roundAdvanced
        ? [{ id: makeTokenId(), at: new Date().toISOString(), text: `— Раунд ${initiative.round}: вернулись выбывшие, обновились способности «раз в раунд». —` }, ...current.log].slice(0, 120)
        : current.log;
      return { ...current, tokens, initiative, round: initiative.round, log: nextLog };
    });
    setSelectedId(undefined);
  }

  // Всего шкал (= ходов за раунд) у стороны; распределяем поровну между её юнитами.
  // Пачка статистов считается одним юнитом (общий groupId), минимум 1 шкала на юнит.
  function applySideBars(side: "hero" | "enemy", value: number) {
    const total = Math.min(20, Math.max(1, Math.round(value) || 1));
    setTable((current) => {
      // Список юнитов стороны без дублей группы.
      const seen = new Set<string>();
      const groupKeys: string[] = [];
      for (const token of current.tokens) {
        if (token.kind !== side) continue;
        const key = token.groupId ?? token.id;
        if (seen.has(key)) continue;
        seen.add(key);
        groupKeys.push(key);
      }
      const n = groupKeys.length;
      const barsByKey = new Map<string, number>();
      if (n > 0) {
        const base = Math.floor(total / n);
        const remainder = total - base * n;
        groupKeys.forEach((key, index) => barsByKey.set(key, Math.max(1, base + (index < remainder ? 1 : 0))));
      }
      return {
        ...current,
        [side === "hero" ? "heroBars" : "enemyBars"]: total,
        tokens: current.tokens.map((token) =>
          token.kind === side ? { ...token, bars: barsByKey.get(token.groupId ?? token.id) ?? 1 } : token,
        ),
      };
    });
    log(`Сторона «${side === "hero" ? "герои" : "враги"}»: ${total} шкал(ы) на раунд, поделены между юнитами.`);
  }

  // Заглушка/метка: двигающаяся фишка без HP и трекеров (декор, маркер зоны, «клон»).
  function addBlankProp() {
    const id = makeTokenId();
    setTable((current) => {
      const propCount = current.tokens.filter((token) => token.kind === "prop").length;
      const token: TableToken = {
        id,
        kind: "prop",
        name: `Метка ${propCount + 1}`,
        ...findFreeCell(current, false),
        color: "#6b7885",
        counters: {},
      };
      return { ...current, tokens: [...current.tokens, token] };
    });
    setSelectedId(id);
  }

  const board = boardSize(table.gridType, table.gridW, table.gridH);
  const activeTurnTokenId = table.initiative?.active ? table.initiative.slots[table.initiative.slot]?.tokenId : undefined;

  return (
    <main
      className="tableShell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
      }}
    >
      <header className="tableTopbar">
        <div className="tableBrand">
          <span className="brandMark">道</span>
          <div>
            <h1>Стол</h1>
            <p>Паника в Додзе</p>
          </div>
        </div>
        <input
          className="tableNameInput"
          value={table.name}
          onChange={(event) => setTable((current) => ({ ...current, name: event.target.value }))}
          aria-label="Название арены"
          disabled={!isGM}
        />

        <div className="roomBar">
          {roomCode ? (
            <>
              <button
                className="roomCode"
                title="Скопировать код комнаты"
                onClick={() => {
                  navigator.clipboard?.writeText(roomCode).catch(() => undefined);
                  setToast(`Код комнаты скопирован: ${roomCode}`);
                }}
              >
                {roomStatus === "connected" ? <Wifi size={14} /> : <WifiOff size={14} />}
                {roomCode}
                <Copy size={12} />
              </button>
              <span className="roomMeta"><Users size={13} />{participants || 1}</span>
              <button onClick={leaveRoom} title="Покинуть комнату"><DoorOpen size={14} /></button>
            </>
          ) : (
            <>
              <input
                value={joinDraft}
                onChange={(event) => setJoinDraft(event.target.value.toUpperCase())}
                placeholder="КОД"
                maxLength={12}
                aria-label="Код комнаты"
              />
              <button disabled={roomBusy || joinDraft.trim().length < 4} onClick={() => void joinRoomAction()}>Войти</button>
              <button disabled={roomBusy} onClick={() => void createRoomAction()}>Создать комнату</button>
            </>
          )}
          {roomCode ? (
            isGM ? (
              <button
                className="gmToggle gmConfirmed"
                title="Права ГМа подтверждены. Нажмите, чтобы скопировать ключ для другого устройства."
                onClick={() => {
                  if (!gmKey) return;
                  navigator.clipboard?.writeText(gmKey).catch(() => undefined);
                  setToast("Ключ ГМа скопирован.");
                }}
              >
                <KeyRound size={13} /> ГМ
              </button>
            ) : (
              <button className="gmToggle" title="Подтвердить права ключом комнаты" onClick={() => void claimGmRole()}>
                <KeyRound size={13} /> Стать ГМ
              </button>
            )
          ) : (
            <span className="gmToggle gmConfirmed" title="В локальном столе вы управляете всеми функциями">
              <KeyRound size={13} /> локальный ГМ
            </span>
          )}
        </div>

        <div className="tableTopActions">
          <a
            className="companionLink"
            href={window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:5177/" : "../"}
            title="Открыть компаньон (билдер, справочник, мастерская)"
          >
            <BookOpen size={14} /> Компаньон
          </a>
          <span className="roundBadge"><Flag size={14} /> Раунд {table.round}</span>
          {!table.initiative?.active && <button disabled={!isGM} onClick={nextRound}>Новый раунд</button>}
          <button className="dangerGhost" disabled={!isGM} onClick={resetTable}><RotateCcw size={14} />Очистить</button>
        </div>
      </header>

      <div className="tableLayout">
        <aside className="tablePalette">
          <section>
            <h3>Инструмент</h3>
            <div className="toolGrid">
              <button className={tool === "select" ? "active" : ""} onClick={() => setTool("select")} title="Выбор и перемещение"><MousePointer2 size={16} /></button>
              <button className={tool === "ruler" ? "active" : ""} onClick={() => setTool("ruler")} title="Линейка (дистанция в клетках)"><Ruler size={16} /></button>
              <button className={tool === "ping" ? "active" : ""} onClick={() => setTool("ping")} title="Пинг: привлечь внимание к точке"><LocateFixed size={16} /></button>
              <button className={tool === "draw" ? "active" : ""} onClick={() => setTool("draw")} title="Временный рисунок"><PencilLine size={16} /></button>
              <button disabled={!isGM} className={tool === "erase" ? "active" : ""} onClick={() => setTool("erase")} title="Стереть террейн (ГМ)"><Eraser size={16} /></button>
              {pngTerrainTypes.map((type) => (
                <button disabled={!isGM} key={type} className={`terrainBtn ${tool === type ? "active" : ""}`} onClick={() => setTool(type)} title={`${terrainLabels[type]} (ГМ)`}>
                  <img className={`terrain-${type}`} src={`./terrain/${type}.png`} alt={terrainLabels[type]} />
                </button>
              ))}
              {markerTypes.map((type) => (
                <button
                  key={type}
                  className={`markerBtn ${tool === type ? "active" : ""}`}
                  style={{ color: markerMeta[type].color }}
                  disabled={!isGM}
                  onClick={() => setTool(type)}
                  title={`${terrainLabels[type]} (метка для клонов/целей/зон)`}
                >
                  {markerMeta[type].glyph}
                </button>
              ))}
            </div>
            {(pngTerrainTypes.includes(tool as (typeof pngTerrainTypes)[number]) || markerTypes.includes(tool as (typeof markerTypes)[number])) && (
              <label className="echoToggle terrainSpecialToggle" title="Помечать поставленное свечением — «эта стена/ловушка не как все» (магия и т.п.); повторный клик по клетке переключает метку">
                <input type="checkbox" checked={terrainSpecial} onChange={(event) => setTerrainSpecial(event.target.checked)} />
                особая метка (свечение)
              </label>
            )}
            <div className="toolFootRow">
              <p className="paletteHint">
                {tool === "select" && "Перетаскивайте фишки мышью."}
                {tool === "ruler" && "Зажмите и тяните: дистанция видна всем; правая кнопка или Shift — залом."}
                {tool === "ping" && "Кликните точку — у всех мигнёт метка."}
                {tool === "draw" && "Рисуйте зажатой мышью; линии видят все."}
                {tool === "erase" && "Кликайте по клеткам, чтобы стирать террейн."}
                {tool !== "select" && tool !== "ruler" && tool !== "ping" && tool !== "draw" && tool !== "erase" &&
                  `Кликайте/протягивайте по клеткам: ${terrainLabels[tool as TerrainType]}.`}
              </p>
              {isGM && table.drawings.length > 0 && (
                <button className="miniBtn" onClick={clearDrawings} title="Стереть все рисунки">Стереть рисунки ({table.drawings.length})</button>
              )}
            </div>
            {tool === "draw" && (
              <div className="drawOptions">
                <div className="drawSwatches">
                  {["#e0b13e", "#4fb0e8", "#e8654f", "#59c98a", "#c06ce8", "#f2f2f2"].map((color) => (
                    <button
                      key={color}
                      className={`drawSwatch ${penColor === color ? "active" : ""}`}
                      style={{ background: color }}
                      title="Цвет карандаша"
                      aria-label={`Цвет ${color}`}
                      onClick={() => setDrawColor(color)}
                    />
                  ))}
                </div>
                <label className="echoToggle" title="Указка: линия ярко светится и исчезает сама через пару секунд">
                  <input type="checkbox" checked={drawMarker} onChange={(event) => setDrawMarker(event.target.checked)} />
                  указка (само-стирание)
                </label>
              </div>
            )}
          </section>

          <section>
            <h3>Фишки</h3>
            <div className="paletteButtons">
              <button onClick={addBlankHero}><UserRound size={15} />Герой</button>
              <button disabled={!isGM} onClick={addBlankEnemy}><Swords size={15} />Враг</button>
              <button disabled={!isGM} onClick={addBlankProp} title="Двигающаяся заглушка без HP: декор, маркер зоны, «клон»"><Shapes size={15} />Заглушка</button>
            </div>
            <div className="sideBarsRow" title="Всего шкал (= ходов за раунд) у стороны; делятся поровну между её юнитами">
              <span>Шкал у стороны:</span>
              <label>герои
                <input
                  disabled={!isGM} type="number" min={1} max={20} value={table.heroBars ?? 1}
                  onChange={(event) => applySideBars("hero", Number(event.target.value))}
                  aria-label="Всего шкал у героев"
                />
              </label>
              <label>враги
                <input
                  disabled={!isGM} type="number" min={1} max={20} value={table.enemyBars ?? 1}
                  onChange={(event) => applySideBars("enemy", Number(event.target.value))}
                  aria-label="Всего шкал у врагов"
                />
              </label>
            </div>
          </section>

          {(data.enemyRoster?.length ?? 0) > 0 && (
            <section>
              <h3><BookOpen size={14} /> Враги книги</h3>
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Поиск: имя, банда, стиль"
                aria-label="Поиск готового врага"
              />
              <div className="filterChips">
                <button className={libraryGroup === "" ? "active" : ""} onClick={() => setLibraryGroup("")}>Все</button>
                {rosterGroups.map((group) => (
                  <button key={group} className={libraryGroup === group ? "active" : ""} onClick={() => setLibraryGroup(group)}>{group}</button>
                ))}
              </div>
              <div className="libraryList">
                {filteredRoster.length === 0 && <p className="mutedLine">Никого не нашлось — упростите запрос.</p>}
                {filteredRoster.map((entry) => (
                  <button disabled={!isGM} key={entry.id} onClick={() => addRosterEnemy(entry)} title={`${entry.flavor}\n\nДальность: ${entry.range} · ${entry.dice}`}>
                    <strong>{entry.name}</strong>
                    <small>
                      {entry.group} · {entry.kind === "stooge" ? `статисты ×${entry.count}` : entry.kind === "warrior" ? "воин" : "босс"}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="enemySectionTitle">
              <h3><Link2 size={14} /> Из компаньона</h3>
              <button className="miniBtn" title="Перечитать картотеку компаньона" onClick={refreshBridge}><RefreshCw size={13} /></button>
            </div>
            {bridgeHeroes.length === 0 && bridgeScene.length === 0 ? (
              <p className="mutedLine">
                Картотека не найдена. Она видна, когда компаньон и стол открыты с одного адреса (на Pages это уже так) и в компаньоне есть сохранённые герои или сцена.
              </p>
            ) : (
              <div className="libraryList">
                {bridgeParties
                  .filter((party) => party.heroIds.length > 0)
                  .map((party) => (
                    <button key={party.id} onClick={() => addCompanionParty(party)}>
                      <strong>Пачка: {party.name}</strong>
                      <small>{party.heroIds.length} героев — все на стол</small>
                    </button>
                  ))}
                {bridgeHeroes.map((hero) => (
                  <button key={hero.id} onClick={() => addCompanionHero(hero)}>
                    <strong>{hero.name}</strong>
                    <small>{hero.playerName ? `игрок: ${hero.playerName}` : "герой из картотеки"}</small>
                  </button>
                ))}
                {bridgeScene.length > 0 && (
                  <button onClick={addCompanionScene}>
                    <strong>Сцена из Мастерской</strong>
                    <small>{bridgeScene.map((enemy) => `${enemy.count} × ${enemy.name || "враг"}`).join(" · ")}</small>
                  </button>
                )}
              </div>
            )}
          </section>

          <section>
            <h3>Поле и масштаб</h3>
            <div className="gridControls">
              <select disabled={!isGM} value={table.gridType} onChange={(event) => setGrid({ gridType: event.target.value as GridType })} aria-label="Тип сетки">
                <option value="square">Квадраты</option>
                <option value="hex">Гексы</option>
              </select>
              <input disabled={!isGM} type="number" min={minGrid} max={maxGrid} value={table.gridW} onChange={(event) => setGrid({ gridW: Number(event.target.value) })} aria-label="Ширина поля" />
              <span>×</span>
              <input disabled={!isGM} type="number" min={minGrid} max={maxGrid} value={table.gridH} onChange={(event) => setGrid({ gridH: Number(event.target.value) })} aria-label="Высота поля" />
            </div>
            <div className="gridPresets">
              {[
                { label: "Разминка 9×7", gridType: "square" as GridType, gridW: 9, gridH: 7 },
                { label: "Книжная 13×13", gridType: "square" as GridType, gridW: 13, gridH: 13 },
                { label: "Гексы 13×10", gridType: "hex" as GridType, gridW: 13, gridH: 10 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  className={table.gridType === preset.gridType && table.gridW === preset.gridW && table.gridH === preset.gridH ? "active" : ""}
                  disabled={!isGM}
                  onClick={() => setGrid(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <select
              className="scaleSelect"
              value={table.scaleId ?? "feather"}
              disabled={!isGM}
              onChange={(event) => changeScale(event.target.value as EnemyScaleId)}
              aria-label="Масштаб боя"
            >
              {battleScales.map((scale) => (
                <option key={scale.id} value={scale.id}>Масштаб: {scale.label} ({scale.hp} HP)</option>
              ))}
            </select>
            <p className="paletteHint">
              {battleScale.hp} HP на шкалу · лечение {battleScale.heal} · щит до {battleScale.shieldCap}. Смена масштаба переставит HP всем фишкам.
            </p>
          </section>

          {isGM && (
            <section>
              <h3><ImagePlus size={14} /> Фон арены</h3>
              {!table.background ? (
                <label className="importDrop">
                  <ImagePlus size={16} />
                  <span>Загрузить карту/фон (jpg, png). Ужмётся и, в комнате, уедет в облако.</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void setBackgroundFromFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              ) : (
                <div className="bgControls">
                  <label>Масштаб
                    <input type="range" min={0.1} max={4} step={0.02} value={table.background.scale}
                      onChange={(event) => patchBackground({ scale: Number(event.target.value) })} />
                  </label>
                  <label>Сдвиг ←→
                    <input type="range" min={-board.x} max={board.x} step={4} value={table.background.x}
                      onChange={(event) => patchBackground({ x: Number(event.target.value) })} />
                  </label>
                  <label>Сдвиг ↑↓
                    <input type="range" min={-board.y} max={board.y} step={4} value={table.background.y}
                      onChange={(event) => patchBackground({ y: Number(event.target.value) })} />
                  </label>
                  <label>Прозрачность
                    <input type="range" min={0.15} max={1} step={0.05} value={table.background.opacity}
                      onChange={(event) => patchBackground({ opacity: Number(event.target.value) })} />
                  </label>
                  <div className="paletteButtons">
                    <button
                      className="miniBtn"
                      onClick={() =>
                        setTable((current) =>
                          current.background
                            ? { ...current, background: fitBackground(current.background.url, current.background.natW, current.background.natH, current.gridType, current.gridW, current.gridH) }
                            : current,
                        )
                      }
                    >
                      Вписать в поле
                    </button>
                    <button className="miniBtn dangerGhost" onClick={() => setTable((current) => ({ ...current, background: undefined }))}>Убрать фон</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <h3>Импорт</h3>
            <label className="importDrop">
              <Upload size={17} />
              <span>JSON или PNG-карточка из компаньона: герой, пачка, враг, сцена. Можно просто перетащить на стол.</span>
              <input
                type="file"
                multiple
                accept="application/json,.json,image/png"
                onChange={(event) => {
                  if (event.target.files?.length) void importFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </section>

          <section>
            <h3><Webhook size={14} /> Discord</h3>
            <input
              type="password"
              value={discord.webhookUrl}
              onChange={(event) => setDiscord((current) => ({ ...current, webhookUrl: event.target.value }))}
              placeholder="ссылка вебхука канала"
            />
            <label className="echoToggle">
              <input type="checkbox" checked={echoToDiscord} disabled={!discordReady} onChange={(event) => setEchoToDiscord(event.target.checked)} />
              дублировать лог в канал
            </label>
          </section>
        </aside>

        <section className="boardArea" ref={boardAreaRef}>
          <div className="boardZoomControls">
            <button onClick={() => zoomDelta(1 / 1.25)} disabled={zoom <= minZoom} title="Отдалить" aria-label="Отдалить"><ZoomOut size={15} /></button>
            <span className="zoomValue">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomDelta(1.25)} disabled={zoom >= maxZoom} title="Приблизить" aria-label="Приблизить"><ZoomIn size={15} /></button>
            <button onClick={() => setZoom(1)} disabled={Math.abs(zoom - 1) < 0.001} title="Вписать поле целиком" aria-label="Вписать поле"><Maximize size={15} /></button>
            <button
              className={overlaysPinned || overlaysHold ? "toggled" : ""}
              onClick={() => setOverlaysPinned((current) => !current)}
              title="Показатели на всех фишках: HP-кольцо и жетоны (или удерживайте Alt)"
              aria-label="Показатели на фишках"
            >
              <Eye size={15} />
            </button>
          </div>
          <div className="boardViewport">
            <Board
              table={table}
              selectedId={selectedId}
              activeTurnId={activeTurnTokenId}
              tool={tool}
              isGM={isGM}
              showOverlays={overlaysPinned || overlaysHold}
              rangeByToken={rangeByToken}
              ignoreWallsByToken={ignoreWallsByToken}
              drawColor={penColor}
              drawGlow={drawMarker}
              remoteRulers={remoteRulers}
              pings={pings}
              zoom={zoom}
              onZoomDelta={zoomDelta}
              onSelect={setSelectedId}
              onMove={(id, x, y) => patchToken(id, { x, y })}
              onCellAction={cellAction}
              onDrawCommit={commitDrawing}
              onPing={handlePing}
              onRuler={handleRuler}
            />
          </div>

          {/* Док костей выбранной фишки. Строка 1 — сборка пула (клик добавляет кость),
              строка 2 — активный пул фишки (тратится по значениям). Пул на токене:
              очистка у одной фишки не трогает пулы других игроков. */}
          <div className="diceDock">
            <div className="dockButtons">
              <Dices size={15} className="dockIcon" />
              {[4, 6, 8, 10, 12].map((sides) => (
                <button
                  key={sides}
                  disabled={!selected || selected.kind === "terrain"}
                  title={selected ? `Добавить к${sides} в пул: ${selected.name}` : "Выберите фишку"}
                  onClick={() => selected && addPoolDie(selected.id, sides)}
                >
                  к{sides}
                </button>
              ))}
              {!selected && <span className="dockHint">выберите фишку</span>}
            </div>
            {selected && selected.pool && selected.pool.dice.length > 0 && (
              <div className="dockPool">
                <div className="dockPoolHead">
                  <span className="trayLabel">{selected.pool.label}</span>
                  <span className="poolSum">остаток {poolRemaining(selected.pool)}</span>
                  <button className="miniBtn" title="+1 всем костям (Танцующий и т.п.)" onClick={() => bumpPoolAll(selected.id, 1)}>+1 всем</button>
                  <button className="miniBtn" title="Очистить пул этой фишки" onClick={() => clearPool(selected.id)}><X size={13} /></button>
                </div>
                <PoolDice pool={selected.pool} onToggle={(i) => togglePoolDie(selected.id, i)} onAdjust={(i, d) => adjustPoolDie(selected.id, i, d)} />
              </div>
            )}
          </div>
        </section>

        <aside className="tableSide">
          <InitiativePanel
            initiative={table.initiative}
            tokens={table.tokens}
            data={data}
            isGM={isGM}
            startCombat={startCombat}
            endCombat={endCombat}
            assignActive={assignActive}
            nextTurn={nextTurn}
            prevTurn={prevTurn}
            focusToken={setSelectedId}
            patchToken={patchToken}
            rollDice={rollDice}
            togglePoolDie={togglePoolDie}
            adjustPoolDie={adjustPoolDie}
            bumpPoolAll={bumpPoolAll}
          />

          {selected ? (
            <TokenPanel
              token={selected}
              data={data}
              isGM={isGM}
              scale={battleScale}
              patchToken={(patch) => patchToken(selected.id, patch)}
              removeToken={() => removeToken(selected.id)}
              rollDice={(dice, label) => rollDice(selected.id, dice, label)}
              log={log}
            />
          ) : (
            <div className="sidePlaceholder">
              <p>Выберите фишку на поле — здесь появятся её трекеры, стойки и кости.</p>
              <p className="mutedLine">
                {roomCode
                  ? `Комната ${roomCode}: изменения видят все участники.`
                  : "Создайте комнату, чтобы играть с другими на своих устройствах."}
              </p>
            </div>
          )}

          <section className="logPanel">
            <h3>Лог стола {echoToDiscord && discordReady ? <Send size={13} /> : null}</h3>
            <div className="logList">
              {table.log.length === 0 && <p className="mutedLine">Пока пусто: броски и события появятся здесь.</p>}
              {table.log.map((entry) => (
                <p key={entry.id}>
                  <time>{new Date(entry.at).toLocaleTimeString()}</time>
                  {entry.text}
                </p>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {toast && (
        <div className="tableToast" role="status" onClick={() => setToast("")}>
          {toast}
        </div>
      )}
    </main>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crashScreen">
        <h1>道 Стол споткнулся</h1>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => window.location.reload()}>Перезагрузить</button>
      </div>
    );
  }
}

const rootElement = document.getElementById("root") as HTMLElement & { _dojoRoot?: ReturnType<typeof createRoot> };
const root = rootElement._dojoRoot ?? createRoot(rootElement);
rootElement._dojoRoot = root;

function AttributionFooter() {
  return (
    <footer
      style={{
        padding: "10px 12px",
        textAlign: "center",
        fontSize: 11,
        lineHeight: 1.5,
        opacity: 0.5,
      }}
    >
      Неофициальный перевод и инструменты по игре{" "}
      <a href="https://liberigothica.itch.io/panic-at-the-dojo" target="_blank" rel="noopener noreferrer">
        Panic at the Dojo
      </a>{" "}
      (© Vel Mini / Liberi Gothica Games), контент под{" "}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
        CC&nbsp;BY-SA&nbsp;4.0
      </a>
      . Перевод/адаптация распространяются под той же лицензией. Иллюстрации принадлежат их авторам. Иконки интерфейса —{" "}
      <a href="https://lucide.dev/" target="_blank" rel="noopener noreferrer">
        Lucide
      </a>{" "}
      (
      <a href="https://lucide.dev/license" target="_blank" rel="noopener noreferrer">
        ISC
      </a>
      ).
    </footer>
  );
}

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <AttributionFooter />
    </ErrorBoundary>
  </React.StrictMode>,
);

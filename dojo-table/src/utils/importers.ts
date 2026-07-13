import type { CharacterBuild, EnemyBuild } from "../companionTypes";
import type { TableState, TableToken } from "../types";

// Превращает файлы компаньона (контракт type/schemaVersion из docs/vtt-план.md)
// в фишки стола. Полный билд зашивается в фишку — стол автономен.

export interface SavedHeroLike {
  id: string;
  name: string;
  playerName?: string;
  build: CharacterBuild;
}

const heroColors = ["#7b42b6", "#2b6cb0", "#1f7a4c", "#b56a2c", "#8a2ca8", "#2c8ab5"];
const enemyColors = ["#c53d2f", "#a33b57", "#b0542b", "#8f2f45"];

export function makeTokenId() {
  return `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Свободная клетка ближе к краю поля: герои встают слева, враги справа.
export function findFreeCell(state: TableState, fromRight: boolean): { x: number; y: number } {
  const occupied = new Set(state.tokens.filter((token) => token.kind !== "terrain").map((token) => `${token.x}:${token.y}`));
  const columns = Array.from({ length: state.gridW }, (_, i) => (fromRight ? state.gridW - 1 - i : i));
  for (const x of columns) {
    for (let y = 0; y < state.gridH; y += 1) {
      if (!occupied.has(`${x}:${y}`)) return { x, y };
    }
  }
  return { x: fromRight ? state.gridW - 1 : 0, y: 0 };
}

export function heroToken(state: TableState, build: CharacterBuild, index = 0): TableToken {
  const pos = findFreeCell(state, false);
  return {
    id: makeTokenId(),
    kind: "hero",
    name: build.characterName.trim() || "Герой",
    ...pos,
    color: heroColors[index % heroColors.length],
    hpMax: 6,
    hpCurrent: 6,
    shield: 0,
    armorSpent: false,
    counters: {},
    activeStance: 0,
    image: build.portrait,
    build,
  };
}

export function enemyTokens(state: TableState, enemy: EnemyBuild, colorIndex = 0): TableToken[] {
  const count = Math.max(1, Math.min(12, Number(enemy.count) || 1));
  // Пачка статистов — один юнит: общая группа даёт общие HP/жетоны и один ход за раунд.
  const groupId = enemy.kind === "stooge" && count > 1 ? makeTokenId() : undefined;
  const result: TableToken[] = [];
  const working: TableState = { ...state, tokens: [...state.tokens] };
  for (let i = 0; i < count; i += 1) {
    const pos = findFreeCell(working, true);
    const token: TableToken = {
      id: makeTokenId(),
      kind: "enemy",
      name: count > 1 ? `${enemy.name || "Враг"} ${i + 1}` : enemy.name || "Враг",
      ...pos,
      color: enemyColors[colorIndex % enemyColors.length],
      hpMax: Math.max(1, Number(enemy.hpMax) || 1),
      hpCurrent: Math.max(0, Number(enemy.hpCurrent) || Number(enemy.hpMax) || 1),
      shield: Math.max(0, Number(enemy.shield) || 0),
      armorSpent: Boolean(enemy.armorSpent),
      counters: { ...(enemy.tokens ?? {}) },
      // Босс по умолчанию с двумя шкалами (ходами за раунд) — подгоните под число героев.
      bars: enemy.kind === "boss" ? 2 : undefined,
      groupId,
      enemy,
    };
    result.push(token);
    working.tokens.push(token);
  }
  return result;
}

export interface ImportResult {
  state: TableState;
  message: string;
}

// Принимает любой payload компаньона; бросает Error, если формат не распознан.
export function importCompanionPayload(state: TableState, payload: unknown): ImportResult {
  const record = payload as {
    type?: string;
    build?: unknown;
    party?: { name?: string };
    heroes?: SavedHeroLike[];
    scene?: { name?: string };
    roster?: EnemyBuild[];
    current?: EnemyBuild;
  };
  const type = record.type ?? "";

  if (type.includes("party") && Array.isArray(record.heroes)) {
    let next = state;
    let added = 0;
    record.heroes.forEach((hero) => {
      if (!hero?.build) return;
      next = { ...next, tokens: [...next.tokens, heroToken(next, hero.build, added)] };
      added += 1;
    });
    return { state: next, message: `Пачка «${record.party?.name ?? ""}»: героев на столе +${added}.` };
  }

  if ((type.includes("character") || looksLikeCharacter(record.build)) && record.build) {
    const heroCount = state.tokens.filter((token) => token.kind === "hero").length;
    const token = heroToken(state, record.build as CharacterBuild, heroCount);
    return { state: { ...state, tokens: [...state.tokens, token] }, message: `Герой на столе: ${token.name}` };
  }

  if (type.includes("enemy") && record.build) {
    const added = enemyTokens(state, record.build as EnemyBuild);
    return { state: { ...state, tokens: [...state.tokens, ...added] }, message: `Врагов на столе +${added.length}.` };
  }

  if (type.includes("encounter") || Array.isArray(record.roster)) {
    let next: TableState = {
      ...state,
      name: record.scene?.name?.trim() || state.name,
    };
    let added = 0;
    (record.roster ?? []).forEach((enemy, index) => {
      const tokens = enemyTokens(next, enemy, index);
      next = { ...next, tokens: [...next.tokens, ...tokens] };
      added += tokens.length;
    });
    return { state: next, message: `Сцена «${next.name}»: врагов на столе +${added}.` };
  }

  throw new Error("Файл не распознан: ожидается герой, пачка, враг или сцена из компаньона.");
}

function looksLikeCharacter(build: unknown): boolean {
  return Boolean(build && Array.isArray((build as CharacterBuild).stances));
}

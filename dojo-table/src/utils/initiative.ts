import type { InitiativeSlot, InitiativeState, TableToken } from "../types";
import { makeTokenId } from "./importers";

// Инициатива по правилам «Паники в Додзе» (раздел «Шкала инициативы»):
// - ячеек на шкале = числу шкал здоровья в бою;
// - первая ячейка всегда за героями, дальше строгое чередование сторон;
// - юнит с несколькими шкалами здоровья делает столько ходов за раунд
//   (босс с 4 шкалами = 4 хода), даже если часть шкал уже сломана;
// - раунд = полный проход шкалы сверху вниз.

// 8 фаз хода (раздел «Ход по шагам») — показываются как подсказка Ведущему/игроку.
export const turnPhases: { title: string; detail: string }[] = [
  { title: "Выбор стойки", detail: "Активный выбирает стойку. В самый первый ход боя — пропускается (деретесь в стартовой стойке). Возвращение: выбывший может заплатить 3 HP и вернуться у края." },
  { title: "Начало хода", detail: "Разрешаются срабатывания «в начале хода» в порядке на выбор активного." },
  { title: "Героический дух", detail: "Если активный выведен из боя — передаёт ход союзнику (тот активен с фазы 5)." },
  { title: "Кости действий", detail: "Бросьте кости стойки → пул действий. Добавляющие кости — до броска, меняющие числа — после." },
  { title: "Ранняя фаза движения", detail: "Все, кроме активного, могут свободно переместиться (сначала союзники, затем враги)." },
  { title: "Действия и реакции", detail: "Активный тратит числа по одному действию; перед каждым может свободно двигаться. После каждого — остальные по одной реакции." },
  { title: "Поздняя фаза движения", detail: "У кого остались жетоны скорости — свободно двигаются (активный, союзники, враги)." },
  { title: "Конец хода", detail: "Срабатывания «в конце хода» → ловушки 1 урон → горение/вызов → все сбрасывают скорость → неподвижный сбрасывает до 3 усталости → пул опустошается." },
];

export function tokenBars(token: TableToken): number {
  return Math.max(1, Math.min(9, Math.round(token.bars ?? 1)));
}

// Группа статистов (groupId) — один юнит: одна ячейка на шкале, общие ходы.
export function unitKey(token: TableToken): string {
  return token.groupId ?? token.id;
}

// Юниты стороны без дублей группы (пачка статистов представлена одной фишкой).
function sideUnits(tokens: TableToken[], side: "hero" | "enemy"): TableToken[] {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    if (token.kind !== side) return false;
    const key = unitKey(token);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Строит последовательность ячеек раунда: H E H E …, хвост — у стороны с избытком шкал.
export function buildRoundSlots(tokens: TableToken[]): InitiativeSlot[] {
  const heroBars = sideUnits(tokens, "hero").reduce((sum, t) => sum + tokenBars(t), 0);
  const enemyBars = sideUnits(tokens, "enemy").reduce((sum, t) => sum + tokenBars(t), 0);
  const slots: InitiativeSlot[] = [];
  let h = heroBars;
  let e = enemyBars;
  let side: "hero" | "enemy" = "hero"; // первая ячейка всегда за героями
  while (h > 0 || e > 0) {
    if (side === "hero") {
      if (h > 0) {
        slots.push({ side: "hero" });
        h -= 1;
      }
      side = "enemy";
    } else {
      if (e > 0) {
        slots.push({ side: "enemy" });
        e -= 1;
      }
      side = "hero";
    }
  }
  return slots;
}

// Юниты стороны, которые ещё не израсходовали свои ходы (шкалы) в этом раунде.
// Ходы считаются на юнит: у группы статистов ход любой фишки тратит ход всей пачки.
export function eligibleTokens(tokens: TableToken[], slots: InitiativeSlot[], side: "hero" | "enemy"): TableToken[] {
  const keyById = new Map(tokens.map((token) => [token.id, unitKey(token)]));
  const assigned = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.tokenId) continue;
    const key = keyById.get(slot.tokenId) ?? slot.tokenId;
    assigned.set(key, (assigned.get(key) ?? 0) + 1);
  }
  return sideUnits(tokens, side).filter((token) => (assigned.get(unitKey(token)) ?? 0) < tokenBars(token));
}

export function startCombat(tokens: TableToken[]): InitiativeState {
  return {
    active: true,
    round: 1,
    slot: 0,
    phase: 1,
    slots: buildRoundSlots(tokens),
  };
}

export interface AdvanceResult {
  initiative: InitiativeState;
  roundAdvanced: boolean;
}

// Цепочка снимков для отката хода: храним не глубже 10 шагов.
function trimHistory(state: InitiativeState, depth = 10): InitiativeState {
  if (depth <= 0 || !state.prev) return { ...state, prev: undefined };
  return { ...state, prev: trimHistory(state.prev, depth - 1) };
}

// Следующая ячейка. Дойдя до конца шкалы — новый раунд (пересобираем ячейки).
// Перед сдвигом запоминаем снимок: «Вернуть ход» откатывает шкалу назад.
export function advanceSlot(state: InitiativeState, tokens: TableToken[]): AdvanceResult {
  const prev = trimHistory(state);
  const nextSlot = state.slot + 1;
  if (nextSlot >= state.slots.length) {
    return {
      initiative: { ...state, round: state.round + 1, slot: 0, phase: 1, slots: buildRoundSlots(tokens), prev },
      roundAdvanced: true,
    };
  }
  return { initiative: { ...state, slot: nextSlot, phase: 1, prev }, roundAdvanced: false };
}

export function assignCurrentSlot(state: InitiativeState, tokenId: string): InitiativeState {
  const slots = state.slots.map((slot, index) => (index === state.slot ? { ...slot, tokenId } : slot));
  return { ...state, slots, phase: 1 };
}

export const makeInitiativeId = makeTokenId;

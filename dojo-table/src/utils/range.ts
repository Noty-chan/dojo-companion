import type { BuilderData } from "../companionTypes";
import type { GridType, TableToken } from "../types";
import { CELL, cellCenter, cellDistance, pointToCell } from "./grid";

// Дальность стойки: у героев — из стиля активной стойки («1-2 · Роль: Защита»),
// у врагов — из строки «Дальность: 2–4» в заметках блока. Поддерживаются списки
// диапазонов («0, 2–4») — каждый отрезок подсвечивается.

export type RangeSpec = Array<[number, number]>;

export function parseRangeSpec(text?: string): RangeSpec | undefined {
  if (!text) return undefined;
  // Берём часть до «·» (после идёт роль) и режем по запятым на отрезки.
  const head = text.split("·")[0];
  const spec: RangeSpec = [];
  for (const part of head.split(",")) {
    const match = part.match(/(\d+)\s*[-–—]\s*(\d+)/);
    if (match) {
      spec.push([Number(match[1]), Number(match[2])]);
      continue;
    }
    const single = part.match(/\d+/);
    if (single) spec.push([Number(single[0]), Number(single[0])]);
  }
  return spec.length > 0 ? spec : undefined;
}

export function inRange(spec: RangeSpec, distance: number): boolean {
  return spec.some(([min, max]) => distance >= min && distance <= max);
}

// Дальность активной стойки фишки (для подсветки на поле).
export function tokenRangeSpec(token: TableToken, data: BuilderData): RangeSpec | undefined {
  if (token.build) {
    const stances = token.build.stances;
    if (stances.length === 0) return undefined;
    const active = Math.min(token.activeStance ?? 0, stances.length - 1);
    const style = data.items.find((item) => item.id === stances[active]?.styleId);
    return parseRangeSpec(style?.range);
  }
  if (token.statBlock?.range) return parseRangeSpec(token.statBlock.range);
  // Запасной путь для врагов, импортированных файлом (правила в notes).
  const match = (token.enemy?.notes ?? "").match(/Дальность:\s*([^\n·]+)/);
  return match ? parseRangeSpec(match[1]) : undefined;
}

// Стиль паркура игнорирует стены при подсветке дальности (действия «через препятствия»).
export function tokenIgnoresWalls(token: TableToken, data: BuilderData): boolean {
  const names: string[] = [];
  if (token.build) {
    const stances = token.build.stances;
    const active = Math.min(token.activeStance ?? 0, stances.length - 1);
    const style = data.items.find((item) => item.id === stances[active]?.styleId);
    if (style?.nameRu) names.push(style.nameRu);
  }
  if (token.statBlock?.styleName) names.push(token.statBlock.styleName);
  return names.some((name) => name.toLowerCase().includes("паркур"));
}

// Пересекает ли отрезок между центрами клеток хотя бы одну стену.
// Семплируем точки вдоль отрезка; сами конечные клетки стеной не считаются.
export function crossesWall(
  gridType: GridType,
  gridW: number,
  gridH: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  walls: Set<string>,
): boolean {
  if (walls.size === 0) return false;
  const a = cellCenter(gridType, from.x, from.y);
  const b = cellCenter(gridType, to.x, to.y);
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 4)));
  for (let i = 1; i < steps; i += 1) {
    const point = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
    const cell = pointToCell(gridType, gridW, gridH, point);
    if (!cell) continue;
    if ((cell.x === from.x && cell.y === from.y) || (cell.x === to.x && cell.y === to.y)) continue;
    if (walls.has(`${cell.x}:${cell.y}`)) return true;
  }
  return false;
}

// Клетки поля в пределах дальности от фишки.
export function cellsInRange(
  spec: RangeSpec,
  origin: { x: number; y: number },
  gridType: GridType,
  gridW: number,
  gridH: number,
): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (inRange(spec, cellDistance(gridType, origin, { x, y }))) result.push({ x, y });
    }
  }
  return result;
}

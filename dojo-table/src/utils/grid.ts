import type { GridType } from "../types";

// Геометрия поля: квадратная сетка и гексовая (остроконечные гексы, odd-r смещение —
// нечётные ряды сдвинуты вправо; террейн-токены C0rked как раз остроконечные).

export const CELL = 72; // размер клетки в координатах поля (px viewBox)

export interface Point {
  x: number;
  y: number;
}

const HEX_R = CELL / 2 + 6; // радиус гекса чуть больше полуклетки — фишки те же, поле дышит
const HEX_W = Math.sqrt(3) * HEX_R;
const HEX_STEP_Y = 1.5 * HEX_R;

export function boardSize(gridType: GridType, gridW: number, gridH: number): Point {
  if (gridType === "square") return { x: gridW * CELL, y: gridH * CELL };
  return {
    x: HEX_W * gridW + HEX_W / 2,
    y: HEX_STEP_Y * (gridH - 1) + 2 * HEX_R,
  };
}

export function cellCenter(gridType: GridType, col: number, row: number): Point {
  if (gridType === "square") return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
  return {
    x: HEX_W * col + HEX_W / 2 + (row % 2 ? HEX_W / 2 : 0),
    y: HEX_STEP_Y * row + HEX_R,
  };
}

// Точка (в координатах поля) → клетка. Для гексов честный перебор ближайшего центра:
// на полях до 20×20 это до 400 сравнений — дёшево и без краевых ошибок.
export function pointToCell(gridType: GridType, gridW: number, gridH: number, point: Point): { x: number; y: number } | undefined {
  if (gridType === "square") {
    const x = Math.floor(point.x / CELL);
    const y = Math.floor(point.y / CELL);
    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return undefined;
    return { x, y };
  }
  let best: { x: number; y: number } | undefined;
  let bestDist = Infinity;
  for (let row = 0; row < gridH; row += 1) {
    for (let col = 0; col < gridW; col += 1) {
      const center = cellCenter("hex", col, row);
      const dist = (center.x - point.x) ** 2 + (center.y - point.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: col, y: row };
      }
    }
  }
  if (best && bestDist > HEX_R * HEX_R * 1.7) return undefined; // клик далеко за полем
  return best;
}

export function hexPolygonPoints(center: Point): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30); // остроконечный гекс
    points.push(`${(center.x + HEX_R * Math.cos(angle)).toFixed(1)},${(center.y + HEX_R * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(" ");
}

// Дистанция в клетках: квадраты — по Чебышеву (ход по диагонали = 1, как в PatD),
// гексы — кубовая гексовая дистанция.
export function cellDistance(gridType: GridType, a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (gridType === "square") return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const ac = offsetToCube(a);
  const bc = offsetToCube(b);
  return Math.max(Math.abs(ac.q - bc.q), Math.abs(ac.r - bc.r), Math.abs(ac.s - bc.s));
}

// Стоимость перемещения в жетонах скорости (гл. 2): прямой шаг — 1 жетон,
// диагональный — 2, то есть минимум = dx + dy (манхэттен). На гексах диагоналей
// нет — стоимость равна дистанции. Завалы/ямы линейка не учитывает.
export function speedCost(gridType: GridType, a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (gridType === "square") return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return cellDistance("hex", a, b);
}

function offsetToCube(cell: { x: number; y: number }) {
  const q = cell.x - (cell.y - (cell.y & 1)) / 2;
  const r = cell.y;
  return { q, r, s: -q - r };
}

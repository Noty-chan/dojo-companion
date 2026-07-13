import { describe, expect, it } from "vitest";
import { parseStanceDice, rollStance } from "./dice";
import { inRange, parseRangeSpec } from "./range";
import { cellDistance, speedCost } from "./grid";

describe("parseStanceDice", () => {
  it("обычный пул формы", () => {
    expect(parseStanceDice("к8 · к8 · к6")).toEqual({ roll: [8, 8, 6], fixed: [] });
  });

  it("скобки формы — опциональные добавки, не в пуле", () => {
    expect(parseStanceDice("к10 · к6 · к6 (+ до 3×к6)")).toEqual({ roll: [10, 6, 6], fixed: [] });
  });

  it("фиксированный пул формы", () => {
    expect(parseStanceDice("7 · 5 · 3 · 1 (фикс.)")).toEqual({ roll: [], fixed: [7, 5, 3, 1] });
  });

  it("кости врага в скобках", () => {
    expect(parseStanceDice("4 (к8·к6·к6·к4)")).toEqual({ roll: [8, 6, 6, 4], fixed: [] });
  });

  it("фикс-пул статистов: числа берутся из скобок, а не из «4 действия»", () => {
    expect(parseStanceDice("4 действия (7·5·3·1, без бросков)")).toEqual({ roll: [], fixed: [7, 5, 3, 1] });
  });

  it("пусто и нераспознанное", () => {
    expect(parseStanceDice(undefined)).toEqual({ roll: [], fixed: [] });
    expect(parseStanceDice("по таблице Запретного стиля (две формы)").roll).toEqual([]);
  });

  it("rollStance кладёт фикс-значения без броска", () => {
    const results = rollStance({ roll: [], fixed: [7, 5] });
    expect(results).toEqual([
      { sides: 0, value: 7 },
      { sides: 0, value: 5 },
    ]);
  });
});

describe("parseRangeSpec", () => {
  it("диапазон и роль стиля", () => {
    expect(parseRangeSpec("1-2 · Роль: Защита")).toEqual([[1, 2]]);
  });

  it("одиночное значение", () => {
    expect(parseRangeSpec("1")).toEqual([[1, 1]]);
  });

  it("список диапазонов «0, 2–4»", () => {
    const spec = parseRangeSpec("0, 2–4")!;
    expect(spec).toEqual([[0, 0], [2, 4]]);
    expect(inRange(spec, 1)).toBe(false);
    expect(inRange(spec, 3)).toBe(true);
  });

  it("«нет» и пусто", () => {
    expect(parseRangeSpec("нет")).toBeUndefined();
    expect(parseRangeSpec("")).toBeUndefined();
  });
});

describe("дистанции и стоимость перемещения", () => {
  it("дальность на квадратах — Чебышёв (клетка есть клетка)", () => {
    expect(cellDistance("square", { x: 0, y: 0 }, { x: 3, y: 2 })).toBe(3);
  });

  it("жетоны скорости: диагональ = 2 (манхэттен)", () => {
    expect(speedCost("square", { x: 0, y: 0 }, { x: 3, y: 2 })).toBe(5);
    expect(speedCost("square", { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(2);
  });

  it("гексы: кубовая дистанция odd-r", () => {
    expect(cellDistance("hex", { x: 0, y: 0 }, { x: 0, y: 2 })).toBe(2);
    expect(cellDistance("hex", { x: 2, y: 0 }, { x: 0, y: 1 })).toBe(2);
    expect(speedCost("hex", { x: 0, y: 0 }, { x: 0, y: 2 })).toBe(2);
  });
});

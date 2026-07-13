import { describe, expect, it } from "vitest";
import type { CharacterBuild, EnemyBuild } from "../companionTypes";
import { migrateTableState, type TableState } from "../types";
import { formatRoll, parseDicePool, rollPool } from "./dice";
import { cellCenter, cellDistance, pointToCell } from "./grid";
import { findFreeCell, importCompanionPayload } from "./importers";

function emptyState(): TableState {
  return { schemaVersion: 2, name: "Тест", gridType: "square", gridW: 8, gridH: 6, round: 1, tokens: [], log: [], drawings: [], tray: [] };
}

const build: CharacterBuild = {
  schemaVersion: 2,
  characterName: "Юки",
  playerName: "",
  creationPath: "adept",
  archetypeIds: [],
  skillIds: [],
  customSkill: "",
  stances: [{ id: "stance-1", name: "Первая" }],
  notes: "",
  updatedAt: "",
};

const enemy: EnemyBuild = {
  schemaVersion: 1,
  id: "enemy-1",
  name: "Громила",
  level: 2,
  kind: "warrior",
  count: 3,
  hpMax: 10,
  hpCurrent: 10,
  shield: 0,
  armorSpent: false,
  tokens: { strength: 2 },
  notes: "",
  updatedAt: "",
};

describe("parseDicePool", () => {
  it("читает строки компаньона с к/d/k и разделителями", () => {
    expect(parseDicePool("к8 · к8 · к6")).toEqual([8, 8, 6]);
    expect(parseDicePool("к8 · к6 · к6 · к6")).toEqual([8, 6, 6, 6]);
    expect(parseDicePool("d10, d8")).toEqual([10, 8]);
    expect(parseDicePool("к10 · к6 · к6 (+ до 3×к6)")).toEqual([10, 6, 6]);
    expect(parseDicePool(undefined)).toEqual([]);
    expect(parseDicePool("без костей")).toEqual([]);
  });
});

describe("rollPool", () => {
  it("бросает значения в пределах граней", () => {
    const results = rollPool([8, 6], () => 0.999);
    expect(results).toEqual([
      { sides: 8, value: 8 },
      { sides: 6, value: 6 },
    ]);
    expect(rollPool([4], () => 0)).toEqual([{ sides: 4, value: 1 }]);
    expect(formatRoll(results)).toBe("к8: 8, к6: 6");
  });
});

describe("сетки", () => {
  it("квадраты: дистанция по Чебышеву, точка → клетка", () => {
    expect(cellDistance("square", { x: 0, y: 0 }, { x: 3, y: 2 })).toBe(3);
    expect(cellDistance("square", { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(1);
    expect(pointToCell("square", 9, 7, { x: 100, y: 100 })).toEqual({ x: 1, y: 1 });
    expect(pointToCell("square", 9, 7, { x: -5, y: 10 })).toBeUndefined();
  });

  it("гексы: центр обратен поиску клетки, дистанция кубовая", () => {
    for (const cell of [{ x: 0, y: 0 }, { x: 3, y: 2 }, { x: 5, y: 5 }, { x: 0, y: 4 }]) {
      const center = cellCenter("hex", cell.x, cell.y);
      expect(pointToCell("hex", 8, 8, center)).toEqual(cell);
    }
    // Соседи по гексовой сетке всегда на дистанции 1.
    expect(cellDistance("hex", { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(1);
    expect(cellDistance("hex", { x: 2, y: 2 }, { x: 2, y: 3 })).toBe(1);
    expect(cellDistance("hex", { x: 2, y: 2 }, { x: 1, y: 3 })).toBe(1); // ряд 3 смещён вправо: соседи снизу — колонки 1 и 2
    expect(cellDistance("hex", { x: 2, y: 2 }, { x: 3, y: 3 })).toBe(2);
    expect(cellDistance("hex", { x: 0, y: 0 }, { x: 0, y: 2 })).toBe(2);
    expect(cellDistance("hex", { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(4);
  });
});

describe("importCompanionPayload", () => {
  it("герой становится фишкой слева", () => {
    const { state, message } = importCompanionPayload(emptyState(), {
      type: "panic-at-the-dojo.character-card",
      build,
    });
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0]).toMatchObject({ kind: "hero", name: "Юки", x: 0, hpMax: 6 });
    expect(message).toContain("Юки");
  });

  it("враг с count=3 даёт три фишки справа с жетонами", () => {
    const { state } = importCompanionPayload(emptyState(), { type: "panic-at-the-dojo.enemy-build", build: enemy });
    expect(state.tokens).toHaveLength(3);
    expect(state.tokens.map((token) => token.name)).toEqual(["Громила 1", "Громила 2", "Громила 3"]);
    expect(new Set(state.tokens.map((token) => `${token.x}:${token.y}`)).size).toBe(3);
    expect(state.tokens[0].x).toBe(7);
    expect(state.tokens[0].counters?.strength).toBe(2);
  });

  it("сцена переименовывает стол и высаживает весь состав", () => {
    const { state } = importCompanionPayload(emptyState(), {
      type: "panic-at-the-dojo.encounter",
      scene: { name: "Разрушенный мост" },
      roster: [enemy, { ...enemy, id: "enemy-2", name: "Лучник", count: 1 }],
    });
    expect(state.name).toBe("Разрушенный мост");
    expect(state.tokens).toHaveLength(4);
  });

  it("пачка приводит всех героев", () => {
    const { state } = importCompanionPayload(emptyState(), {
      type: "panic-at-the-dojo.party",
      party: { name: "Смена А" },
      heroes: [
        { id: "h1", name: "Юки", build },
        { id: "h2", name: "Кай", build: { ...build, characterName: "Кай" } },
      ],
    });
    expect(state.tokens.map((token) => token.name)).toEqual(["Юки", "Кай"]);
    expect(state.tokens[0].color).not.toBe(state.tokens[1].color);
  });

  it("незнакомый файл даёт понятную ошибку", () => {
    expect(() => importCompanionPayload(emptyState(), { hello: 1 })).toThrow(/не распознан/);
  });

  it("миграция v1 → v2 дописывает новые поля", () => {
    const migrated = migrateTableState({ schemaVersion: 1, name: "Старая", gridW: 8, gridH: 6, round: 3, tokens: [], log: [] });
    expect(migrated).toMatchObject({ schemaVersion: 2, gridType: "square", drawings: [], tray: [], round: 3 });
    expect(migrateTableState({ hello: 1 })).toBeUndefined();
    expect(migrateTableState({ schemaVersion: 2, gridType: "hex", gridW: 99, tokens: [], log: [] })?.gridW).toBe(20);
  });

  it("findFreeCell не сажает двоих в одну клетку", () => {
    const state = emptyState();
    const first = findFreeCell(state, false);
    state.tokens.push({ id: "a", kind: "hero", name: "А", ...first, color: "#000" });
    const second = findFreeCell(state, false);
    expect(second).not.toEqual(first);
  });
});

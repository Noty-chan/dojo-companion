import { describe, expect, it } from "vitest";
import type { EnemyBuild } from "../types";
import { clampCount, emptyEnemyTokens, normalizeEnemyBuild, scaleById } from "./enemy";

function baseEnemy(patch: Partial<EnemyBuild> = {}): EnemyBuild {
  return {
    schemaVersion: 1,
    id: "enemy-test",
    name: "Тестовый враг",
    level: 1,
    kind: "boss",
    scaleId: "feather",
    count: 1,
    hpMax: 10,
    hpCurrent: 10,
    shield: 0,
    armorSpent: false,
    tokens: { ...emptyEnemyTokens },
    notes: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("normalizeEnemyBuild", () => {
  it("сохраняет 0 HP (регрессия: добитый враг воскресал с полным здоровьем)", () => {
    expect(normalizeEnemyBuild(baseEnemy({ hpCurrent: 0 })).hpCurrent).toBe(0);
  });

  it("не даёт HP уйти в минус", () => {
    expect(normalizeEnemyBuild(baseEnemy({ hpCurrent: -3 })).hpCurrent).toBe(0);
  });

  it("обрезает текущее HP по максимуму", () => {
    expect(normalizeEnemyBuild(baseEnemy({ hpCurrent: 99, hpMax: 10 })).hpCurrent).toBe(10);
  });

  it("восстанавливает HP из масштаба при мусорном hpMax", () => {
    const enemy = normalizeEnemyBuild(baseEnemy({ hpMax: Number.NaN, hpCurrent: Number.NaN }));
    expect(enemy.hpMax).toBe(scaleById("feather").hp);
    expect(enemy.hpCurrent).toBe(enemy.hpMax);
  });

  it("подменяет неизвестный масштаб на минимальный", () => {
    expect(normalizeEnemyBuild(baseEnemy({ scaleId: "giant" as never })).scaleId).toBe("feather");
  });

  it("зажимает уровень в 1..10 и количество от 1", () => {
    expect(normalizeEnemyBuild(baseEnemy({ level: 42 })).level).toBe(10);
    expect(normalizeEnemyBuild(baseEnemy({ level: 0 })).level).toBe(1);
    expect(normalizeEnemyBuild(baseEnemy({ count: -5 })).count).toBe(1);
  });

  it("дополняет жетоны полным набором и не теряет значения", () => {
    const enemy = normalizeEnemyBuild(baseEnemy({ tokens: { burn: 2 } as Record<string, number> }));
    expect(enemy.tokens.burn).toBe(2);
    expect(enemy.tokens.strength).toBe(0);
    expect(Object.keys(enemy.tokens)).toEqual(Object.keys(emptyEnemyTokens));
  });
});

describe("clampCount", () => {
  it("зажимает значения в диапазон", () => {
    expect(clampCount(150)).toBe(99);
    expect(clampCount(-2)).toBe(0);
    expect(clampCount(Number.NaN)).toBe(0);
  });
});

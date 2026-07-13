import { describe, expect, it } from "vitest";
import type { ReferenceSection } from "../types";
import { emptyEnemyTokens } from "./enemy";
import { enemyPlainText, flattenSuperMoves, resolveEnemyBuild } from "./enemyResolve";

const advancement: ReferenceSection = {
  id: "enemy-advancement",
  title: "Рост врагов",
  category: "враги",
  summary: "",
  source: "",
  body: [],
  entries: [],
  table: {
    columns: ["Уровень", "Босс", "Воин", "Преимущество"],
    rows: [
      ["1", "к4", "-", "-"],
      ["2", "к6", "к4", "Второе преимущество"],
      ["5", "к10", "к8", "Пятое преимущество"],
    ],
  },
};

const villains: ReferenceSection = {
  id: "villain-archetypes",
  title: "Архетипы злодеев",
  category: "враги",
  summary: "",
  source: "",
  body: [],
  entries: [
    {
      id: "villain-brute",
      title: "Громила",
      body: ["Бьёт по площади."],
      moves: [{ kind: "Супер", title: "Обвал", effect: "Урон всем рядом." }],
    },
  ],
};

const supers: ReferenceSection = {
  id: "super-moves",
  title: "Супер-приёмы",
  category: "враги",
  summary: "",
  source: "",
  body: [],
  entries: [
    {
      id: "super-storm",
      title: "Буря",
      body: [],
      moves: [
        { kind: "Супер", title: "Молния", effect: "3 урона." },
        { kind: "Супер", title: "Гром", effect: "Оглушение." },
      ],
    },
  ],
};

function enemy(patch: Parameters<typeof resolveEnemyBuild>[0] extends infer T ? Partial<T> : never) {
  return {
    schemaVersion: 1 as const,
    id: "e1",
    name: "Бандит",
    level: 2,
    kind: "boss" as const,
    scaleId: "feather" as const,
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

describe("resolveEnemyBuild", () => {
  it("берёт кость босса из таблицы по уровню", () => {
    const resolved = resolveEnemyBuild(enemy({ level: 2, kind: "boss" }), advancement);
    expect(resolved.dice).toBe("к6");
    expect(resolved.benefit).toBe("Второе преимущество");
  });

  it("берёт кость воина, а статисту не даёт бонусной кости", () => {
    expect(resolveEnemyBuild(enemy({ level: 2, kind: "warrior" }), advancement).dice).toBe("к4");
    expect(resolveEnemyBuild(enemy({ level: 5, kind: "stooge" }), advancement).dice).toBe("-");
  });

  it("подставляет заглушку преимущества для уровня вне таблицы", () => {
    expect(resolveEnemyBuild(enemy({ level: 3 }), advancement).benefit).toContain("Без нового преимущества");
  });

  it("подтягивает архетип злодея и его приём", () => {
    const resolved = resolveEnemyBuild(enemy({ villainId: "villain-brute" }), advancement, villains);
    expect(resolved.villain?.title).toBe("Громила");
    expect(resolved.villainMove?.title).toBe("Обвал");
  });

  it("находит выбранный супер-приём по составному id", () => {
    const resolved = resolveEnemyBuild(enemy({ superMoveId: "super-storm:1" }), advancement, villains, supers);
    expect(resolved.superMove?.title).toBe("Гром");
  });
});

describe("flattenSuperMoves", () => {
  it("разворачивает приёмы всех архетипов с уникальными id", () => {
    const moves = flattenSuperMoves(supers);
    expect(moves.map((m) => m.moveId)).toEqual(["super-storm:0", "super-storm:1"]);
    expect(moves[0].archetype).toBe("Буря");
  });

  it("на пустой секции возвращает пустой список", () => {
    expect(flattenSuperMoves(undefined)).toEqual([]);
  });
});

describe("enemyPlainText", () => {
  it("собирает читаемый блок с ключевыми строками", () => {
    const text = enemyPlainText(resolveEnemyBuild(enemy({ name: "Тень", count: 3, villainId: "villain-brute" }), advancement, villains));
    expect(text).toContain("3 × Тень");
    expect(text).toContain("Босс, уровень 2");
    expect(text).toContain("Архетип злодея: Громила");
  });
});

import { describe, expect, it } from "vitest";
import type { BuilderData, CharacterBuild, LibraryItem } from "../types";
import type { EnemyResolved, Party, SavedHero } from "../appTypes";
import { enemyEmbed, heroEmbed, isValidWebhookUrl, partyEmbed, sceneEmbed } from "./discord";

function item(partial: Partial<LibraryItem> & Pick<LibraryItem, "id" | "kind" | "nameRu">): LibraryItem {
  return {
    color: "#000",
    rules: { summary: "" },
    ...partial,
  };
}

const data: BuilderData = {
  items: [
    item({ id: "arc-a", kind: "archetype", nameRu: "Наставник", abilities: { адепт: "Способность Адепта" } }),
    item({ id: "form-1", kind: "form", nameRu: "Форма Стали", actionDice: "к8 · к6 · к6 · к6" }),
    item({ id: "style-a1", kind: "style", nameRu: "Стиль Пламени", family: "Наставник" }),
    item({ id: "stat-1", kind: "stat", nameRu: "Массивная стать" }),
    item({ id: "skill-1", kind: "skill", nameRu: "Навык Стали", formId: "form-1" }),
  ],
  sourceNotes: [],
};

const build: CharacterBuild = {
  schemaVersion: 2,
  characterName: "Юки",
  playerName: "Наи",
  creationPath: "adept",
  archetypeId: "arc-a",
  archetypeIds: ["arc-a"],
  statId: "stat-1",
  skillIds: ["skill-1"],
  customSkill: "Чуткий слух",
  stances: [
    { id: "stance-1", name: "Первая", formId: "form-1", styleId: "style-a1" },
    { id: "stance-2", name: "Вторая" },
    { id: "stance-3", name: "Третья" },
  ],
  notes: "",
  updatedAt: new Date().toISOString(),
};

describe("isValidWebhookUrl", () => {
  it("принимает настоящие ссылки вебхуков Discord", () => {
    expect(isValidWebhookUrl("https://discord.com/api/webhooks/123456789/aBc-DeF_123")).toBe(true);
    expect(isValidWebhookUrl("https://discordapp.com/api/webhooks/1/t")).toBe(true);
    expect(isValidWebhookUrl("https://ptb.discord.com/api/webhooks/1/t")).toBe(true);
  });

  it("отклоняет чужие и неполные ссылки", () => {
    expect(isValidWebhookUrl("")).toBe(false);
    expect(isValidWebhookUrl("https://example.com/api/webhooks/1/t")).toBe(false);
    expect(isValidWebhookUrl("https://discord.com/api/webhooks/")).toBe(false);
    expect(isValidWebhookUrl("http://discord.com/api/webhooks/1/t")).toBe(false);
  });
});

describe("heroEmbed", () => {
  it("собирает эмбед с архетипом, стойками и навыками", () => {
    const embed = heroEmbed(data, build);
    expect(embed.title).toBe("Юки");
    expect(embed.description).toContain("Массивная стать");
    const names = embed.fields.map((field) => field.name);
    expect(names.some((name) => name.includes("Наставник"))).toBe(true);
    expect(names.some((name) => name.includes("Стойка 1"))).toBe(true);
    const skills = embed.fields.find((field) => field.name === "Навыки");
    expect(skills?.value).toContain("Навык Стали");
    expect(skills?.value).toContain("Чуткий слух");
    expect(embed.footer?.text).toContain("Наи");
  });

  it("не оставляет пустых значений полей (лимит Discord)", () => {
    const embed = heroEmbed(data, { ...build, skillIds: [], customSkill: "" });
    for (const field of embed.fields) {
      expect(field.value.length).toBeGreaterThan(0);
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
  });

  it("обрезает сверхдлинные тексты до лимитов Discord", () => {
    const longData: BuilderData = {
      items: [item({ id: "arc-a", kind: "archetype", nameRu: "Наставник", abilities: { адепт: "х".repeat(3000) } })],
      sourceNotes: [],
    };
    const embed = heroEmbed(longData, build);
    const ability = embed.fields.find((field) => field.name.includes("Наставник"));
    expect(ability?.value.length).toBeLessThanOrEqual(1024);
  });
});

describe("enemyEmbed / sceneEmbed / partyEmbed", () => {
  const resolved: EnemyResolved = {
    build: {
      schemaVersion: 1,
      id: "enemy-1",
      name: "Громила",
      level: 3,
      kind: "boss",
      scaleId: "light",
      count: 2,
      hpMax: 14,
      hpCurrent: 9,
      shield: 2,
      armorSpent: false,
      tokens: {},
      notes: "держит мост",
      updatedAt: new Date().toISOString(),
    },
    kindLabel: "Босс",
    dice: "к8 · к8",
    bossDice: "к8 · к8",
    warriorDie: "к8",
    benefit: "+1 кость",
    hint: "",
  };

  it("enemyEmbed переносит трекер и заметки", () => {
    const embed = enemyEmbed(resolved);
    expect(embed.title).toBe("2 × Громила");
    expect(embed.fields.find((field) => field.name === "HP")?.value).toBe("9/14");
    expect(embed.fields.find((field) => field.name === "Заметки")?.value).toBe("держит мост");
  });

  it("sceneEmbed перечисляет врагов и масштаб", () => {
    const embed = sceneEmbed(
      {
        name: "Мост",
        scaleId: "light",
        arenaParameterIds: [],
        tiltedParameterIds: [],
        victoryParameterId: "",
        objective: "удержать мост",
        location: "старый мост",
        stakes: "",
        reasons: "",
        setupConditions: "",
        notes: "",
        plan: "",
      },
      [resolved],
    );
    expect(embed.fields.find((field) => field.name === "Враги")?.value).toContain("2 × Громила");
    expect(embed.fields.find((field) => field.name === "Цель")?.value).toBe("удержать мост");
  });

  it("partyEmbed показывает участников и переживает удалённых героев", () => {
    const hero: SavedHero = { id: "hero-1", name: "Юки", playerName: "Наи", updatedAt: build.updatedAt, build };
    const party: Party = { id: "party-1", name: "Смена А", notes: "", heroIds: ["hero-1", "hero-missing"], updatedAt: build.updatedAt };
    const embed = partyEmbed(data, party, [hero]);
    expect(embed.title).toContain("Смена А");
    expect(embed.fields).toHaveLength(1);
    expect(embed.fields[0].name).toContain("Юки");
    expect(embed.footer?.text).toContain("1 героев");
  });
});

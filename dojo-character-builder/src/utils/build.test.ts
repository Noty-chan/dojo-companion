import { describe, expect, it } from "vitest";
import type { BuilderData, CharacterBuild, LibraryItem } from "../types";
import { normalizeBuild, safeFileName, validateBuild } from "./build";

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
    item({ id: "arc-b", kind: "archetype", nameRu: "Кавалерист", abilities: { химера: "Способность Химеры" } }),
    item({ id: "form-1", kind: "form", nameRu: "Форма Стали" }),
    item({ id: "form-2", kind: "form", nameRu: "Форма Ветра" }),
    item({ id: "form-3", kind: "form", nameRu: "Форма Реки" }),
    item({ id: "style-a1", kind: "style", nameRu: "Стиль Пламени", family: "Наставник" }),
    item({ id: "style-a2", kind: "style", nameRu: "Стиль Грома", family: "Наставник" }),
    item({ id: "style-a3", kind: "style", nameRu: "Стиль Льда", family: "Наставник" }),
    item({ id: "style-b1", kind: "style", nameRu: "Стиль Копья", family: "Кавалерист" }),
    item({ id: "stat-1", kind: "stat", nameRu: "Массивная стать" }),
    item({ id: "skill-1", kind: "skill", nameRu: "Навык Стали", formId: "form-1" }),
    item({ id: "skill-2", kind: "skill", nameRu: "Навык Ветра", formId: "form-2" }),
    item({ id: "skill-3", kind: "skill", nameRu: "Навык Реки", formId: "form-3" }),
  ],
  sourceNotes: [],
};

function validAdeptBuild(): CharacterBuild {
  return normalizeBuild(data, {
    characterName: "Патти",
    creationPath: "adept",
    archetypeIds: ["arc-a"],
    statId: "stat-1",
    customSkill: "Чудаковатый картёжник",
    stances: [
      { id: "stance-1", name: "Стойка 1", formId: "form-1", styleId: "style-a1" },
      { id: "stance-2", name: "Стойка 2", formId: "form-2", styleId: "style-a2" },
      { id: "stance-3", name: "Стойка 3", formId: "form-3", styleId: "style-a3" },
    ],
  });
}

describe("normalizeBuild", () => {
  it("восстанавливает три стойки и подтягивает навыки форм", () => {
    const build = normalizeBuild(data, { stances: [{ id: "s", name: "Одна", formId: "form-1" }] });
    expect(build.stances).toHaveLength(3);
    expect(build.skillIds).toEqual(["skill-1"]);
  });

  it("обрезает архетипы по лимиту подхода", () => {
    const build = normalizeBuild(data, { creationPath: "adept", archetypeIds: ["arc-a", "arc-b"] });
    expect(build.archetypeIds).toEqual(["arc-a"]);
    expect(build.archetypeId).toBe("arc-a");
  });

  it("не падает на мусорном входе", () => {
    const build = normalizeBuild(data, { archetypeIds: "мусор" as never, skillIds: null as never });
    expect(build.archetypeIds).toEqual([]);
    expect(build.stances).toHaveLength(3);
  });
});

describe("validateBuild", () => {
  it("пропускает корректного Адепта без ошибок", () => {
    const issues = validateBuild(data, validAdeptBuild());
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("ловит стиль не из архетипа Адепта", () => {
    const build = validAdeptBuild();
    build.stances[2].styleId = "style-b1";
    const titles = validateBuild(data, build).map((issue) => issue.title);
    expect(titles).toContain("Стиль не из архетипа");
  });

  it("ловит повтор формы", () => {
    const build = validAdeptBuild();
    build.stances[1].formId = "form-1";
    const titles = validateBuild(data, build).map((issue) => issue.title);
    expect(titles).toContain("Форма повторяется");
  });

  it("требует имя, стать и архетипы", () => {
    const titles = validateBuild(data, normalizeBuild(data, {})).map((issue) => issue.title);
    expect(titles).toContain("Нет имени");
    expect(titles).toContain("Нет стати");
    expect(titles).toContain("Архетипы не по книге");
  });

  it("разрешает заменить только один навык формы", () => {
    const build = validAdeptBuild();
    build.skillIds = ["skill-1", "skill-2", "skill-3"];
    build.stances[1].formId = undefined;
    build.stances[2].formId = undefined;
    const titles = validateBuild(data, build).map((issue) => issue.title);
    expect(titles).toContain("Слишком много замен навыков");
  });
});

describe("safeFileName", () => {
  it("вычищает запрещённые символы и пробелы", () => {
    expect(safeFileName('Гер*ой: "Тест"?')).toBe("Гер-ой-_-Тест-");
    expect(safeFileName("   ")).toBe("dojo-character");
  });
});

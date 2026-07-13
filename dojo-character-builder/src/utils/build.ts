import type { BuilderData, CharacterBuild, CreationPath, LibraryItem, ValidationIssue } from "../types";

export const kindLabels = {
  archetype: "Архетипы",
  form: "Формы",
  style: "Стили",
  stat: "Стати",
  skill: "Навыки",
} as const;

export const kindShortLabels = {
  archetype: "Архетип",
  form: "Форма",
  style: "Стиль",
  stat: "Стать",
  skill: "Навык",
} as const;

export const creationPathLabels: Record<CreationPath, string> = {
  adept: "Адепт",
  chimera: "Химера",
  vortex: "Вихрь",
};

export const creationPathDescriptions: Record<CreationPath, string> = {
  adept: "Один архетип, три стиля из него и сильная способность Адепта.",
  chimera: "Два архетипа, способности Химеры от обоих и стили минимум по одному из каждого.",
  vortex: "Три разных стиля из разных архетипов, три способности Вихря и смена формы/стиля/способности каждый ход.",
};

const pathLimits: Record<CreationPath, number> = {
  adept: 1,
  chimera: 2,
  vortex: 3,
};

export const creationPathRequiredPhrase: Record<CreationPath, string> = {
  adept: "Адепт должен выбрать 1 архетип.",
  chimera: "Химера должна выбрать 2 архетипа.",
  vortex: "Вихрь должен выбрать 3 архетипа.",
};

const abilityKeys: Record<CreationPath, string> = {
  adept: "адепт",
  chimera: "химера",
  vortex: "вихрь",
};

export function itemById(data: BuilderData, id?: string): LibraryItem | undefined {
  if (!id) return undefined;
  return data.items.find((item) => item.id === id);
}

export function itemsByKind(data: BuilderData, kind: LibraryItem["kind"]): LibraryItem[] {
  return data.items.filter((item) => item.kind === kind);
}

export function archetypesForBuild(data: BuilderData, build: CharacterBuild): LibraryItem[] {
  return build.archetypeIds.map((id) => itemById(data, id)).filter(Boolean) as LibraryItem[];
}

export function creationPathLimit(path: CreationPath): number {
  return pathLimits[path];
}

export function archetypeAbility(item: LibraryItem | undefined, path: CreationPath): string {
  if (!item?.abilities) return "";
  return item.abilities[abilityKeys[path]] ?? "";
}

export function formSkillForForm(data: BuilderData, formId?: string): LibraryItem | undefined {
  if (!formId) return undefined;
  return data.items.find((item) => item.kind === "skill" && item.formId === formId);
}

export function derivedSkillIds(data: BuilderData, build: CharacterBuild): string[] {
  const ids = build.stances
    .map((stance) => formSkillForForm(data, stance.formId)?.id)
    .filter(Boolean) as string[];
  return [...new Set(ids)];
}

export function selectedStyleFamilies(data: BuilderData, build: CharacterBuild): string[] {
  return build.stances
    .map((stance) => itemById(data, stance.styleId)?.family)
    .filter(Boolean) as string[];
}

export function normalizeBuild(data: BuilderData, build: Partial<CharacterBuild>): CharacterBuild {
  const fallbackStances = [
    { id: "stance-1", name: "Стойка 1" },
    { id: "stance-2", name: "Стойка 2" },
    { id: "stance-3", name: "Стойка 3" },
  ];
  const creationPath = build.creationPath ?? "adept";
  const limit = pathLimits[creationPath];
  const archetypeIds = [
    ...new Set(
      (Array.isArray(build.archetypeIds)
        ? build.archetypeIds
        : build.archetypeId
          ? [build.archetypeId]
          : []
      ).filter(Boolean) as string[],
    ),
  ].slice(0, limit);
  // Always keep exactly three stances: take the first three valid ones, pad with fallbacks.
  const rawStances = Array.isArray(build.stances) ? build.stances : [];
  const stances = [0, 1, 2].map((i) => rawStances[i] ?? fallbackStances[i]);
  // Skills are the three form skills (one replaceable); never more. Dedupe and cap.
  const skillIds = [...new Set((Array.isArray(build.skillIds) ? build.skillIds : []).filter(Boolean) as string[])].slice(0, 3);
  const normalized: CharacterBuild = {
    schemaVersion: 2,
    characterName: build.characterName ?? "",
    playerName: build.playerName ?? "",
    creationPath,
    archetypeId: archetypeIds[0],
    archetypeIds,
    statId: build.statId,
    skillIds,
    customSkill: build.customSkill ?? "",
    stances,
    notes: build.notes ?? "",
    portrait: typeof build.portrait === "string" && build.portrait.startsWith("data:image/") ? build.portrait : undefined,
    updatedAt: build.updatedAt ?? new Date().toISOString(),
  };

  if (normalized.skillIds.length === 0 && data.items.some((item) => item.kind === "skill")) {
    normalized.skillIds = derivedSkillIds(data, normalized);
  }
  return normalized;
}

export function validateBuild(data: BuilderData, build: CharacterBuild): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = build.creationPath;
  const archetypes = archetypesForBuild(data, build);
  const requiredArchetypes = creationPathLimit(path);

  if (!build.characterName.trim()) {
    issues.push({ level: "error", title: "Нет имени", detail: "Персонажу нужно имя для экспорта." });
  }

  if (archetypes.length !== requiredArchetypes) {
    issues.push({
      level: "error",
      title: "Архетипы не по книге",
      detail: creationPathRequiredPhrase[path],
    });
  }

  const missingAbility = archetypes.filter((item) => !archetypeAbility(item, path));
  if (missingAbility.length > 0) {
    issues.push({
      level: "warning",
      title: "Не найдена способность",
      detail: `Нет текста способности ${creationPathLabels[path]} у: ${missingAbility.map((item) => item.nameRu).join(", ")}.`,
    });
  }

  if (!build.statId) {
    issues.push({ level: "error", title: "Нет стати", detail: "Стать выбирается отдельно и действует весь бой." });
  }

  const usedForms = new Map<string, number>();
  const usedStyles = new Map<string, number>();
  build.stances.forEach((stance, index) => {
    if (!stance.formId || !stance.styleId) {
      issues.push({
        level: "error",
        title: `Стойка ${index + 1} не собрана`,
        detail: path === "vortex" ? "Для Вихря это один из трёх доступных наборов формы и стиля." : "Для каждой стойки нужны форма и стиль.",
      });
    }
    if (stance.formId) usedForms.set(stance.formId, (usedForms.get(stance.formId) ?? 0) + 1);
    if (stance.styleId) usedStyles.set(stance.styleId, (usedStyles.get(stance.styleId) ?? 0) + 1);
  });

  [...usedForms.entries()].forEach(([id, count]) => {
    if (count > 1) {
      const item = itemById(data, id);
      issues.push({ level: "error", title: "Форма повторяется", detail: `${item?.nameRu ?? id} используется несколько раз.` });
    }
  });
  [...usedStyles.entries()].forEach(([id, count]) => {
    if (count > 1) {
      const item = itemById(data, id);
      issues.push({ level: "error", title: "Стиль повторяется", detail: `${item?.nameRu ?? id} используется несколько раз.` });
    }
  });

  const selectedFamilies = selectedStyleFamilies(data, build);
  const selectedArchetypeNames = new Set(archetypes.map((item) => item.nameRu));
  const styleFamilyCounts = selectedFamilies.reduce<Record<string, number>>((acc, family) => {
    acc[family] = (acc[family] ?? 0) + 1;
    return acc;
  }, {});

  if (path === "adept") {
    const offPath = selectedFamilies.filter((family) => !selectedArchetypeNames.has(family));
    if (offPath.length > 0) {
      issues.push({
        level: "error",
        title: "Стиль не из архетипа",
        detail: "Адепт должен взять все три стиля из одного выбранного архетипа.",
      });
    }
  }

  if (path === "chimera") {
    const offPath = selectedFamilies.filter((family) => !selectedArchetypeNames.has(family));
    if (offPath.length > 0) {
      issues.push({
        level: "error",
        title: "Лишний архетип в стиле",
        detail: "Химера берёт стили только из двух выбранных архетипов.",
      });
    }
    const missingStyleFamilies = archetypes.filter((item) => !styleFamilyCounts[item.nameRu]);
    if (missingStyleFamilies.length > 0) {
      issues.push({
        level: "error",
        title: "Не хватает стиля архетипа",
        detail: `Химера обязана взять минимум по одному стилю из каждого архетипа: ${missingStyleFamilies.map((item) => item.nameRu).join(", ")}.`,
      });
    }
  }

  if (path === "vortex") {
    const uniqueFamilies = new Set(selectedFamilies);
    if (uniqueFamilies.size !== selectedFamilies.length) {
      issues.push({
        level: "error",
        title: "Стили Вихря повторяют архетип",
        detail: "У Вихря три выбранных стиля должны быть из разных архетипов.",
      });
    }
    const matchingAbilityFamilies = [...uniqueFamilies].filter((family) => selectedArchetypeNames.has(family));
    if (matchingAbilityFamilies.length < 2) {
      issues.push({
        level: "error",
        title: "Способности Вихря не совпадают",
        detail: "Две способности Вихря должны совпадать с архетипами выбранных стилей; третья может быть любой.",
      });
    }
    issues.push({
      level: "info",
      title: "Памятка Вихря",
      detail: "В бою нельзя использовать ту же форму, стиль или способность Вихря два хода подряд.",
    });
  }

  const selectedSkills = build.skillIds.map((id) => itemById(data, id)).filter(Boolean) as LibraryItem[];
  const derived = new Set(derivedSkillIds(data, build));
  const skillsFromForms = selectedSkills.filter((item) => derived.has(item.id)).length;
  if (selectedSkills.length !== 3) {
    issues.push({
      level: "error",
      title: "Нужно три навыка форм",
      detail: "Герой получает три навыка от форм; один из них можно заменить навыком другой формы.",
    });
  } else if (skillsFromForms < 2) {
    issues.push({
      level: "error",
      title: "Слишком много замен навыков",
      detail: "Можно заменить только один из трёх навыков формы.",
    });
  }

  const customWords = build.customSkill.trim().split(/\s+/).filter(Boolean);
  if (customWords.length === 0) {
    issues.push({
      level: "warning",
      title: "Свой навык не задан",
      detail: "Добавьте четвёртый навык — двусловное описание профессии и характера героя.",
    });
  } else if (customWords.length !== 2) {
    issues.push({
      level: "warning",
      title: "Свой навык должен быть двусловным",
      detail: "По книге четвёртый навык — двусловное описание профессии и характера героя.",
    });
  }

  if (issues.length === 0) {
    issues.push({ level: "info", title: "Сборка выглядит цельной", detail: "Базовые проверки создания героя пройдены." });
  }
  return issues;
}

export function buildTitle(data: BuilderData, build: CharacterBuild): string {
  const archetypes = archetypesForBuild(data, build).map((item) => item.nameRu);
  return [build.characterName || "Без имени", creationPathLabels[build.creationPath], archetypes.join("/")].filter(Boolean).join(" - ");
}

export function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "dojo-character";
}

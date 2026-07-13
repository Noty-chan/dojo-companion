import type { BuilderData, LibraryItem } from "../companionTypes";
import type { TableToken } from "../types";

// Способности, актуальные в ход юнита: способности архетипов (по подходу
// создания) и стата героя. Их показываем в блоке хода, чтобы не бегать в компаньон.
export function turnAbilities(token: TableToken, data: BuilderData): Array<{ title: string; text: string }> {
  const build = token.build;
  if (!build) return [];
  const pathKey = { adept: "адепт", chimera: "химера", vortex: "вихрь" }[build.creationPath] ?? "адепт";
  const byId = (id?: string) => (id ? data.items.find((item) => item.id === id) : undefined);
  const items = [
    ...build.archetypeIds.map(byId),
    byId(build.statId),
  ].filter((item): item is LibraryItem => Boolean(item));
  return items
    .map((item) => ({ title: item.nameRu, text: item.abilities?.[pathKey] ?? item.rules.ability ?? item.rules.summary ?? "" }))
    .filter((entry) => entry.text);
}

// Быстрые кнопки для пула: глобальные бонусы «+N всем» вытаскиваем прямо из текста
// способности (напр. Танцующий в бою: «увеличьте все свои числа на 1»). Точечные
// бонусы («+4 одному», «+2 двум») правятся вручную кнопками ± на костях.
export function archetypeDiceActions(token: TableToken, data: BuilderData): Array<{ label: string; allDelta: number }> {
  const actions: Array<{ label: string; allDelta: number }> = [];
  const seen = new Set<number>();
  for (const ability of turnAbilities(token, data)) {
    const match = ability.text.match(/увеличьте все свои числа на (\d+)/i);
    if (match) {
      const delta = Number(match[1]);
      if (!seen.has(delta)) {
        seen.add(delta);
        actions.push({ label: `+${delta} всем`, allDelta: delta });
      }
    }
  }
  return actions;
}

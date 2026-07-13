import type { ReferenceSection } from "../types";
import type { SceneState } from "../appTypes";

export function referenceEntryTitle(section: ReferenceSection | undefined, id: string) {
  return section?.entries.find((entry) => entry.id === id)?.title;
}

export function referenceEntriesByGroup(section: ReferenceSection | undefined, group: string) {
  return (section?.entries ?? []).filter((entry) => entry.group === group);
}

export function sceneParameterSummary(scene: SceneState, section?: ReferenceSection) {
  const arena = scene.arenaParameterIds.map((id) => referenceEntryTitle(section, id)).filter(Boolean);
  const tilted = scene.tiltedParameterIds.map((id) => referenceEntryTitle(section, id)).filter(Boolean);
  const victory = referenceEntryTitle(section, scene.victoryParameterId) ?? "Последний выживший";
  return [
    arena.length ? `Арена: ${arena.join(", ")}` : "",
    tilted.length ? `Перекос: ${tilted.join(", ")}` : "",
    `Победа: ${victory}`,
  ].filter(Boolean).join(" · ");
}

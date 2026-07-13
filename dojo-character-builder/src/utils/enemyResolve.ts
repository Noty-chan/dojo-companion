import type { EnemyBuild, EnemyKind, ReferenceMove, ReferenceSection } from "../types";
import type { EnemyResolved } from "../appTypes";
import { enemyScales, enemyTokenTypes } from "./enemy";

export const enemyKindLabels: Record<EnemyKind, string> = {
  stooge: "Статисты",
  warrior: "Воин",
  boss: "Босс",
};

export function resolveEnemyBuild(
  build: EnemyBuild,
  advancementSection?: ReferenceSection,
  villainSection?: ReferenceSection,
  superMoveSection?: ReferenceSection,
): EnemyResolved {
  const row = enemyLevelRow(advancementSection, build.level);
  const bossDice = row?.[1] ?? "-";
  const warriorDie = row?.[2] ?? "-";
  const benefit = row?.[3] || "Без нового преимущества на этом уровне.";
  const dice = build.kind === "boss" ? bossDice : build.kind === "warrior" ? warriorDie : "-";
  const villain = (villainSection?.entries ?? []).find((entry) => entry.id === build.villainId);
  const villainMove = villain?.moves?.[0];
  const superMove = flattenSuperMoves(superMoveSection).find((move) => move.moveId === build.superMoveId);
  return {
    build,
    kindLabel: enemyKindLabels[build.kind],
    dice,
    bossDice,
    warriorDie,
    benefit,
    villain,
    villainMove,
    superMove,
    hint: enemyKindHint(build.kind, build.level),
  };
}

export function flattenSuperMoves(section?: ReferenceSection): Array<ReferenceMove & { archetype: string; moveId: string }> {
  return (section?.entries ?? []).flatMap((entry) =>
    (entry.moves ?? []).map((move, index) => ({
      ...move,
      archetype: entry.title,
      moveId: `${entry.id}:${index}`,
    })),
  );
}

function enemyLevelRow(section: ReferenceSection | undefined, level: number): string[] | undefined {
  return section?.table?.rows.find((row) => Number(row[0]) === level);
}

function enemyKindHint(kind: EnemyKind, level: number) {
  if (kind === "stooge") {
    return level >= 6 ? "На 6-м уровне статисты наконец получают способность Химеры или архетипа злодея." : "Статисты почти не растут до 6-го уровня и полагаются на численность.";
  }
  if (kind === "warrior") {
    return level >= 2 ? "С 2-го уровня воин получает Супер-приём и использует бонусную кость по таблице." : "На 1-м уровне воин ещё без бонусной кости и без Супер-приёма.";
  }
  return level >= 5 ? "Босс уже может получать дополнительные стойки и Супер-приёмы по таблице роста." : "Босс начинает с к4 и Супер-приёмом уже на 1-м уровне.";
}

export function enemyPlainText(resolved: EnemyResolved) {
  const tokenText = enemyTokenSummary(resolved.build);
  const scale = enemyScales.find((item) => item.id === resolved.build.scaleId) ?? enemyScales[0];
  const lines = [
    `${resolved.build.count} × ${resolved.build.name}`,
    `${resolved.kindLabel}, уровень ${resolved.build.level}`,
    `Бонусная кость: ${resolved.dice === "-" ? "нет" : resolved.dice}`,
    `HP: ${resolved.build.hpCurrent}/${resolved.build.hpMax}`,
    `Масштаб: ${scale.label}, лечение ${scale.heal}, лимит щита ${scale.shieldCap}`,
    `Щит: ${resolved.build.shield}`,
    `Броня: ${armorLabel(resolved.build.armorState)}`,
    `Преимущество уровня: ${resolved.benefit}`,
  ];
  if (tokenText) lines.push(`Жетоны: ${tokenText}`);
  if (resolved.villain) {
    lines.push("", `Архетип злодея: ${resolved.villain.title}`);
    if (resolved.villain.body[0]) lines.push(resolved.villain.body[0]);
  }
  if (resolved.villainMove) {
    lines.push("", `${resolved.villainMove.kind}: ${resolved.villainMove.title}`, resolved.villainMove.effect);
  }
  if (resolved.superMove) {
    lines.push("", `Доп. Супер-приём (${resolved.superMove.archetype}, ${resolved.superMove.kind}): ${resolved.superMove.title}`, resolved.superMove.effect);
  }
  if (resolved.build.notes.trim()) {
    lines.push("", `Заметки: ${resolved.build.notes.trim()}`);
  }
  return lines.join("\n");
}

export function armorLabel(state?: EnemyBuild["armorState"]): string {
  if (state === "none") return "нет";
  if (state === "spent") return "потрачена";
  return "готова";
}

function enemyTokenSummary(enemy: EnemyBuild) {
  return enemyTokenTypes
    .map((token) => ({ label: token.label, value: enemy.tokens?.[token.id] ?? 0 }))
    .filter((token) => token.value > 0)
    .map((token) => `${token.label} ${token.value}`)
    .join(", ");
}

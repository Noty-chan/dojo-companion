import type { EnemyBuild, EnemyScaleId } from "../types";

export interface EnemyScale {
  id: EnemyScaleId;
  label: string;
  hp: number;
  heal: number;
  shieldCap: number;
  note: string;
}

export const enemyScales: EnemyScale[] = [
  { id: "feather", label: "Минимальный", hp: 10, heal: 1, shieldCap: 6, note: "Супер-приёмы нельзя использовать." },
  { id: "light", label: "Лёгкий", hp: 14, heal: 2, shieldCap: 9, note: "Один Супер-приём на сторону за раунд." },
  { id: "medium", label: "Средний", hp: 18, heal: 2, shieldCap: 12, note: "Стандартный масштаб; один Супер-приём на сторону за раунд." },
  { id: "heavy", label: "Тяжёлый", hp: 22, heal: 3, shieldCap: 15, note: "Долгий бой с высокой живучестью." },
  { id: "world", label: "Мировой", hp: 26, heal: 4, shieldCap: 18, note: "Два Супер-приёма на сторону за раунд." },
];

export const enemyTokenTypes = [
  { id: "strength", label: "Сила" },
  { id: "iron", label: "Железо" },
  { id: "speed", label: "Скорость" },
  { id: "burn", label: "Горение" },
  { id: "fatigue", label: "Усталость" },
  { id: "weakness", label: "Слабость" },
  { id: "control", label: "Контроль" },
  { id: "chaos", label: "Хаос" },
] as const;

export const emptyEnemyTokens: Record<string, number> = Object.fromEntries(
  enemyTokenTypes.map((token) => [token.id, 0]),
);

export function scaleById(scaleId?: EnemyScaleId): EnemyScale {
  return enemyScales.find((scale) => scale.id === scaleId) ?? enemyScales[0];
}

export function clampCount(value: number, min = 0, max = 99) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeEnemyBuild(enemy: EnemyBuild): EnemyBuild {
  const scaleId = enemyScales.some((scale) => scale.id === enemy.scaleId) ? enemy.scaleId : "feather";
  const scale = scaleById(scaleId);
  const hpMax = Math.max(1, Number(enemy.hpMax) || scale.hp);
  // 0 HP — валидное состояние: нельзя использовать `|| hpMax`, иначе добитый враг воскресает с полным здоровьем.
  const hpCurrentRaw = Number(enemy.hpCurrent);
  const hpCurrent = Math.min(hpMax, Math.max(0, Number.isFinite(hpCurrentRaw) ? hpCurrentRaw : hpMax));
  // Миграция брони: старое armorSpent → armorState. Раньше броня всегда «была»,
  // теперь у врага по умолчанию её нет (none), а старым записям сохраняем поведение.
  const armorState = enemy.armorState ?? (enemy.armorSpent ? "spent" : "ready");
  return {
    ...enemy,
    schemaVersion: 1,
    level: Math.min(10, Math.max(1, Number(enemy.level) || 1)),
    count: Math.max(1, Number(enemy.count) || 1),
    scaleId,
    hpMax,
    hpCurrent,
    shield: Math.max(0, Number(enemy.shield) || 0),
    armorState,
    armorSpent: armorState === "spent",
    tokens: { ...emptyEnemyTokens, ...(enemy.tokens ?? {}) },
    updatedAt: enemy.updatedAt || new Date().toISOString(),
  };
}

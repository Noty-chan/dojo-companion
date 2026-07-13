import type { CharacterBuild, EnemyBuild, EnemyRosterEntry } from "../companionTypes";

// Библиотека статблоков стола.
//
// 1. Готовые враги книги приезжают вместе с builder-data.json (enemyRoster) —
//    rosterToEnemyBuild превращает запись в EnemyBuild для фишек.
// 2. Мост к компаньону: на Pages оба приложения живут на одном origin
//    (/dojo-companion/ и /dojo-companion/table/), поэтому картотека компаньона
//    (сохранённые герои, пачки, сцена) читается прямо из localStorage — без
//    экспорта файлов. В dev-режиме порты разные, мост честно пустой.

export interface CompanionHero {
  id: string;
  name: string;
  playerName?: string;
  updatedAt?: string;
  build: CharacterBuild;
}

export interface CompanionParty {
  id: string;
  name: string;
  heroIds: string[];
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function companionHeroes(): CompanionHero[] {
  const list = readJson<CompanionHero[]>("panic-dojo.saved-heroes.v1");
  return Array.isArray(list) ? list.filter((hero) => hero && typeof hero.name === "string" && hero.build) : [];
}

export function companionParties(): CompanionParty[] {
  const list = readJson<CompanionParty[]>("panic-dojo.parties.v1");
  return Array.isArray(list) ? list.filter((party) => party && Array.isArray(party.heroIds)) : [];
}

// Сцена компаньона: список врагов, собранных в Мастерской.
export function companionSceneRoster(): EnemyBuild[] {
  const list = readJson<EnemyBuild[]>("panic-dojo.enemy-roster.v1");
  return Array.isArray(list) ? list.filter((enemy) => enemy && typeof enemy.name === "string") : [];
}

// Готовый враг книги → EnemyBuild (аналог loadRosterEnemy в компаньоне).
// Правила блока НЕ схлопываем в notes — структурный статблок едет отдельным
// полем токена (statBlock) и рисуется опрятно; notes остаются под заметку ГМа.
export function rosterToEnemyBuild(entry: EnemyRosterEntry, hp = 10): EnemyBuild {
  return {
    schemaVersion: 1,
    id: entry.id,
    name: entry.name,
    level: 1,
    kind: entry.kind,
    count: Math.max(1, Number(entry.count) || 1),
    hpMax: hp,
    hpCurrent: hp,
    shield: 0,
    armorSpent: false,
    tokens: {},
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

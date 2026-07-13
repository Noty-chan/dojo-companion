import type { CharacterBuild, EnemyBuild, EnemyScaleId, ReferenceEntry, ReferenceMove } from "./types";

// Режимы верхнего уровня (хаб-модель) и вкладки внутри разделов.
export type AppMode = "home" | "heroes" | "reference" | "workshop" | "io";
export type HeroSection = "builder" | "saved" | "sheet";
export type WorkshopSection = "enemy" | "scene" | "heroes" | "notes" | "presets";

export interface SavedHero {
  id: string;
  name: string;
  playerName: string;
  updatedAt: string;
  build: CharacterBuild;
}

export interface HeroRuntime {
  hpMax: number;
  hpCurrent: number;
  shield: number;
  armorSpent: boolean;
  tokens: Record<string, number>;
  notes: string;
}

export interface SceneState {
  name: string;
  scaleId: EnemyScaleId;
  arenaParameterIds: string[];
  tiltedParameterIds: string[];
  victoryParameterId: string;
  objective: string;
  location: string;
  stakes: string;
  reasons: string;
  setupConditions: string;
  notes: string;
  plan: string;
}

// Пачка игроков: список сохранённых героев, которые играют вместе.
// Храним ссылки на id из картотеки, а не копии билдов — правка героя сразу видна в пачке.
export interface Party {
  id: string;
  name: string;
  notes: string;
  heroIds: string[];
  updatedAt: string;
}

export interface EncounterPreset {
  id: string;
  name: string;
  updatedAt: string;
  scene: SceneState;
  roster: EnemyBuild[];
}

export interface EnemyResolved {
  build: EnemyBuild;
  kindLabel: string;
  dice: string;
  bossDice: string;
  warriorDie: string;
  benefit: string;
  villain?: ReferenceEntry;
  villainMove?: ReferenceMove;
  superMove?: ReferenceMove & { archetype: string; moveId: string };
  hint: string;
}

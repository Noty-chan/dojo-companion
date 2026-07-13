import type { CharacterBuild, EnemyBuild, EnemyRosterEntry, EnemyScaleId } from "./companionTypes";

// Типы самого стола. Всё состояние одной партии — один документ TableState:
// он целиком живёт в localStorage, а в будущем той же формой поедет в
// Supabase Realtime-комнату (см. docs/vtt-план.md в компаньоне).

export type TokenKind = "hero" | "enemy" | "terrain" | "prop";

export type GridType = "square" | "hex";

// Фон арены: картинка из Supabase Storage (или dataURL в офлайне), подгоняется
// масштабом и сдвигом; обрезка происходит краями поля.
export interface BackgroundState {
  url: string;
  natW: number;
  natH: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

// Временный рисунок: свободная линия в координатах поля (плоский массив x,y).
// glow — режим указки: линия ярче светится и сама исчезает (expiresAt).
export interface Drawing {
  id: string;
  color: string;
  points: number[];
  glow?: boolean;
  expiresAt?: string;
}

// Кость пула действий: sides=0 — фиксированное значение (не бросалось);
// value можно править (бонусы вроде Танцующего в бою), spent — потрачена на действие.
export interface PoolDie {
  sides: number;
  value: number;
  spent: boolean;
}

// Активный пул действий: результат броска стойки/кубиков, который тратят по PatD.
export interface DicePool {
  label: string;
  dice: PoolDie[];
}

export interface SharedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  addedAt: string;
}

// Устаревший дайс-трей (до v0.7): держим тип для миграции старых сохранений.
export interface TrayDie {
  sides: number;
  value: number;
  spent: boolean;
}

export interface TrayRoll {
  id: string;
  label: string;
  at: string;
  dice: TrayDie[];
}

// Террейн с картинкой (токены C0rked) и отдельно — метки-глифы для разметки карты.
export type PngTerrainType = "wall" | "halfwall" | "rubble" | "hazard" | "trap" | "fog" | "hurdle" | "portal";
export type MarkerType = "mark_a" | "mark_b" | "mark_c" | "star" | "flag";
export type TerrainType = PngTerrainType | MarkerType;

export const pngTerrainTypes: PngTerrainType[] = ["wall", "halfwall", "rubble", "hazard", "trap", "fog", "hurdle", "portal"];

export const terrainLabels: Record<TerrainType, string> = {
  wall: "Стена",
  halfwall: "Полустена",
  rubble: "Завал",
  hazard: "Опасность",
  trap: "Ловушка",
  fog: "Туман",
  hurdle: "Барьер",
  portal: "Портал",
  mark_a: "Метка A",
  mark_b: "Метка B",
  mark_c: "Метка C",
  star: "Звезда",
  flag: "Флажок",
};

// Метки для клонов/целей/зон: рисуются глифом (буква/символ), а не картинкой.
export const markerMeta: Record<MarkerType, { glyph: string; color: string }> = {
  mark_a: { glyph: "A", color: "#3fb6c9" },
  mark_b: { glyph: "B", color: "#c06ce8" },
  mark_c: { glyph: "C", color: "#e0b13e" },
  star: { glyph: "★", color: "#f2c14e" },
  flag: { glyph: "⚑", color: "#e8654f" },
};

export const markerTypes = Object.keys(markerMeta) as MarkerType[];

export function isMarkerType(type: TerrainType): type is MarkerType {
  return type in markerMeta;
}

export interface TableToken {
  id: string;
  kind: TokenKind;
  name: string;
  x: number;
  y: number;
  color: string;
  terrainType?: TerrainType;
  // Особая метка террейна: лёгкое свечение — «эта стена/ловушка не как все» (магия и т.п.).
  variant?: boolean;
  hpMax?: number;
  hpCurrent?: number;
  shield?: number;
  armorSpent?: boolean;
  counters?: Record<string, number>;
  activeStance?: number;
  note?: string;
  // Активный пул действий этой фишки: бросок стойки/кубиков, который тратят по PatD.
  // Привязан к токену — очистка пула у одной фишки не трогает пулы других игроков.
  pool?: DicePool;
  // Кости хода для фишек без листа (кастомные враги): строка вида «к8·к6·к6» или «7·5·3·1».
  customDice?: string;
  // Своя картинка фишки: маленький dataURL (ужимается при загрузке), едет в комнату вместе с состоянием.
  image?: string;
  // Скрытая фишка: игроки её не видят, Ведущий видит полупрозрачной.
  hidden?: boolean;
  // Шкалы здоровья = число ходов за раунд (босс с 4 шкалами делает 4 хода).
  bars?: number;
  // Группа статистов: вся пачка — один юнит (общие HP/жетоны/пул, один ход за раунд).
  groupId?: string;
  // Полный билд зашит в фишку: стол не зависит от картотеки компаньона.
  build?: CharacterBuild;
  enemy?: EnemyBuild;
  // Структурный статблок готового врага книги — рендерится опрятно (стойка,
  // способности, ходы, флейвор), в отличие от свободных заметок notes.
  statBlock?: EnemyRosterEntry;
  // Небольшие листы/заметки, прикреплённые к фишке. Data URL едет вместе с комнатой.
  attachments?: SharedFile[];
}

export interface LogEntry {
  id: string;
  at: string;
  text: string;
}

// Ячейка шкалы инициативы: сторона фиксирована при сборке раунда,
// конкретный юнит проставляется, когда до ячейки доходит ход.
export interface InitiativeSlot {
  side: "hero" | "enemy";
  tokenId?: string;
}

export interface InitiativeState {
  active: boolean;
  round: number;
  slot: number;
  phase: number;
  slots: InitiativeSlot[];
  // Снимок состояния перед последним «Следующий ход» — для отката (цепочка до 10 шагов).
  prev?: InitiativeState;
}

// Масштаб боя (гл. 2, патч 2024+): HP на каждую шкалу здоровья у всех участников,
// значение лечения и лимит щита. Цифры совпадают с enemyScales компаньона.
export interface BattleScale {
  id: EnemyScaleId;
  label: string;
  hp: number;
  heal: number;
  shieldCap: number;
}

export const battleScales: BattleScale[] = [
  { id: "feather", label: "Минимальный", hp: 10, heal: 1, shieldCap: 6 },
  { id: "light", label: "Лёгкий", hp: 14, heal: 2, shieldCap: 9 },
  { id: "medium", label: "Средний", hp: 18, heal: 2, shieldCap: 12 },
  { id: "heavy", label: "Тяжёлый", hp: 22, heal: 3, shieldCap: 15 },
  { id: "world", label: "Мировой", hp: 26, heal: 4, shieldCap: 18 },
];

export function battleScaleById(id?: EnemyScaleId): BattleScale {
  return battleScales.find((scale) => scale.id === id) ?? battleScales[0];
}

export interface TableState {
  schemaVersion: 2;
  name: string;
  gridType: GridType;
  gridW: number;
  gridH: number;
  round: number;
  scaleId?: EnemyScaleId;
  // Шкал здоровья по умолчанию у сторон: применяются кнопкой ко всем фишкам стороны.
  heroBars?: number;
  enemyBars?: number;
  tokens: TableToken[];
  log: LogEntry[];
  drawings: Drawing[];
  // tray оставлен только для миграции старых сохранений; активный пул теперь на токене.
  tray: TrayRoll[];
  background?: BackgroundState;
  initiative?: InitiativeState;
}

export const maxGrid = 20;
export const minGrid = 3;

// Миграция старых сохранений и состояний из комнат.
export function migrateTableState(raw: unknown): TableState | undefined {
  const record = raw as Omit<Partial<TableState>, "schemaVersion"> & { schemaVersion?: number };
  if (!record || !Array.isArray(record.tokens)) return undefined;
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) return undefined;
  return {
    schemaVersion: 2,
    name: typeof record.name === "string" ? record.name : "Арена",
    gridType: record.gridType === "hex" ? "hex" : "square",
    gridW: Math.min(maxGrid, Math.max(minGrid, Number(record.gridW) || 9)),
    gridH: Math.min(maxGrid, Math.max(minGrid, Number(record.gridH) || 7)),
    round: Math.max(1, Number(record.round) || 1),
    scaleId: battleScales.some((scale) => scale.id === record.scaleId) ? record.scaleId : "feather",
    heroBars: Math.min(9, Math.max(1, Number(record.heroBars) || 1)),
    enemyBars: Math.min(9, Math.max(1, Number(record.enemyBars) || 1)),
    tokens: record.tokens,
    log: Array.isArray(record.log) ? record.log : [],
    drawings: Array.isArray(record.drawings) ? record.drawings : [],
    tray: [],
    background: record.background && typeof record.background.url === "string" ? record.background : undefined,
    initiative: record.initiative && Array.isArray(record.initiative.slots) ? record.initiative : undefined,
  };
}

// Жетоны PatD на фишках. Идентификаторы совпадают с enemyTokenTypes компаньона,
// чтобы жетоны переезжали при импорте врагов без пересчёта.
// Цвет и короткая метка используются в упрощённом представлении на самих фишках.
export const counterTypes = [
  { id: "strength", label: "Сила", short: "Сл", color: "#e0603e" },
  { id: "iron", label: "Железо", short: "Ж", color: "#8d9aa8" },
  { id: "speed", label: "Скорость", short: "Ск", color: "#3fb6c9" },
  { id: "burn", label: "Горение", short: "Г", color: "#e08b2d" },
  { id: "fatigue", label: "Усталость", short: "У", color: "#7d6f9e" },
  { id: "weakness", label: "Слабость", short: "Сб", color: "#a8783c" },
  { id: "control", label: "Контроль", short: "К", color: "#3f6fc9" },
  { id: "chaos", label: "Хаос", short: "Х", color: "#c94fb0" },
] as const;

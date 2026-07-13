export type LibraryKind = "archetype" | "form" | "style" | "stat" | "skill";

export type ExportKind = "character-json" | "sheet-png" | "print-html" | "tts-object";

export type CreationPath = "adept" | "chimera" | "vortex";

export type EnemyKind = "stooge" | "warrior" | "boss";

export type EnemyScaleId = "feather" | "light" | "medium" | "heavy" | "world";

export interface RulesText {
  summary: string;
  ability?: string;
  actions?: ActionRule[];
  notes?: string[];
  tags?: string[];
}

export interface ActionRule {
  cost: string;
  name: string;
  effect: string;
}

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  nameRu: string;
  nameEn?: string;
  family?: string;
  formId?: string;
  aliases?: string[];
  roles?: string[];
  color: string;
  range?: string;
  complexity?: string;
  actionDice?: string;
  purpleDice?: string;
  abilities?: Record<string, string>;
  skill?: {
    name: string;
    summary: string;
  };
  rules: RulesText;
  source?: {
    file?: string;
    line?: number;
  };
  tts?: {
    sourceSave?: string;
    guid?: string;
    cardId?: number;
    deckId?: number;
    faceUrl?: string;
    backUrl?: string;
    numWidth?: number;
    numHeight?: number;
  };
}

export interface ReferenceMove {
  kind: string;
  title: string;
  effect: string;
  notes?: string[];
}

export interface ReferenceEntry {
  id: string;
  title: string;
  group?: string;
  term?: string;
  body: string[];
  moves?: ReferenceMove[];
}

export interface ReferenceTable {
  columns: string[];
  rows: string[][];
}

export interface ReferenceSection {
  id: string;
  title: string;
  category: string;
  summary: string;
  source: string;
  body: string[];
  entries: ReferenceEntry[];
  table?: ReferenceTable;
  layout?: "glossary";
}

export interface StanceBuild {
  id: string;
  name: string;
  formId?: string;
  styleId?: string;
}

export interface CharacterBuild {
  schemaVersion: 2;
  characterName: string;
  playerName: string;
  creationPath: CreationPath;
  archetypeId?: string;
  archetypeIds: string[];
  statId?: string;
  skillIds: string[];
  customSkill: string;
  stances: StanceBuild[];
  notes: string;
  // Портрет героя: маленький dataURL; едет в JSON-экспорт и становится картинкой фишки на столе.
  portrait?: string;
  updatedAt: string;
}

// Броня врага: у большинства врагов брони нет вовсе; у бронированных она либо готова,
// либо потрачена в этот ход. Старое поле armorSpent мигрируется в armorState.
export type ArmorState = "none" | "ready" | "spent";

export interface EnemyBuild {
  schemaVersion: 1;
  id: string;
  name: string;
  level: number;
  kind: EnemyKind;
  scaleId?: EnemyScaleId;
  villainId?: string;
  superMoveId?: string;
  rosterId?: string;
  formId?: string;
  styleId?: string;
  count: number;
  hpMax: number;
  hpCurrent: number;
  shield: number;
  armorSpent: boolean;
  armorState?: ArmorState;
  tokens: Record<string, number>;
  notes: string;
  updatedAt: string;
}

export interface EnemyRosterEntry {
  id: string;
  name: string;
  kind: EnemyKind;
  count: number;
  group: string;
  stanceName: string;
  styleName: string;
  formName: string;
  range: string;
  dice: string;
  body: string[];
  flavor: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  addedAt: string;
}

export interface BuilderData {
  schemaVersion?: number;
  generatedAt?: string;
  sourceHash?: string;
  items: LibraryItem[];
  referenceSections?: ReferenceSection[];
  enemyRoster?: EnemyRosterEntry[];
  sourceNotes: string[];
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
}

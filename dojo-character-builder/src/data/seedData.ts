import type { BuilderData, CharacterBuild, LibraryItem } from "../types";

export const seedItems: LibraryItem[] = [
  {
    id: "archetype-teacher",
    kind: "archetype",
    nameRu: "Наставник",
    nameEn: "Teacher",
    color: "#7b42b6",
    rules: {
      summary: "Поддерживающий архетип, который помогает союзникам делать основную работу.",
      ability: "Выбранная способность архетипа действует независимо от текущей стойки.",
      tags: ["поддержка", "контроль", "команда"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "b5fdfa", cardId: 30900 },
  },
  {
    id: "archetype-cavalry",
    kind: "archetype",
    nameRu: "Кавалерист",
    nameEn: "Cavalry",
    color: "#7b42b6",
    rules: {
      summary: "Мобильная поддержка, которая держится рядом с командой и раздаёт щиты.",
      tags: ["мобильность", "защита", "позиционирование"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "e996c6", cardId: 0 },
  },
  {
    id: "archetype-winterblossom",
    kind: "archetype",
    nameRu: "Цветок зимы",
    nameEn: "Winterblossom",
    color: "#7b42b6",
    rules: {
      summary: "Контролирующий бастион, играющий через стены, копии и жетоны слабости.",
      tags: ["контроль", "оборона", "препятствия"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "016150", cardId: 0 },
  },
  {
    id: "form-iron",
    kind: "form",
    nameRu: "Форма Стали",
    nameEn: "Iron Form",
    color: "#4169b2",
    complexity: "2",
    rules: {
      summary: "Защитная форма для стойких персонажей, которым нужно выдерживать давление.",
      tags: ["защита", "стойкость"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "2bd890", cardId: 0 },
  },
  {
    id: "form-control",
    kind: "form",
    nameRu: "Форма Контроля",
    nameEn: "Control Form",
    color: "#4169b2",
    complexity: "2",
    rules: {
      summary: "Форма для перемещения, подавления и контроля пространства.",
      actions: [
        {
          cost: "3+ или 6+",
          name: "Подавление",
          effect: "Получите жетон контроля и можете переместиться на одну клетку. Усиленные варианты дают больше контроля и перемещения.",
        },
      ],
      tags: ["контроль", "позиционирование"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "1ac9fa", cardId: 0 },
  },
  {
    id: "form-blaster",
    kind: "form",
    nameRu: "Форма Шквала",
    nameEn: "Blaster Form",
    color: "#4169b2",
    complexity: "2",
    rules: {
      summary: "Форма дальних атак, которая расширяет область действия и усиливает ударные волны.",
      actions: [
        {
          cost: "3+",
          name: "Усиление",
          effect: "Следующее действие получает бонус к дальности и может затронуть дополнительные цели.",
        },
      ],
      tags: ["дальность", "урон", "массовые цели"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "16dc58", cardId: 0 },
  },
  {
    id: "form-power",
    kind: "form",
    nameRu: "Форма Мощи",
    nameEn: "Power Form",
    color: "#4169b2",
    complexity: "2",
    rules: {
      summary: "Форма прямого давления и большого урона.",
      tags: ["урон", "давление"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "c55899", cardId: 0 },
  },
  {
    id: "style-training",
    kind: "style",
    nameRu: "Тренировочный стиль",
    nameEn: "Training Style",
    family: "Наставник",
    color: "#c53d2f",
    range: "1",
    rules: {
      summary: "В конце вашего хода вы даёте союзнику один тренировочный жетон.",
      actions: [
        {
          cost: "3+",
          name: "Присмотреть",
          effect: "Вы получаете тренировочный жетон. Если потратите его до конца хода, передайте тренировочный жетон союзнику.",
        },
      ],
      tags: ["поддержка", "жетоны", "союзники"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "bba857", cardId: 24700 },
  },
  {
    id: "style-mastermind",
    kind: "style",
    nameRu: "Стиль стратега",
    nameEn: "Mastermind Style",
    family: "Наставник",
    color: "#c53d2f",
    range: "нет",
    rules: {
      summary: "Вы можете использовать действия союзников на своих кубах; после действия союзник может переместиться.",
      tags: ["комбо", "команда", "гибкость"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "681944", cardId: 24400 },
  },
  {
    id: "style-elder",
    kind: "style",
    nameRu: "Стиль старого мастера",
    nameEn: "Elder Style",
    family: "Наставник",
    color: "#c53d2f",
    range: "1",
    rules: {
      summary: "Стиль для сильного точечного воздействия, когда нужно ударить по-настоящему больно.",
      tags: ["урон", "мастерство"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "eb1c24", cardId: 24200 },
  },
  {
    id: "style-crystal",
    kind: "style",
    nameRu: "Хрустальный стиль",
    nameEn: "Crystal Style",
    family: "Цветок зимы",
    color: "#c53d2f",
    range: "1-2",
    rules: {
      summary: "Когда вы размещаете копию, нанесите 1 урон врагу в пределах дальности этой копии.",
      actions: [
        {
          cost: "3+ / 6+",
          name: "Осколки",
          effect: "Поместите копию в пределах дальности и нанесите 1 урон соседним врагам. На 6+ поместите ещё одну копию.",
        },
        {
          cost: "Бесплатно",
          name: "Разбить",
          effect: "Уничтожьте одну из своих копий. Дайте 1 жетон слабости врагу в пределах дальности этой копии.",
        },
      ],
      tags: ["копии", "слабость", "урон"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "6ed190", cardId: 0 },
  },
  {
    id: "style-mirror",
    kind: "style",
    nameRu: "Зеркальный стиль",
    nameEn: "Mirror Style",
    family: "Цветок зимы",
    color: "#c53d2f",
    range: "2-3",
    rules: {
      summary: "В начале хода вы можете поставить до трёх стен. Вы можете видеть врагов и выбирать их целью сквозь стены.",
      actions: [
        { cost: "3+", name: "Запереть", effect: "Поместите 3 стены в пустые клетки в пределах дальности 1-3." },
        { cost: "3+", name: "Ледяной обвал", effect: "Нанесите 1 урон каждому врагу, соседнему с любой стеной." },
      ],
      tags: ["стены", "контроль", "дальность"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "e82c0d", cardId: 0 },
  },
  {
    id: "stat-overpowering",
    kind: "stat",
    nameRu: "Подавляющая стать",
    nameEn: "Overpowering Build",
    color: "#d68b12",
    rules: {
      summary: "Стать для героя, который решает проблемы напором и силой.",
      tags: ["урон", "давление"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "1d141c", cardId: 0 },
  },
  {
    id: "stat-agile",
    kind: "stat",
    nameRu: "Грациозная стать",
    nameEn: "Agile Build",
    color: "#d68b12",
    rules: {
      summary: "Стать для мобильного героя, которому важно быстро менять позицию.",
      tags: ["скорость", "мобильность"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "bf10c1", cardId: 0 },
  },
  {
    id: "skill-custom",
    kind: "skill",
    nameRu: "Пользовательский навык",
    nameEn: "Custom Skill",
    color: "#c55a11",
    rules: {
      summary: "Свободный навык для описания опыта, профессии или кинематографичной детали персонажа.",
      tags: ["навык", "описание"],
    },
    tts: { sourceSave: "TS_AutoSave_3.json", guid: "38e9f3", cardId: 0 },
  },
];

export const seedData: BuilderData = {
  items: seedItems,
  sourceNotes: [
    "Seed data combines the Russian translation draft with local TTS Dojo Builder metadata.",
    "The schema is intentionally export-first: every build can become JSON, PNG, TTS scripted object, or TTS card pack.",
  ],
};

export const emptyBuild = (): CharacterBuild => ({
  schemaVersion: 2,
  characterName: "Патти",
  playerName: "",
  creationPath: "adept",
  archetypeId: "archetype-teacher",
  archetypeIds: ["archetype-teacher"],
  statId: "stat-agile",
  skillIds: ["skill-несдвигаемый", "skill-профессионал", "skill-неудержимый"],
  customSkill: "Чудаковатый картёжник",
  stances: [
    { id: "stance-1", name: "Тренировочная Гора", formId: "form-iron", styleId: "style-training" },
    { id: "stance-2", name: "Контроль Стратега", formId: "form-control", styleId: "style-mastermind" },
    { id: "stance-3", name: "Мощь Старого Мастера", formId: "form-power", styleId: "style-elder" },
  ],
  notes: "Черновой персонаж для проверки билдера и экспортов.",
  updatedAt: new Date().toISOString(),
});

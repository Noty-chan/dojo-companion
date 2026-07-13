import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Moon,
  Route,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { seedData, emptyBuild } from "./data/seedData";
import type { BuilderData, CharacterBuild, CreationPath, EnemyBuild, EnemyScaleId, LibraryItem, LibraryKind, MediaAsset, ReferenceSection } from "./types";
import {
  archetypeAbility,
  archetypesForBuild,
  buildTitle,
  creationPathDescriptions,
  creationPathLabels,
  creationPathLimit,
  derivedSkillIds,
  formSkillForForm,
  itemById,
  itemsByKind,
  kindLabels,
  normalizeBuild,
  safeFileName,
  validateBuild,
} from "./utils/build";
import type { AppMode, EncounterPreset, EnemyResolved, HeroRuntime, HeroSection, Party, SavedHero, SceneState, WorkshopSection } from "./appTypes";
import { emptyDiscordSettings, enemyEmbed, heroEmbed, isValidWebhookUrl, partyEmbed, sceneEmbed, sendDiscordEmbed, type DiscordEmbed, type DiscordSettings } from "./utils/discord";
import { loadCloudConfig, pullSnapshot, pushSnapshot, saveCloudConfig, type CloudConfig, type CloudSnapshot } from "./utils/cloud";
import { clampCount, emptyEnemyTokens, enemyScales, normalizeEnemyBuild, scaleById } from "./utils/enemy";
import { enemyPlainText, resolveEnemyBuild } from "./utils/enemyResolve";
import { sceneParameterSummary } from "./utils/scene";
import {
  AbilityBlock,
  ActionPreview,
  BuildSlot,
  CollapsibleBlock,
  EmptyHint,
  ExportPanel,
  ItemBadges,
  NumberField,
  RulesPanel,
  SectionSwitch,
  SkillPill,
  StepHeader,
  categoryOrder,
  libraryMeta,
} from "./components/shared";
import { QuickReferencePanel, ReferenceDashboard, ReferenceReader, ReferenceStats } from "./components/reference";
import { EnemySide, EnemyWorkspace } from "./components/workshop";
import { CharacterSheetWorkspace, HomeDashboard, ImportExportSide, ImportExportWorkspace, SavedHeroesWorkspace } from "./components/sections";
import { downloadText, runExport } from "./utils/exporters";
import { deleteMediaAsset as deleteMediaAssetFromDb, loadMediaAssets as loadMediaAssetsFromDb, putMediaAsset } from "./utils/mediaStore";
import { downloadPortableCardPng, extractPortablePayload, readFileAsDataUrl } from "./utils/portablePng";
import "./styles.css";

const stepOrder = [
  { id: "path", label: "Подход" },
  { id: "archetypes", label: "Архетипы" },
  { id: "stances", label: "Стойки" },
  { id: "stat", label: "Стать" },
  { id: "skills", label: "Навыки" },
  { id: "export", label: "Проверка" },
] as const;

type StepId = (typeof stepOrder)[number]["id"];

// Хаб-модель: внутри раздела нет глобальной навигации по разделам — только имя
// текущего раздела и кнопка «На главную». Класс задаёт категорийный цвет (как манифактуры в COMP/CON).
const sectionHeaderMeta: Record<Exclude<AppMode, "home">, { title: string; tag: string; accentClass: string }> = {
  heroes: { title: "Герои", tag: "HEROES", accentClass: "heroes" },
  reference: { title: "Справочник", tag: "REFERENCE", accentClass: "reference" },
  workshop: { title: "Мастерская", tag: "WORKSHOP", accentClass: "workshop" },
  io: { title: "Экспорт / импорт", tag: "DATA", accentClass: "io" },
};

const savedHeroesStorageKey = "panic-dojo.saved-heroes.v1";
const sceneStorageKey = "panic-dojo.scene.v1";
const enemyBuildStorageKey = "panic-dojo.enemy-build.v1";
const enemyRosterStorageKey = "panic-dojo.enemy-roster.v1";
const encounterPresetsStorageKey = "panic-dojo.encounter-presets.v1";
const currentBuildStorageKey = "panic-dojo.current-build.v1";
const heroRuntimeStorageKey = "panic-dojo.hero-runtime.v1";
const partiesStorageKey = "panic-dojo.parties.v1";
const activePartyStorageKey = "panic-dojo.active-party.v1";
const discordStorageKey = "panic-dojo.discord.v1";

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyEnemyBuild(): EnemyBuild {
  const scale = scaleById("feather");
  return {
    schemaVersion: 1,
    id: makeId("enemy"),
    name: "Новый враг",
    level: 1,
    kind: "boss",
    scaleId: "feather",
    count: 1,
    hpMax: scale.hp,
    hpCurrent: scale.hp,
    shield: 0,
    armorSpent: false,
    armorState: "none",
    tokens: { ...emptyEnemyTokens },
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function emptyHeroRuntime(): HeroRuntime {
  return {
    hpMax: 6,
    hpCurrent: 6,
    shield: 0,
    armorSpent: false,
    tokens: { ...emptyEnemyTokens },
    notes: "",
  };
}

function emptySceneState(): SceneState {
  return {
    name: "Новая сцена",
    scaleId: "feather",
    arenaParameterIds: [],
    tiltedParameterIds: [],
    victoryParameterId: "battle-parameters-последний-выживший",
    objective: "",
    location: "",
    stakes: "",
    reasons: "",
    setupConditions: "",
    notes: "",
    plan: "",
  };
}

function loadSavedHeroes(): SavedHero[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(savedHeroesStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && item.build);
  } catch {
    return [];
  }
}

function loadSceneState(): SceneState {
  if (typeof window === "undefined") return emptySceneState();
  try {
    const raw = window.localStorage.getItem(sceneStorageKey);
    if (!raw) return emptySceneState();
    return { ...emptySceneState(), ...JSON.parse(raw) };
  } catch {
    return emptySceneState();
  }
}

function loadEnemyBuild(): EnemyBuild {
  if (typeof window === "undefined") return emptyEnemyBuild();
  try {
    const raw = window.localStorage.getItem(enemyBuildStorageKey);
    if (!raw) return emptyEnemyBuild();
    return normalizeEnemyBuild({ ...emptyEnemyBuild(), ...JSON.parse(raw) });
  } catch {
    return emptyEnemyBuild();
  }
}

function loadEnemyRoster(): EnemyBuild[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(enemyRosterStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string")
      .map((item) => normalizeEnemyBuild({ ...emptyEnemyBuild(), ...item }));
  } catch {
    return [];
  }
}

// Текущий герой в билдере: до этого сцена и враг переживали F5, а недособранный герой — нет.
// Нормализуем на seed-данных; после загрузки builder-data.json билд нормализуется повторно.
function loadCurrentBuild(): CharacterBuild {
  if (typeof window === "undefined") return emptyBuild();
  try {
    const raw = window.localStorage.getItem(currentBuildStorageKey);
    if (!raw) return emptyBuild();
    return normalizeBuild(seedData, JSON.parse(raw));
  } catch {
    return emptyBuild();
  }
}

function loadHeroRuntime(): HeroRuntime {
  if (typeof window === "undefined") return emptyHeroRuntime();
  try {
    const raw = window.localStorage.getItem(heroRuntimeStorageKey);
    if (!raw) return emptyHeroRuntime();
    const parsed = JSON.parse(raw);
    return {
      ...emptyHeroRuntime(),
      ...parsed,
      tokens: { ...emptyEnemyTokens, ...(parsed?.tokens ?? {}) },
    };
  } catch {
    return emptyHeroRuntime();
  }
}

function normalizeParty(record: Partial<Party>): Party {
  return {
    id: typeof record.id === "string" ? record.id : makeId("party"),
    name: typeof record.name === "string" ? record.name : "Новая пачка",
    notes: typeof record.notes === "string" ? record.notes : "",
    heroIds: Array.isArray(record.heroIds) ? record.heroIds.filter((id) => typeof id === "string") : [],
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

function loadParties(): Party[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(partiesStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string").map(normalizeParty);
  } catch {
    return [];
  }
}

function loadDiscordSettings(): DiscordSettings {
  if (typeof window === "undefined") return { ...emptyDiscordSettings };
  try {
    const raw = window.localStorage.getItem(discordStorageKey);
    if (!raw) return { ...emptyDiscordSettings };
    return { ...emptyDiscordSettings, ...JSON.parse(raw) };
  } catch {
    return { ...emptyDiscordSettings };
  }
}

function loadEncounterPresets(): EncounterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(encounterPresetsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && Array.isArray(item.roster));
  } catch {
    return [];
  }
}

function App() {
  const [data, setData] = useState(seedData);
  const [dataReady, setDataReady] = useState(false);
  const [activeMode, setActiveMode] = useState<AppMode>("home");
  const [heroSection, setHeroSection] = useState<HeroSection>("builder");
  const [workshopSection, setWorkshopSection] = useState<WorkshopSection>("enemy");
  const [enemyBuild, setEnemyBuild] = useState<EnemyBuild>(() => loadEnemyBuild());
  const [enemyRoster, setEnemyRoster] = useState<EnemyBuild[]>(() => loadEnemyRoster());
  const [sceneState, setSceneState] = useState<SceneState>(() => loadSceneState());
  const [encounterPresets, setEncounterPresets] = useState<EncounterPreset[]>(() => loadEncounterPresets());
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [build, setBuild] = useState<CharacterBuild>(() => loadCurrentBuild());
  const [savedHeroes, setSavedHeroes] = useState<SavedHero[]>(() => loadSavedHeroes());
  const [activeSavedHeroId, setActiveSavedHeroId] = useState<string | undefined>();
  const [heroRuntime, setHeroRuntime] = useState<HeroRuntime>(() => loadHeroRuntime());
  const [parties, setParties] = useState<Party[]>(() => loadParties());
  const [activePartyId, setActivePartyId] = useState<string | undefined>(() => {
    try {
      return window.localStorage.getItem(activePartyStorageKey) ?? undefined;
    } catch {
      return undefined;
    }
  });
  const [discordSettings, setDiscordSettings] = useState<DiscordSettings>(() => loadDiscordSettings());
  const [cloudConfig, setCloudConfigState] = useState<CloudConfig | undefined>(() =>
    typeof window === "undefined" ? undefined : loadCloudConfig(),
  );
  const [cloudUserEmail, setCloudUserEmail] = useState<string | undefined>();
  const [cloudBusy, setCloudBusy] = useState(false);
  const [activeKind, setActiveKind] = useState<LibraryKind>("archetype");
  const [activeReferenceSectionId, setActiveReferenceSectionId] = useState<string | undefined>();
  const referenceReaderRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("dojo-theme") : null;
    return saved === "light" ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("dojo-theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const [activeStep, setActiveStep] = useState<StepId>("path");
  const [activeStanceId, setActiveStanceId] = useState("stance-1");
  const [inspectedItemId, setInspectedItemId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    if (!importMessage) return;
    const timer = window.setTimeout(() => setImportMessage(""), 6000);
    return () => window.clearTimeout(timer);
  }, [importMessage]);

  useEffect(() => {
    let ignore = false;
    fetch("./data/builder-data.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (ignore) return;
        setData(payload);
        setBuild((current) => normalizeBuild(payload, current));
        setDataReady(true);
      })
      .catch((error) => {
        console.warn("Не удалось загрузить builder-data.json; работаем на встроенном наборе данных.", error);
        if (!ignore) setDataReady(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(savedHeroesStorageKey, JSON.stringify(savedHeroes));
    } catch {
      // Local storage can be unavailable in hardened browser modes; the in-memory list still works for the session.
    }
  }, [savedHeroes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(sceneStorageKey, JSON.stringify(sceneState));
    } catch {
      // Keep the live state even if local storage is unavailable.
    }
  }, [sceneState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(encounterPresetsStorageKey, JSON.stringify(encounterPresets));
    } catch {
      // Presets remain available in memory for the session.
    }
  }, [encounterPresets]);

  useEffect(() => {
    try {
      window.localStorage.setItem(enemyBuildStorageKey, JSON.stringify(enemyBuild));
    } catch {
      // Enemy state stays in memory for the session.
    }
  }, [enemyBuild]);

  useEffect(() => {
    try {
      window.localStorage.setItem(enemyRosterStorageKey, JSON.stringify(enemyRoster));
    } catch {
      // Roster stays in memory for the session.
    }
  }, [enemyRoster]);

  useEffect(() => {
    try {
      window.localStorage.setItem(currentBuildStorageKey, JSON.stringify(build));
    } catch {
      // The in-progress build stays in memory for the session.
    }
  }, [build]);

  useEffect(() => {
    try {
      window.localStorage.setItem(heroRuntimeStorageKey, JSON.stringify(heroRuntime));
    } catch {
      // Play trackers stay in memory for the session.
    }
  }, [heroRuntime]);

  useEffect(() => {
    try {
      window.localStorage.setItem(partiesStorageKey, JSON.stringify(parties));
    } catch {
      // Parties stay in memory for the session.
    }
  }, [parties]);

  useEffect(() => {
    try {
      if (activePartyId) window.localStorage.setItem(activePartyStorageKey, activePartyId);
      else window.localStorage.removeItem(activePartyStorageKey);
    } catch {
      // Selection stays in memory for the session.
    }
  }, [activePartyId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(discordStorageKey, JSON.stringify(discordSettings));
    } catch {
      // Webhook settings stay in memory for the session.
    }
  }, [discordSettings]);

  // Медиатека живёт в IndexedDB (лимит localStorage ~5 МБ для картинок слишком мал);
  // при первом запуске старые картинки переносятся из localStorage автоматически.
  useEffect(() => {
    let ignore = false;
    loadMediaAssetsFromDb()
      .then((assets) => {
        if (!ignore) setMediaAssets(assets);
      })
      .catch((error) => console.warn("Не удалось открыть медиатеку (IndexedDB).", error));
    return () => {
      ignore = true;
    };
  }, []);

  const issues = useMemo(() => validateBuild(data, build), [data, build]);
  const chosenArchetypes = useMemo(() => archetypesForBuild(data, build), [data, build]);
  const standardSkillIds = useMemo(() => derivedSkillIds(data, build), [data, build]);
  const selectedSkills = useMemo(
    () => build.skillIds.map((id) => itemById(data, id)).filter(Boolean) as LibraryItem[],
    [build.skillIds, data],
  );
  const inspectedItem = useMemo(
    () =>
      itemById(data, inspectedItemId) ??
      chosenArchetypes[0] ??
      itemById(data, build.stances[0]?.formId) ??
      itemById(data, build.stances[0]?.styleId),
    [build.stances, chosenArchetypes, data, inspectedItemId],
  );
  const activeReferenceSection = useMemo(() => {
    const sections = data.referenceSections ?? [];
    return sections.find((section) => section.id === activeReferenceSectionId) ?? sections[0];
  }, [activeReferenceSectionId, data.referenceSections]);
  // При выборе раздела справочника (кнопкой «Разделы книги» или ссылкой с главной)
  // прокручиваем читалку в зону видимости — иначе на ПК её прячет высокая «Памятка за столом».
  useEffect(() => {
    if (activeMode !== "reference") return;
    if (!activeReferenceSectionId) return;
    referenceReaderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeMode, activeReferenceSectionId]);
  const enemyAdvancementSection = useMemo(
    () => (data.referenceSections ?? []).find((section) => section.id === "enemy-advancement"),
    [data.referenceSections],
  );
  const battleParameterSection = useMemo(
    () => (data.referenceSections ?? []).find((section) => section.id === "battle-parameters"),
    [data.referenceSections],
  );
  const villainSection = useMemo(
    () => (data.referenceSections ?? []).find((section) => section.id === "villain-archetypes"),
    [data.referenceSections],
  );
  const superMoveSection = useMemo(
    () => (data.referenceSections ?? []).find((section) => section.id === "super-moves"),
    [data.referenceSections],
  );

  const currentEnemyResolved = useMemo(
    () => resolveEnemyBuild(enemyBuild, enemyAdvancementSection, villainSection, superMoveSection),
    [enemyBuild, enemyAdvancementSection, superMoveSection, villainSection],
  );
  const enemyRosterResolved = useMemo(
    () => enemyRoster.map((enemy) => resolveEnemyBuild(enemy, enemyAdvancementSection, villainSection, superMoveSection)),
    [enemyAdvancementSection, enemyRoster, superMoveSection, villainSection],
  );

  const visibleItems = useMemo(() => {
    let source = itemsByKind(data, activeKind);
    if (activeKind === "style" && build.creationPath !== "vortex" && build.archetypeIds.length > 0) {
      const allowedFamilies = new Set(chosenArchetypes.map((item) => item.nameRu));
      source = source.filter((item) => item.family && allowedFamilies.has(item.family));
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((item) =>
      [item.nameRu, item.nameEn, item.family, item.actionDice, item.purpleDice, item.rules.summary, ...(item.roles ?? []), ...(item.rules.tags ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [activeKind, build.archetypeIds, build.creationPath, chosenArchetypes, data, query]);

  function patchBuild(patch: Partial<CharacterBuild>) {
    setBuild((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  function upsertSavedHeroFromBuild(heroBuild: CharacterBuild, existingId?: string) {
    const id = existingId ?? makeId("hero");
    const updatedAt = new Date().toISOString();
    const record: SavedHero = {
      id,
      name: heroBuild.characterName.trim() || "Безымянный герой",
      playerName: heroBuild.playerName.trim(),
      updatedAt,
      build: { ...heroBuild, updatedAt },
    };
    const isNewRecord = !savedHeroes.some((hero) => hero.id === id);
    const evictedName = isNewRecord && savedHeroes.length >= 24 ? savedHeroes[savedHeroes.length - 1].name : undefined;
    setSavedHeroes((current) => [record, ...current.filter((hero) => hero.id !== id)].slice(0, 24));
    setActiveSavedHeroId(id);
    return { record, evictedName };
  }

  function saveCurrentHero() {
    const { record, evictedName } = upsertSavedHeroFromBuild(build, activeSavedHeroId);
    setImportMessage(
      evictedName
        ? `Сохранено: ${record.name}. Достигнут лимит в 24 сохранения — удалено самое старое: ${evictedName}.`
        : `Сохранено: ${record.name}`,
    );
  }

  function loadSavedHero(hero: SavedHero) {
    setBuild(normalizeBuild(data, hero.build));
    setActiveSavedHeroId(hero.id);
    setHeroSection("builder");
    setImportMessage(`Загружено: ${hero.name}`);
  }

  function openSavedHeroBuilder(hero: SavedHero) {
    loadSavedHero(hero);
    setActiveMode("heroes");
  }

  function openSavedHeroSheet(hero: SavedHero) {
    setBuild(normalizeBuild(data, hero.build));
    setActiveSavedHeroId(hero.id);
    setHeroSection("sheet");
    setActiveMode("heroes");
    setImportMessage(`Лист открыт: ${hero.name}`);
  }

  function deleteSavedHero(id: string) {
    const hero = savedHeroes.find((record) => record.id === id);
    if (!window.confirm(`Удалить сохранение «${hero?.name ?? "герой"}»? Отменить будет нельзя.`)) return;
    setSavedHeroes((current) => current.filter((record) => record.id !== id));
    if (activeSavedHeroId === id) setActiveSavedHeroId(undefined);
  }

  function patchHeroRuntime(patch: Partial<HeroRuntime>) {
    setHeroRuntime((current) => {
      const hpMax = Math.max(1, Number(patch.hpMax ?? current.hpMax) || 6);
      const hpCurrent = Math.min(hpMax, Math.max(0, Number(patch.hpCurrent ?? current.hpCurrent) || 0));
      return {
        ...current,
        ...patch,
        hpMax,
        hpCurrent,
        shield: Math.max(0, Number(patch.shield ?? current.shield) || 0),
        armorSpent: Boolean(patch.armorSpent ?? current.armorSpent),
        tokens: { ...emptyEnemyTokens, ...(patch.tokens ?? current.tokens) },
      };
    });
  }

  function adjustHeroToken(tokenId: string, delta: number) {
    setHeroRuntime((current) => ({
      ...current,
      tokens: { ...current.tokens, [tokenId]: clampCount((current.tokens?.[tokenId] ?? 0) + delta) },
    }));
  }

  function resetHeroRuntime() {
    setHeroRuntime(emptyHeroRuntime());
  }

  function patchEnemy(patch: Partial<EnemyBuild>) {
    setEnemyBuild((current) => normalizeEnemyBuild({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  function adjustEnemyToken(tokenId: string, delta: number) {
    setEnemyBuild((current) =>
      normalizeEnemyBuild({
        ...current,
        tokens: { ...current.tokens, [tokenId]: clampCount((current.tokens?.[tokenId] ?? 0) + delta) },
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  function resetEnemyCombat() {
    setEnemyBuild((current) =>
      normalizeEnemyBuild({
        ...current,
        hpCurrent: current.hpMax,
        shield: 0,
        armorSpent: false,
        tokens: { ...emptyEnemyTokens },
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  function patchSceneState(patch: Partial<SceneState>) {
    setSceneState((current) => ({ ...current, ...patch }));
  }

  function applySceneScale(scaleId: EnemyScaleId) {
    const scale = scaleById(scaleId);
    setSceneState((current) => ({ ...current, scaleId }));
    setEnemyBuild((current) => normalizeEnemyBuild({ ...current, scaleId, hpMax: scale.hp, hpCurrent: scale.hp, updatedAt: new Date().toISOString() }));
  }

  function clearSceneRoster() {
    if (enemyRoster.length > 0 && !window.confirm(`Убрать из сцены все записи (${enemyRoster.length})?`)) return;
    setEnemyRoster([]);
    setImportMessage("Сцена очищена.");
  }

  function saveEncounterPreset() {
    const updatedAt = new Date().toISOString();
    const preset: EncounterPreset = {
      id: makeId("scene"),
      name: sceneState.name.trim() || "Безымянная сцена",
      updatedAt,
      scene: { ...sceneState },
      roster: enemyRoster.map((enemy) => normalizeEnemyBuild(enemy)),
    };
    setEncounterPresets((current) => {
      const next = [preset, ...current];
      return next.slice(0, 18);
    });
    setImportMessage(
      encounterPresets.length >= 18
        ? `Пресет сохранен: ${preset.name}. Достигнут лимит в 18 пресетов — самый старый удалён.`
        : `Пресет сохранен: ${preset.name}`,
    );
  }

  function loadEncounterPreset(preset: EncounterPreset) {
    setSceneState({ ...emptySceneState(), ...preset.scene });
    setEnemyRoster(preset.roster.map((enemy) => normalizeEnemyBuild(enemy)));
    setWorkshopSection("scene");
    setImportMessage(`Пресет загружен: ${preset.name}`);
  }

  function deleteEncounterPreset(id: string) {
    const preset = encounterPresets.find((record) => record.id === id);
    if (!window.confirm(`Удалить пресет «${preset?.name ?? "сцена"}»? Отменить будет нельзя.`)) return;
    setEncounterPresets((current) => current.filter((record) => record.id !== id));
  }

  function addEnemyToRoster() {
    const entry = normalizeEnemyBuild({ ...enemyBuild, scaleId: sceneState.scaleId, updatedAt: new Date().toISOString() });
    // Редактор связан с записью сцены по id: повторное «В сцену» обновляет её, а не плодит дубли.
    if (enemyRoster.some((enemy) => enemy.id === entry.id)) {
      setEnemyRoster((current) => current.map((enemy) => (enemy.id === entry.id ? entry : enemy)));
      setImportMessage(`Обновлено в сцене: ${entry.name}`);
      return;
    }
    if (enemyRoster.length >= 12) {
      setImportMessage("В сцене уже 12 записей — удалите лишние, прежде чем добавлять новые.");
      return;
    }
    setEnemyRoster((current) => [entry, ...current]);
    setImportMessage(`Добавлено в сцену: ${entry.name}`);
  }

  function loadEnemyFromRoster(enemy: EnemyBuild) {
    // id сохраняется — «В сцену» после правок обновит эту же запись.
    setEnemyBuild(normalizeEnemyBuild({ ...enemy, updatedAt: new Date().toISOString() }));
    setWorkshopSection("enemy");
    setImportMessage(`В редакторе: ${enemy.name}`);
  }

  function startNewEnemy() {
    setEnemyBuild(emptyEnemyBuild());
    setImportMessage("Редактор очищен — собирайте нового врага.");
  }

  // Загрузка готового врага из книги: форму/стиль сопоставляем по имени с библиотекой,
  // полный блок правил кладём в заметки, вид/имя/броню берём из ростера.
  function loadRosterEnemy(entry: NonNullable<BuilderData["enemyRoster"]>[number]) {
    const form = data.items.find((item) => item.kind === "form" && item.nameRu === entry.formName);
    const style = data.items.find((item) => item.kind === "style" && item.nameRu === entry.styleName);
    const hasArmor = entry.body.some((line) => line.includes("У вас есть броня"));
    const notesLines = [
      entry.stanceName ? `Стойка ${entry.stanceName} (${entry.styleName} · ${entry.formName})` : "",
      entry.dice ? `Дальность: ${entry.range} · Кости: ${entry.dice}` : "",
      ...entry.body,
    ].filter(Boolean);
    setEnemyBuild((current) =>
      normalizeEnemyBuild({
        ...current,
        rosterId: entry.id,
        name: entry.name,
        kind: entry.kind,
        count: entry.count,
        formId: form?.id,
        styleId: style?.id,
        armorState: hasArmor ? "ready" : "none",
        notes: notesLines.join("\n"),
        updatedAt: new Date().toISOString(),
      }),
    );
    setWorkshopSection("enemy");
    setImportMessage(`Готовый враг загружен: ${entry.name}. Кости и правила — в заметках.`);
  }

  function removeEnemyFromRoster(id: string) {
    setEnemyRoster((current) => current.filter((enemy) => enemy.id !== id));
  }

  async function copyEnemyText() {
    try {
      await navigator.clipboard.writeText(enemyPlainText(currentEnemyResolved));
      setImportMessage("Враг скопирован в буфер обмена.");
    } catch {
      // Clipboard API требует безопасный контекст (https/localhost); на LAN-адресе его нет.
      setImportMessage("Буфер обмена недоступен в этом браузере; используйте экспорт JSON.");
    }
  }

  function exportEnemyJson() {
    const payload = {
      type: "panic-at-the-dojo.enemy-build",
      schemaVersion: enemyBuild.schemaVersion,
      exportedAt: new Date().toISOString(),
      build: enemyBuild,
      resolved: currentEnemyResolved,
    };
    downloadText(`${safeFileName(enemyBuild.name)}.dojo-enemy.json`, JSON.stringify(payload, null, 2));
  }

  function exportEncounterJson() {
    const payload = {
      type: "panic-at-the-dojo.encounter",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      scene: sceneState,
      current: enemyBuild,
      roster: enemyRoster,
      resolved: {
        current: currentEnemyResolved,
        roster: enemyRosterResolved,
      },
    };
    downloadText(`panic-dojo-encounter.json`, JSON.stringify(payload, null, 2));
  }

  // --- Пачки игроков -------------------------------------------------------

  function createParty() {
    const record = normalizeParty({ name: `Пачка ${parties.length + 1}` });
    setParties((current) => [record, ...current]);
    setActivePartyId(record.id);
    setImportMessage(`Создана пачка: ${record.name}. Добавляйте героев кнопкой «В пачку».`);
  }

  function patchParty(id: string, patch: Partial<Party>) {
    setParties((current) => current.map((party) => (party.id === id ? { ...party, ...patch, updatedAt: new Date().toISOString() } : party)));
  }

  function deleteParty(id: string) {
    const party = parties.find((record) => record.id === id);
    if (!window.confirm(`Удалить пачку «${party?.name ?? "без названия"}»? Сами герои останутся в картотеке.`)) return;
    setParties((current) => current.filter((record) => record.id !== id));
    if (activePartyId === id) setActivePartyId(undefined);
  }

  function toggleHeroInParty(heroId: string) {
    if (!activePartyId) return;
    setParties((current) =>
      current.map((party) =>
        party.id === activePartyId
          ? {
              ...party,
              heroIds: party.heroIds.includes(heroId) ? party.heroIds.filter((id) => id !== heroId) : [...party.heroIds, heroId],
              updatedAt: new Date().toISOString(),
            }
          : party,
      ),
    );
  }

  function exportPartyJson(party: Party) {
    // В файл кладём и сами билды участников: пачку можно принести на другое
    // устройство, и герои приедут вместе с ней.
    const members = party.heroIds.map((id) => savedHeroes.find((hero) => hero.id === id)).filter(Boolean) as SavedHero[];
    const payload = {
      type: "panic-at-the-dojo.party",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      party,
      heroes: members,
    };
    downloadText(`${safeFileName(party.name || "пачка")}.dojo-party.json`, JSON.stringify(payload, null, 2));
  }

  // --- Discord --------------------------------------------------------------

  const discordReady = isValidWebhookUrl(discordSettings.webhookUrl);

  function patchDiscordSettings(patch: Partial<DiscordSettings>) {
    setDiscordSettings((current) => ({ ...current, ...patch }));
  }

  async function sendToDiscord(embed: DiscordEmbed, successMessage: string) {
    try {
      await sendDiscordEmbed(discordSettings, embed);
      setImportMessage(successMessage);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Не удалось отправить сообщение в Discord.");
    }
  }

  function sendDiscordTest() {
    void sendToDiscord(
      {
        title: "Проверка связи",
        description: "Вебхук настроен: компаньон «Паника в Додзе» может отправлять сюда героев, врагов и сцены.",
        color: 0xc53d2f,
        fields: [],
        footer: { text: "Паника в Додзе — цифровой компаньон" },
      },
      "Тестовое сообщение отправлено в Discord.",
    );
  }

  function sendHeroToDiscord() {
    void sendToDiscord(heroEmbed(data, build), `Герой отправлен в Discord: ${build.characterName.trim() || "Безымянный герой"}`);
  }

  function sendEnemyToDiscord() {
    void sendToDiscord(enemyEmbed(currentEnemyResolved), `Враг отправлен в Discord: ${enemyBuild.name}`);
  }

  function sendSceneToDiscord() {
    void sendToDiscord(sceneEmbed(sceneState, enemyRosterResolved, battleParameterSection), `Сцена отправлена в Discord: ${sceneState.name || "Сцена"}`);
  }

  function sendPartyToDiscord(party: Party) {
    void sendToDiscord(partyEmbed(data, party, savedHeroes), `Пачка отправлена в Discord: ${party.name || "без названия"}`);
  }

  // --- Облако ---------------------------------------------------------------

  function setCloudConfig(config?: CloudConfig) {
    saveCloudConfig(config);
    setCloudConfigState(config);
    if (!config) setCloudUserEmail(undefined);
  }

  function buildCloudSnapshot(): CloudSnapshot {
    return {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      savedHeroes,
      parties,
      encounterPresets,
      scene: sceneState,
      enemyRoster,
      enemyBuild,
      currentBuild: build,
    };
  }

  async function pushToCloud() {
    if (!cloudConfig) return;
    setCloudBusy(true);
    try {
      await pushSnapshot(cloudConfig, buildCloudSnapshot());
      setImportMessage("Прогресс сохранён в облако.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Не удалось сохранить в облако.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function pullFromCloud() {
    if (!cloudConfig) return;
    if (!window.confirm("Загрузить копию из облака? Локальные герои, пачки и сцены будут заменены облачными.")) return;
    setCloudBusy(true);
    try {
      const snapshot = await pullSnapshot(cloudConfig);
      if (!snapshot) {
        setImportMessage("В облаке пока нет сохранённой копии — сначала нажмите «В облако».");
        return;
      }
      setSavedHeroes(Array.isArray(snapshot.savedHeroes) ? snapshot.savedHeroes.filter((hero) => hero && typeof hero.id === "string" && hero.build) : []);
      setParties(Array.isArray(snapshot.parties) ? snapshot.parties.map(normalizeParty) : []);
      setEncounterPresets(Array.isArray(snapshot.encounterPresets) ? snapshot.encounterPresets : []);
      setSceneState({ ...emptySceneState(), ...(snapshot.scene ?? {}) });
      setEnemyRoster(Array.isArray(snapshot.enemyRoster) ? snapshot.enemyRoster.map((enemy) => normalizeEnemyBuild(enemy)) : []);
      if (snapshot.enemyBuild) setEnemyBuild(normalizeEnemyBuild(snapshot.enemyBuild));
      if (snapshot.currentBuild) setBuild(normalizeBuild(data, snapshot.currentBuild));
      setActivePartyId(undefined);
      setImportMessage(`Прогресс загружен из облака (копия от ${new Date(snapshot.savedAt).toLocaleString()}).`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Не удалось загрузить из облака.");
    } finally {
      setCloudBusy(false);
    }
  }

  function setMode(mode: AppMode) {
    setActiveMode(mode);
    if (mode === "workshop") {
      setActiveReferenceSectionId("enemy-advancement");
    }
  }

  function setCreationPath(path: CreationPath) {
    const limit = creationPathLimit(path);
    setBuild((current) => {
      const archetypeIds = current.archetypeIds.slice(0, limit);
      return {
        ...current,
        creationPath: path,
        archetypeIds,
        archetypeId: archetypeIds[0],
        updatedAt: new Date().toISOString(),
      };
    });
    setActiveKind("archetype");
    setActiveStep("archetypes");
  }

  function toggleArchetype(item: LibraryItem) {
    const limit = creationPathLimit(build.creationPath);
    setBuild((current) => {
      let archetypeIds = current.archetypeIds.includes(item.id)
        ? current.archetypeIds.filter((id) => id !== item.id)
        : limit === 1
          ? [item.id]
          : [...current.archetypeIds, item.id];
      if (archetypeIds.length > limit) archetypeIds = [...archetypeIds.slice(0, limit - 1), item.id];
      return {
        ...current,
        archetypeIds,
        archetypeId: archetypeIds[0],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function syncSkillsForStances(stances: CharacterBuild["stances"]) {
    const ids = stances.map((stance) => formSkillForForm(data, stance.formId)?.id).filter(Boolean) as string[];
    return [...new Set(ids)];
  }

  function setStanceValue(stanceId: string, patch: Partial<CharacterBuild["stances"][number]>) {
    setBuild((current) => {
      const stances = current.stances.map((stance) => (stance.id === stanceId ? { ...stance, ...patch } : stance));
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        stances,
        skillIds: patch.formId ? syncSkillsForStances(stances) : current.skillIds,
      };
    });
  }

  function toggleSkill(item: LibraryItem) {
    setBuild((current) => {
      const exists = current.skillIds.includes(item.id);
      const next = exists ? current.skillIds.filter((id) => id !== item.id) : [...current.skillIds, item.id].slice(-3);
      return { ...current, skillIds: next, updatedAt: new Date().toISOString() };
    });
  }

  function addItemToBuild(item: LibraryItem) {
    setInspectedItemId(item.id);
    if (activeMode !== "heroes") return;
    if (item.kind === "archetype") {
      toggleArchetype(item);
      return;
    }
    if (item.kind === "stat") {
      patchBuild({ statId: item.id });
      setActiveStep("skills");
      return;
    }
    if (item.kind === "skill") {
      toggleSkill(item);
      return;
    }
    if (item.kind === "form") {
      setStanceValue(activeStanceId, { formId: item.id });
      return;
    }
    if (item.kind === "style") {
      setStanceValue(activeStanceId, { styleId: item.id });
    }
  }

  function isItemSelected(item: LibraryItem): boolean {
    if (activeMode === "reference") return inspectedItemId === item.id;
    if (item.kind === "archetype") return build.archetypeIds.includes(item.id);
    if (item.kind === "stat") return build.statId === item.id;
    if (item.kind === "skill") return build.skillIds.includes(item.id);
    if (item.kind === "form") return build.stances.some((stance) => stance.formId === item.id);
    if (item.kind === "style") return build.stances.some((stance) => stance.styleId === item.id);
    return false;
  }

  function importJsonPayload(payload: unknown, sourceName = "файл") {
    const record = payload as { type?: string; build?: unknown; scene?: SceneState; roster?: EnemyBuild[]; current?: EnemyBuild; party?: Party; heroes?: SavedHero[] };
    if (record.type?.includes("party") && record.party) {
      const party = normalizeParty(record.party);
      const incomingHeroes = (record.heroes ?? []).filter((hero) => hero && typeof hero.id === "string" && hero.build);
      // Герои из файла подселяются в картотеку без дублей (совпадение по id = обновление).
      setSavedHeroes((current) => {
        const merged = [...incomingHeroes, ...current.filter((hero) => !incomingHeroes.some((incoming) => incoming.id === hero.id))];
        return merged.slice(0, 24);
      });
      setParties((current) => [party, ...current.filter((item) => item.id !== party.id)]);
      setActivePartyId(party.id);
      setActiveMode("workshop");
      setWorkshopSection("heroes");
      setImportMessage(`Импортирована пачка: ${party.name || sourceName} (${incomingHeroes.length} героев).`);
      return;
    }
    if (record.type?.includes("character") || (record.build && Array.isArray((record.build as CharacterBuild).stances))) {
      const imported = normalizeBuild(data, (record.build ?? payload) as Partial<CharacterBuild>);
      const { record: saved, evictedName } = upsertSavedHeroFromBuild(imported);
      setBuild(saved.build);
      setActiveMode("heroes");
      setHeroSection("builder");
      setImportMessage(
        evictedName
          ? `Импортирован и сохранён герой: ${saved.name}. Лимит 24 — удалено самое старое: ${evictedName}.`
          : `Импортирован и сохранён герой: ${saved.name}`,
      );
      return;
    }
    if (record.type?.includes("enemy") && record.build) {
      const imported = normalizeEnemyBuild(record.build as EnemyBuild);
      setEnemyBuild(imported);
      setActiveMode("workshop");
      setWorkshopSection("enemy");
      setImportMessage(`Импортирован враг: ${imported.name || sourceName}`);
      return;
    }
    if (record.type?.includes("encounter") || record.roster) {
      setSceneState({ ...emptySceneState(), ...(record.scene ?? {}) });
      setEnemyRoster((record.roster ?? []).map((enemy) => normalizeEnemyBuild(enemy)));
      if (record.current) setEnemyBuild(normalizeEnemyBuild(record.current));
      setActiveMode("workshop");
      setWorkshopSection("scene");
      setImportMessage(`Импортирована сцена: ${record.scene?.name || sourceName}`);
      return;
    }
    throw new Error("Не удалось распознать данные файла.");
  }

  async function addMediaAsset(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    const asset: MediaAsset = {
      id: makeId("asset"),
      name: file.name,
      type: file.type || "image/*",
      dataUrl,
      addedAt: new Date().toISOString(),
    };
    setMediaAssets((current) => [asset, ...current]);
    try {
      await putMediaAsset(asset);
      setImportMessage(`Картинка добавлена: ${file.name}`);
    } catch {
      setImportMessage(`Картинка «${file.name}» добавлена, но не сохранилась в хранилище — после перезагрузки она исчезнет.`);
    }
  }

  async function importPortableFile(file: File) {
    if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
      const payload = await extractPortablePayload(file);
      if (payload) {
        importJsonPayload(payload, file.name);
        return;
      }
      await addMediaAsset(file);
      return;
    }
    if (file.type.startsWith("image/")) {
      await addMediaAsset(file);
      return;
    }
    const text = await file.text();
    importJsonPayload(JSON.parse(text), file.name);
  }

  async function importPortableFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      try {
        await importPortableFile(file);
      } catch (error) {
        setImportMessage(`Не удалось импортировать «${file.name}»: ${error instanceof Error ? error.message : "файл повреждён или не распознан"}`);
      }
    }
  }

  function removeMediaAsset(id: string) {
    setMediaAssets((current) => current.filter((asset) => asset.id !== id));
    deleteMediaAssetFromDb(id).catch((error) => console.warn("Не удалось удалить картинку из хранилища.", error));
  }

  async function exportHeroCardPng() {
    const title = build.characterName.trim() || "Безымянный герой";
    const archetypes = chosenArchetypes.map((item) => item.nameRu).join(" / ") || "архетип не выбран";
    await downloadPortableCardPng(
      `${safeFileName(title)}.dojo-hero-card.png`,
      {
        title,
        subtitle: `${creationPathLabels[build.creationPath]} · ${archetypes}`,
        kind: "Герой",
        accent: "#7b42b6",
        lines: [
          { label: "Стать", value: itemById(data, build.statId)?.nameRu ?? "не выбрана" },
          { label: "Стойки", value: build.stances.map((stance) => stance.name).join(" · ") },
          { label: "Навыки", value: [...selectedSkills.map((item) => item.nameRu), build.customSkill].filter(Boolean).join(" · ") || "не выбраны" },
          ...build.stances.map((stance, index) => ({
            label: `Стойка ${index + 1}`,
            value: `${itemById(data, stance.formId)?.nameRu ?? "форма"} + ${itemById(data, stance.styleId)?.nameRu ?? "стиль"}`,
          })),
        ],
      },
      {
        type: "panic-at-the-dojo.character-card",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        build,
      },
    );
  }

  async function exportEnemyCardPng() {
    const scale = enemyScales.find((item) => item.id === enemyBuild.scaleId) ?? enemyScales[0];
    await downloadPortableCardPng(
      `${safeFileName(enemyBuild.name)}.dojo-enemy-card.png`,
      {
        title: enemyBuild.name || "Враг",
        subtitle: `${currentEnemyResolved.kindLabel} ${enemyBuild.level}-го уровня · ${currentEnemyResolved.villain?.title ?? "без архетипа"}`,
        kind: "Враг",
        accent: "#c53d2f",
        lines: [
          { label: "Кость", value: currentEnemyResolved.dice === "-" ? "нет" : currentEnemyResolved.dice },
          { label: "HP", value: `${enemyBuild.hpCurrent}/${enemyBuild.hpMax}` },
          { label: "Масштаб", value: `${scale.label} · лечение ${scale.heal} · щит ${scale.shieldCap}` },
          { label: "Стойка", value: [itemById(data, enemyBuild.formId)?.nameRu, itemById(data, enemyBuild.styleId)?.nameRu].filter(Boolean).join(" + ") || "не выбрана" },
          // Правила выбранного архетипа/приёма попадают на карточку, а не только их названия.
          ...(currentEnemyResolved.villain
            ? [{ label: `Архетип: ${currentEnemyResolved.villain.title}`, value: currentEnemyResolved.villain.body[0] ?? "—" }]
            : []),
          ...(currentEnemyResolved.superMove || currentEnemyResolved.villainMove
            ? [{
                label: `Супер: ${(currentEnemyResolved.superMove ?? currentEnemyResolved.villainMove)!.title}`,
                value: (currentEnemyResolved.superMove ?? currentEnemyResolved.villainMove)!.effect,
              }]
            : []),
          { label: "Преимущество", value: currentEnemyResolved.benefit },
          { label: "Заметки", value: enemyBuild.notes.trim() || "—" },
        ],
      },
      {
        type: "panic-at-the-dojo.enemy-card",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        build: enemyBuild,
      },
    );
  }

  async function exportEncounterCardPng() {
    const scale = scaleById(sceneState.scaleId);
    const parameters = sceneParameterSummary(sceneState, battleParameterSection);
    await downloadPortableCardPng(
      `${safeFileName(sceneState.name)}.dojo-scene-card.png`,
      {
        title: sceneState.name || "Сцена",
        subtitle: sceneState.location || "локация не указана",
        kind: "Сцена",
        accent: "#1f7a4c",
        lines: [
          { label: "Цель", value: sceneState.objective || "не указана" },
          { label: "Ставки", value: sceneState.stakes || "не указаны" },
          { label: "Причины", value: sceneState.reasons || "не указаны" },
          { label: "Старт", value: sceneState.setupConditions || "обычные условия" },
          { label: "Масштаб", value: `${scale.label} · ${scale.hp} HP · лечение ${scale.heal} · щит ${scale.shieldCap}` },
          { label: "Параметры", value: parameters || "Последний выживший" },
          { label: "Враги", value: enemyRosterResolved.map((enemy) => `${enemy.build.count} x ${enemy.build.name}`).join(" · ") || "пока нет" },
          { label: "План", value: sceneState.plan.trim() || "—" },
          { label: "Заметки", value: sceneState.notes.trim() || "—" },
        ],
      },
      {
        type: "panic-at-the-dojo.encounter-card",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        scene: sceneState,
        current: enemyBuild,
        roster: enemyRoster,
      },
    );
  }

  return (
    <main className="appShell">
      <header className={`topbar ${activeMode === "home" ? "topbarHome" : "topbarSection"}`}>
        <button className="brand" onClick={() => setMode("home")} aria-label="На главную">
          <span className="brandMark">道</span>
          <div>
            <h1>Паника в Додзе</h1>
            <p>цифровой компаньон</p>
          </div>
        </button>
        <div className="topbarRight">
          {activeMode !== "home" && (
            <div className="hubBar">
              <div className={`hubSection ${sectionHeaderMeta[activeMode].accentClass}`}>
                <span className="hubSectionName">{sectionHeaderMeta[activeMode].title}</span>
              </div>
              <button className="hubBack" onClick={() => setMode("home")}>
                <ArrowLeft size={16} /> На главную
              </button>
            </div>
          )}
          <button
            className="themeToggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <section className={`workspace ${activeMode}Layout`}>
        {activeMode === "heroes" && (
        <aside className="libraryPanel">
          <div className="panelHeader">
            <h2>Библиотека</h2>
            <span>{visibleItems.length} / {data.items.length}</span>
          </div>
          <div className="searchBox">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию, тегу, эффекту" />
          </div>
          <div className="tabs">
            {categoryOrder.map((kind) => (
              <button key={kind} className={kind === activeKind ? "active" : ""} onClick={() => setActiveKind(kind)}>
                {kindLabels[kind]}
              </button>
            ))}
          </div>
          <div className="libraryList">
            {visibleItems.map((item) => (
              <button key={item.id} className={`libraryCard ${isItemSelected(item) ? "selected" : ""}`} onClick={() => addItemToBuild(item)}>
                <span className="colorBar" style={{ background: item.color }} />
                <span className="cardTitle">{item.nameRu}</span>
                <span className="cardMeta">
                  {libraryMeta(item)}
                </span>
                {(item.roles?.length || item.purpleDice) && <ItemBadges item={item} compact />}
                <span className="cardSummary">{item.rules.summary}</span>
              </button>
            ))}
          </div>
        </aside>
        )}

        {activeMode === "home" ? (
          <HomeDashboard
            data={data}
            dataReady={dataReady}
            build={build}
            savedHeroesCount={savedHeroes.length}
            enemyRosterCount={enemyRoster.length}
            setMode={setMode}
            setActiveReferenceSectionId={setActiveReferenceSectionId}
          />
        ) : activeMode === "heroes" ? (
        <section className="builderPanel">
          <SectionSwitch
            label="Герои"
            value={heroSection}
            options={[
              { id: "builder", label: "Билдер", meta: "сборка" },
              { id: "saved", label: "Сохраненные", meta: `${savedHeroes.length}` },
              { id: "sheet", label: "Лист", meta: "игра" },
            ]}
            onChange={setHeroSection}
          />

          {heroSection === "builder" ? (
          <>
          <div className="characterHeader">
            <div>
              <label>Имя персонажа</label>
              <input aria-label="Имя персонажа" value={build.characterName} onChange={(event) => patchBuild({ characterName: event.target.value })} />
            </div>
            <div>
              <label>Игрок</label>
              <input aria-label="Игрок" value={build.playerName} onChange={(event) => patchBuild({ playerName: event.target.value })} placeholder="необязательно" />
            </div>
          </div>

          <div className="stepRail">
            {stepOrder.map((step, index) => (
              <button key={step.id} className={activeStep === step.id ? "active" : ""} onClick={() => setActiveStep(step.id)}>
                <span>{index + 1}</span>
                {step.label}
              </button>
            ))}
          </div>

          <section className="stepCard" data-active={activeStep === "path"}>
            <StepHeader number="1" title="Выберите подход" detail="Героя можно собрать тремя способами: Адепт, Химера или Вихрь." />
            <div className="pathGrid">
              {(["adept", "chimera", "vortex"] as CreationPath[]).map((path) => (
                <button key={path} data-testid={`path-${path}`} className={build.creationPath === path ? "selected" : ""} onClick={() => setCreationPath(path)}>
                  <Route size={18} />
                  <strong>{creationPathLabels[path]}</strong>
                  <span>{creationPathDescriptions[path]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="stepCard" data-active={activeStep === "archetypes"}>
            <StepHeader
              number="2"
              title="Архетипы и способности"
              detail={`${creationPathLabels[build.creationPath]} выбирает ${creationPathLimit(build.creationPath)} архетип(а/ов).`}
              action={<button onClick={() => setActiveKind("archetype")}>Открыть архетипы</button>}
            />
            <div className="selectedGrid">
              {chosenArchetypes.map((item) => (
                <AbilityBlock key={item.id} item={item} path={build.creationPath} />
              ))}
              {chosenArchetypes.length === 0 && <EmptyHint text="Выберите архетип в библиотеке слева." />}
            </div>
          </section>

          <section className="stepCard" data-active={activeStep === "stances"}>
            <StepHeader
              number="3"
              title={build.creationPath === "vortex" ? "Три набора Вихря" : "Три стойки"}
              detail={
                build.creationPath === "vortex"
                  ? "Вихрь не фиксирует стойки навсегда: это три формы, три стиля и три способности, из которых он каждый ход собирает новую стойку."
                  : "Каждая стойка состоит из одной формы и одного стиля; формы и стили не повторяются."
              }
            />
            <div className="stanceStack">
              {build.stances.map((stance, index) => {
                const form = itemById(data, stance.formId);
                const style = itemById(data, stance.styleId);
                return (
                  <article key={stance.id} className={`stanceCard ${activeStanceId === stance.id ? "selected" : ""}`} onClick={() => setActiveStanceId(stance.id)}>
                    <div className="stanceTop">
                      <span className="stanceIndex">{index + 1}</span>
                      <input
                        value={stance.name}
                        onChange={(event) => setStanceValue(stance.id, { name: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>
                    <div className="stanceParts">
                      <BuildSlot
                        label="Форма"
                        item={form}
                        empty="Выберите форму"
                        onClick={() => {
                          if (form) setInspectedItemId(form.id);
                          setActiveKind("form");
                        }}
                      />
                      <BuildSlot
                        label="Стиль"
                        item={style}
                        empty="Выберите стиль"
                        onClick={() => {
                          if (style) setInspectedItemId(style.id);
                          setActiveKind("style");
                        }}
                      />
                    </div>
                    <ActionPreview form={form} style={style} />
                  </article>
                );
              })}
            </div>
          </section>

          <section className="stepCard" data-active={activeStep === "stat"}>
            <StepHeader number="4" title="Стать" detail="Стать выбирается отдельно и даёт постоянный бонус вне зависимости от стойки." action={<button onClick={() => setActiveKind("stat")}>Открыть стати</button>} />
            <BuildSlot
              label="Выбранная стать"
              item={itemById(data, build.statId)}
              empty="Выберите стать"
              onClick={() => {
                if (build.statId) setInspectedItemId(build.statId);
                setActiveKind("stat");
              }}
            />
          </section>

          <section className="stepCard" data-active={activeStep === "skills"}>
            <StepHeader number="5" title="Навыки" detail="Три навыка идут от форм; один из них можно заменить. Четвёртый — свой двусловный навык." action={<button onClick={() => setActiveKind("skill")}>Открыть навыки</button>} />
            <div className="skillsGrid">
              <div className="skillBox">
                <span>Навыки от выбранных форм</span>
                {standardSkillIds.map((id) => <SkillPill key={id} item={itemById(data, id)} muted={!build.skillIds.includes(id)} />)}
              </div>
              <div className="skillBox">
                <span>Итоговые три навыка форм</span>
                {selectedSkills.map((item) => <SkillPill key={item.id} item={item} />)}
                {selectedSkills.length === 0 && <small>Выберите формы или навыки.</small>}
              </div>
              <div className="skillBox">
                <span>Свой двусловный навык</span>
                <input value={build.customSkill} onChange={(event) => patchBuild({ customSkill: event.target.value })} placeholder="например: Чудаковатый картёжник" />
              </div>
            </div>
          </section>

          <textarea value={build.notes} onChange={(event) => patchBuild({ notes: event.target.value })} placeholder="Заметки к персонажу" />
          </>
          ) : heroSection === "saved" ? (
            <SavedHeroesWorkspace
              data={data}
              build={build}
              savedHeroes={savedHeroes}
              activeSavedHeroId={activeSavedHeroId}
              saveCurrentHero={saveCurrentHero}
              loadSavedHero={loadSavedHero}
              deleteSavedHero={deleteSavedHero}
            />
          ) : (
            <CharacterSheetWorkspace
              data={data}
              build={build}
              patchBuild={patchBuild}
              runtime={heroRuntime}
              patchRuntime={patchHeroRuntime}
              adjustToken={adjustHeroToken}
              resetRuntime={resetHeroRuntime}
            />
          )}
        </section>
        ) : activeMode === "reference" ? (
          <section className="referencePanel">
            <ReferenceDashboard
              data={data}
              activeSectionId={activeReferenceSection?.id}
              setActiveKind={setActiveKind}
              setActiveReferenceSectionId={setActiveReferenceSectionId}
            />
            <div ref={referenceReaderRef}>
              <ReferenceReader section={activeReferenceSection} />
            </div>
            <QuickReferencePanel />
          </section>
        ) : activeMode === "workshop" ? (
          <EnemyWorkspace
            data={data}
            workshopSection={workshopSection}
            setWorkshopSection={setWorkshopSection}
            enemy={enemyBuild}
            patchEnemy={patchEnemy}
            adjustEnemyToken={adjustEnemyToken}
            resetEnemyCombat={resetEnemyCombat}
            resolved={currentEnemyResolved}
            roster={enemyRosterResolved}
            scene={sceneState}
            patchScene={patchSceneState}
            applySceneScale={applySceneScale}
            battleParameterSection={battleParameterSection}
            clearSceneRoster={clearSceneRoster}
            presets={encounterPresets}
            savedHeroes={savedHeroes}
            activeSavedHeroId={activeSavedHeroId}
            currentHero={build}
            saveEncounterPreset={saveEncounterPreset}
            saveCurrentHero={saveCurrentHero}
            loadEncounterPreset={loadEncounterPreset}
            deleteEncounterPreset={deleteEncounterPreset}
            openSavedHeroBuilder={openSavedHeroBuilder}
            openSavedHeroSheet={openSavedHeroSheet}
            addEnemyToRoster={addEnemyToRoster}
            startNewEnemy={startNewEnemy}
            loadRosterEnemy={loadRosterEnemy}
            loadEnemyFromRoster={loadEnemyFromRoster}
            removeEnemyFromRoster={removeEnemyFromRoster}
            copyEnemyText={copyEnemyText}
            exportEnemyJson={exportEnemyJson}
            exportEncounterJson={exportEncounterJson}
            advancementSection={enemyAdvancementSection}
            villainSection={villainSection}
            superMoveSection={superMoveSection}
            // В мастерской кнопки «Открыть …» должны переносить в Справочник к нужному
            // разделу, а не молча менять скрытое состояние.
            setActiveReferenceSectionId={(id) => {
              setActiveReferenceSectionId(id);
              setActiveMode("reference");
            }}
            parties={parties}
            activePartyId={activePartyId}
            setActivePartyId={setActivePartyId}
            createParty={createParty}
            patchParty={patchParty}
            deleteParty={deleteParty}
            toggleHeroInParty={toggleHeroInParty}
            exportPartyJson={exportPartyJson}
            discordReady={discordReady}
            sendEnemyToDiscord={sendEnemyToDiscord}
            sendSceneToDiscord={sendSceneToDiscord}
            sendPartyToDiscord={sendPartyToDiscord}
          />
        ) : (
          <ImportExportWorkspace
            data={data}
            build={build}
            importPortableFiles={importPortableFiles}
            exportEnemyJson={exportEnemyJson}
            exportEncounterJson={exportEncounterJson}
            exportHeroCardPng={exportHeroCardPng}
            exportEnemyCardPng={exportEnemyCardPng}
            exportEncounterCardPng={exportEncounterCardPng}
            enemyRosterCount={enemyRoster.length}
            mediaAssets={mediaAssets}
            removeMediaAsset={removeMediaAsset}
            discordSettings={discordSettings}
            patchDiscordSettings={patchDiscordSettings}
            sendDiscordTest={sendDiscordTest}
            sendHeroToDiscord={sendHeroToDiscord}
            discordReady={discordReady}
            cloudConfig={cloudConfig}
            setCloudConfig={setCloudConfig}
            cloudUserEmail={cloudUserEmail}
            setCloudUserEmail={setCloudUserEmail}
            pushToCloud={pushToCloud}
            pullFromCloud={pullFromCloud}
            cloudBusy={cloudBusy}
            notify={setImportMessage}
          />
        )}

        {activeMode === "home" ? null : activeMode === "heroes" ? (
        <aside className="previewPanel">
          <div className="sheetPreview" id="character-sheet-preview">
            <div className="sheetTitle">
              <Sparkles size={22} />
              <div>
                <h2>{buildTitle(data, build)}</h2>
                <p>{itemById(data, build.statId)?.nameRu ?? "Стать не выбрана"} · {build.customSkill || "свой навык не задан"}</p>
              </div>
            </div>
            {chosenArchetypes.map((item) => (
              <div key={item.id} className="sheetAbility">
                <strong>{creationPathLabels[build.creationPath]} {item.nameRu}</strong>
                <p>{archetypeAbility(item, build.creationPath) || "Способность не найдена в данных."}</p>
              </div>
            ))}
            {build.stances.map((stance, index) => (
              <div className="sheetStance" key={stance.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{stance.name}</strong>
                  <p>
                    {itemById(data, stance.formId)?.nameRu ?? "Форма"} + {itemById(data, stance.styleId)?.nameRu ?? "Стиль"}
                    {itemById(data, stance.formId)?.actionDice ? ` · ${itemById(data, stance.formId)?.actionDice}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <RulesPanel item={inspectedItem} currentPath={build.creationPath} />

          <div className="validationBox">
            <h2>Проверка</h2>
            {issues.map((issue) => (
              <div key={`${issue.title}-${issue.detail}`} className={`issue ${issue.level}`}>
                {issue.level === "info" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <div>
                  <strong>{issue.title}</strong>
                  <span>{issue.detail}</span>
                </div>
              </div>
            ))}
          </div>

          <ExportPanel onExport={(kind) => runExport(kind, data, build)} />
        </aside>
        ) : activeMode === "reference" ? (
          <aside className="previewPanel referenceSide">
            <ReferenceStats data={data} activeSection={activeReferenceSection} />
          </aside>
        ) : activeMode === "workshop" ? (
          <aside className="previewPanel referenceSide">
            <EnemySide
              resolved={currentEnemyResolved}
              roster={enemyRosterResolved}
            scene={sceneState}
            presetCount={encounterPresets.length}
            battleParameterSection={battleParameterSection}
          />
          </aside>
        ) : (
          <aside className="previewPanel referenceSide">
            <ImportExportSide
              itemCount={data.items.length}
              referenceCount={data.referenceSections?.length ?? 0}
              enemyRosterCount={enemyRoster.length}
              mediaCount={mediaAssets.length}
            />
          </aside>
        )}
      </section>

      {/* Глобальный тост: действия в Мастерской и Справочнике тоже должны давать видимый отклик,
          а не писать в панель, которая отображается только в «Героях» и «Экспорте». */}
      {importMessage && (
        <div className="appToast" role="status" onClick={() => setImportMessage("")}>
          {importMessage}
        </div>
      )}
    </main>
  );
}

// Без границы ошибок любой рантайм-краш даёт молча белый экран.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Паника в Додзе: необработанная ошибка интерфейса.", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crashScreen">
        <h1>道 Что-то сломалось</h1>
        <p>Интерфейс упал с ошибкой. Сохранённые герои и сцены не пострадали — они лежат в хранилище браузера.</p>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => window.location.reload()}>Перезагрузить приложение</button>
      </div>
    );
  }
}

const rootElement = document.getElementById("root") as HTMLElement & { _dojoRoot?: ReturnType<typeof createRoot> };
const root = rootElement._dojoRoot ?? createRoot(rootElement);
rootElement._dojoRoot = root;

function AttributionFooter() {
  return (
    <footer
      style={{
        padding: "10px 12px",
        textAlign: "center",
        fontSize: 11,
        lineHeight: 1.5,
        opacity: 0.5,
      }}
    >
      Неофициальный перевод и инструменты по игре{" "}
      <a href="https://liberigothica.itch.io/panic-at-the-dojo" target="_blank" rel="noopener noreferrer">
        Panic at the Dojo
      </a>{" "}
      (© Vel Mini / Liberi Gothica Games), контент под{" "}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
        CC&nbsp;BY-SA&nbsp;4.0
      </a>
      . Перевод/адаптация распространяются под той же лицензией. Иллюстрации принадлежат их авторам. Иконки интерфейса —{" "}
      <a href="https://lucide.dev/" target="_blank" rel="noopener noreferrer">
        Lucide
      </a>{" "}
      (
      <a href="https://lucide.dev/license" target="_blank" rel="noopener noreferrer">
        ISC
      </a>
      ).
    </footer>
  );
}

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <AttributionFooter />
    </ErrorBoundary>
  </React.StrictMode>,
);

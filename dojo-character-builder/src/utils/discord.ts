import type { BuilderData, CharacterBuild, ReferenceSection } from "../types";
import type { EnemyResolved, Party, SavedHero, SceneState } from "../appTypes";
import { archetypeAbility, archetypesForBuild, buildTitle, creationPathLabels, itemById } from "./build";
import { scaleById } from "./enemy";
import { sceneParameterSummary } from "./scene";

// Вебхуки Discord принимают POST прямо из браузера (CORS у них открыт),
// поэтому бэкенд для отправки сообщений в канал не нужен.
export interface DiscordSettings {
  webhookUrl: string;
  username: string;
}

export const emptyDiscordSettings: DiscordSettings = {
  webhookUrl: "",
  username: "Паника в Додзе",
};

export function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/.test(url.trim());
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  footer?: { text: string };
}

// Лимиты Discord: название поля 256, значение 1024, описание 4096, всего 6000 символов.
function clip(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function field(name: string, value: string, inline = false): DiscordEmbedField {
  return { name: clip(name, 256), value: clip(value || "—", 1024), inline };
}

const embedColors = {
  hero: 0x7b42b6,
  enemy: 0xc53d2f,
  scene: 0x1f7a4c,
  party: 0x2b6cb0,
};

export function heroEmbed(data: BuilderData, build: CharacterBuild): DiscordEmbed {
  const archetypes = archetypesForBuild(data, build);
  const stat = itemById(data, build.statId);
  const skills = build.skillIds.map((id) => itemById(data, id)?.nameRu).filter(Boolean) as string[];
  if (build.customSkill.trim()) skills.push(`${build.customSkill.trim()} (свой)`);
  return {
    title: clip(build.characterName.trim() || "Безымянный герой", 256),
    description: clip(`${buildTitle(data, build)} · ${stat?.nameRu ?? "стать не выбрана"}`, 4096),
    color: embedColors.hero,
    fields: [
      ...archetypes.map((item) =>
        field(`${creationPathLabels[build.creationPath]} ${item.nameRu}`, archetypeAbility(item, build.creationPath) || item.rules.summary),
      ),
      ...build.stances.map((stance, index) => {
        const form = itemById(data, stance.formId);
        const style = itemById(data, stance.styleId);
        return field(
          `Стойка ${index + 1}: ${stance.name}`,
          `${form?.nameRu ?? "форма не выбрана"} + ${style?.nameRu ?? "стиль не выбран"}${form?.actionDice ? ` · ${form.actionDice}` : ""}`,
          true,
        );
      }),
      field("Навыки", skills.join(" · ")),
    ],
    footer: { text: build.playerName.trim() ? `Игрок: ${build.playerName.trim()}` : "Паника в Додзе — цифровой компаньон" },
  };
}

export function enemyEmbed(resolved: EnemyResolved): DiscordEmbed {
  const build = resolved.build;
  const scale = scaleById(build.scaleId ?? "feather");
  return {
    title: clip(`${build.count > 1 ? `${build.count} × ` : ""}${build.name || "Враг"}`, 256),
    description: clip(`${resolved.kindLabel} ${build.level}-го уровня · ${resolved.villain?.title ?? "без архетипа"}`, 4096),
    color: embedColors.enemy,
    fields: [
      field("Кость", resolved.dice === "-" ? "нет" : resolved.dice, true),
      field("HP", `${build.hpCurrent}/${build.hpMax}`, true),
      field("Щит", String(build.shield), true),
      field("Масштаб", `${scale.label} · лечение ${scale.heal} · щит ${scale.shieldCap}`, true),
      field("Преимущество", resolved.benefit),
      field("Супер-приём", resolved.superMove?.title ?? resolved.villainMove?.title ?? "не выбран"),
      ...(build.notes.trim() ? [field("Заметки", build.notes)] : []),
    ],
    footer: { text: "Паника в Додзе — мастерская" },
  };
}

export function sceneEmbed(scene: SceneState, roster: EnemyResolved[], battleParameterSection?: ReferenceSection): DiscordEmbed {
  const scale = scaleById(scene.scaleId);
  const enemies = roster.map((item) => `${item.build.count} × ${item.build.name} (${item.kindLabel} ${item.build.level} ур.)`).join("\n");
  return {
    title: clip(scene.name || "Сцена", 256),
    description: clip(scene.location || "локация не указана", 4096),
    color: embedColors.scene,
    fields: [
      field("Цель", scene.objective),
      field("Ставки", scene.stakes, true),
      field("Причины драться", scene.reasons, true),
      field("Начальные условия", scene.setupConditions || "обычные условия"),
      field("Масштаб", `${scale.label} · ${scale.hp} HP · лечение ${scale.heal} · щит ${scale.shieldCap}`, true),
      field("Параметры боя", sceneParameterSummary(scene, battleParameterSection) || "Последний выживший", true),
      field("Враги", enemies || "пока нет"),
    ],
    footer: { text: "Паника в Додзе — сцена" },
  };
}

export function partyEmbed(data: BuilderData, party: Party, heroes: SavedHero[]): DiscordEmbed {
  const members = party.heroIds
    .map((id) => heroes.find((hero) => hero.id === id))
    .filter(Boolean) as SavedHero[];
  return {
    title: clip(`Пачка: ${party.name || "без названия"}`, 256),
    description: party.notes.trim() ? clip(party.notes, 4096) : undefined,
    color: embedColors.party,
    fields: members.length
      ? members.map((hero) =>
          field(
            `${hero.name}${hero.playerName ? ` (${hero.playerName})` : ""}`,
            `${buildTitle(data, hero.build)}\n${hero.build.stances
              .map((stance, index) => {
                const form = itemById(data, stance.formId);
                const style = itemById(data, stance.styleId);
                return `${index + 1}. ${form?.nameRu ?? "форма"} + ${style?.nameRu ?? "стиль"}`;
              })
              .join("\n")}`,
          ),
        )
      : [field("Состав", "в пачке пока никого")],
    footer: { text: `${members.length} героев · Паника в Додзе` },
  };
}

export async function sendDiscordEmbed(settings: DiscordSettings, embed: DiscordEmbed): Promise<void> {
  const url = settings.webhookUrl.trim();
  if (!isValidWebhookUrl(url)) {
    throw new Error("Ссылка вебхука не похожа на Discord-вебхук. Скопируйте её из настроек канала: Интеграции → Вебхуки.");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: settings.username.trim() || emptyDiscordSettings.username,
      embeds: [embed],
    }),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Discord ответил 404: вебхук удалён или ссылка неполная.");
    if (response.status === 429) throw new Error("Discord ограничил частоту отправки (429). Подождите немного и попробуйте снова.");
    throw new Error(`Discord ответил ошибкой ${response.status}.`);
  }
}

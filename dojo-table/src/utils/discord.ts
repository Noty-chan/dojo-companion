// Отправка событий стола (броски, итоги) в Discord-вебхук.
// Ссылка своя (у стола отдельный localStorage-домен), формат тот же, что в компаньоне.

export interface DiscordSettings {
  webhookUrl: string;
  username: string;
}

const storageKey = "dojo-table.discord.v1";

export const emptyDiscordSettings: DiscordSettings = {
  webhookUrl: "",
  username: "Стол «Паника в Додзе»",
};

export function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/.test(url.trim());
}

export function loadDiscordSettings(): DiscordSettings {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { ...emptyDiscordSettings };
    return { ...emptyDiscordSettings, ...JSON.parse(raw) };
  } catch {
    return { ...emptyDiscordSettings };
  }
}

export function saveDiscordSettings(settings: DiscordSettings) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Настройки останутся на сессию в памяти.
  }
}

export async function sendDiscordMessage(settings: DiscordSettings, content: string): Promise<void> {
  const url = settings.webhookUrl.trim();
  if (!isValidWebhookUrl(url)) throw new Error("Ссылка вебхука не похожа на Discord-вебхук.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: settings.username.trim() || emptyDiscordSettings.username, content: content.slice(0, 2000) }),
  });
  if (!response.ok) throw new Error(`Discord ответил ошибкой ${response.status}.`);
}

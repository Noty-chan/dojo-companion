import { useEffect, useState } from "react";
import { CloudUpload, CloudDownload, KeyRound, LogOut, Send, Webhook } from "lucide-react";
import type { DiscordSettings } from "../utils/discord";
import { isValidWebhookUrl } from "../utils/discord";
import type { CloudConfig } from "../utils/cloud";
import { currentUser, signIn, signOut, signUp } from "../utils/cloud";

// Панель Discord: ГМ один раз вставляет ссылку вебхука канала, дальше карточки
// героев/врагов/сцен уходят в канал одной кнопкой из соответствующих разделов.
export function DiscordPanel({
  settings,
  patchSettings,
  sendTest,
}: {
  settings: DiscordSettings;
  patchSettings: (patch: Partial<DiscordSettings>) => void;
  sendTest: () => void;
}) {
  const urlFilled = settings.webhookUrl.trim().length > 0;
  const urlValid = isValidWebhookUrl(settings.webhookUrl);
  return (
    <section className="onlinePanel">
      <div className="enemySectionTitle">
        <h3><Webhook size={17} /> Discord-вебхук</h3>
        <span>{urlValid ? "подключён" : "не настроен"}</span>
      </div>
      <p className="onlineHint">
        В Discord: настройки канала → Интеграции → Вебхуки → «Создать вебхук» → «Копировать URL». Вставьте ссылку сюда —
        и кнопки «В Discord» начнут отправлять карточки прямо в канал. Ссылка хранится только в этом браузере.
      </p>
      <div className="onlineFieldRow">
        <label>
          Ссылка вебхука
          <input
            type="password"
            value={settings.webhookUrl}
            onChange={(event) => patchSettings({ webhookUrl: event.target.value })}
            placeholder="https://discord.com/api/webhooks/…"
          />
        </label>
        <label>
          Имя отправителя
          <input value={settings.username} onChange={(event) => patchSettings({ username: event.target.value })} placeholder="Паника в Додзе" />
        </label>
      </div>
      {urlFilled && !urlValid && <p className="onlineWarning">Ссылка не похожа на Discord-вебхук — проверьте, что скопировали её целиком.</p>}
      <div className="onlineActions">
        <button disabled={!urlValid} onClick={sendTest}><Send size={15} />Тестовое сообщение</button>
      </div>
    </section>
  );
}

// Панель аккаунта: вход/регистрация в Supabase-проекте владельца и ручной push/pull
// всего прогресса. Конфиг проекта вводится один раз и живёт в localStorage.
export function CloudPanel({
  config,
  setConfig,
  userEmail,
  setUserEmail,
  pushToCloud,
  pullFromCloud,
  busy,
  notify,
}: {
  config?: CloudConfig;
  setConfig: (config?: CloudConfig) => void;
  userEmail?: string;
  setUserEmail: (email?: string) => void;
  pushToCloud: () => Promise<void>;
  pullFromCloud: () => Promise<void>;
  busy: boolean;
  notify: (message: string) => void;
}) {
  const [urlDraft, setUrlDraft] = useState(config?.url ?? "");
  const [keyDraft, setKeyDraft] = useState(config?.anonKey ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // При старте восстанавливаем сессию из сохранённого конфига.
  useEffect(() => {
    if (!config) return;
    let ignore = false;
    currentUser(config)
      .then((user) => {
        if (!ignore) setUserEmail(user?.email ?? undefined);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [config, setUserEmail]);

  async function handleAuth(mode: "in" | "up") {
    if (!config) return;
    setAuthBusy(true);
    try {
      if (mode === "in") {
        const user = await signIn(config, email.trim(), password);
        setUserEmail(user.email ?? undefined);
        notify(`Вы вошли как ${user.email}.`);
      } else {
        const user = await signUp(config, email.trim(), password);
        if (user?.email && !user.confirmed_at) {
          notify("Аккаунт создан. Если вход не сработал сразу — подтвердите почту по письму от Supabase.");
        }
        const active = await currentUser(config);
        setUserEmail(active?.email ?? undefined);
        if (active?.email) notify(`Аккаунт создан, вы вошли как ${active.email}.`);
      }
      setPassword("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось выполнить вход.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (!config) return;
    try {
      await signOut(config);
    } finally {
      setUserEmail(undefined);
      notify("Вы вышли из аккаунта. Локальные данные остались на месте.");
    }
  }

  return (
    <section className="onlinePanel">
      <div className="enemySectionTitle">
        <h3><KeyRound size={17} /> Аккаунт и облако</h3>
        <span>{userEmail ? userEmail : config ? "не в сети" : "не настроено"}</span>
      </div>

      {!config ? (
        <>
          <p className="onlineHint">
            Аккаунты работают через собственный бесплатный проект Supabase (инструкция — в файле
            «docs/хостинг_и_аккаунты.md» рядом с приложением). Создайте проект, выполните там schema.sql и вставьте
            сюда URL проекта и anon-ключ.
          </p>
          <div className="onlineFieldRow">
            <label>
              URL проекта
              <input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://xxxx.supabase.co" />
            </label>
            <label>
              Anon-ключ
              <input type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="eyJhbGciOi…" />
            </label>
          </div>
          <div className="onlineActions">
            <button
              disabled={!urlDraft.trim().startsWith("https://") || keyDraft.trim().length < 20}
              onClick={() => {
                setConfig({ url: urlDraft.trim().replace(/\/$/, ""), anonKey: keyDraft.trim() });
                notify("Проект подключён. Теперь войдите или зарегистрируйтесь.");
              }}
            >
              Подключить проект
            </button>
          </div>
        </>
      ) : !userEmail ? (
        <>
          <p className="onlineHint">
            Аккаунт нужен только чтобы переносить героев и сцены между устройствами. Без него всё
            работает локально — регистрироваться не обязательно.
          </p>
          <div className="onlineFieldRow">
            <label>
              Почта
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              Пароль
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="минимум 6 символов" />
            </label>
          </div>
          <div className="onlineActions">
            <button disabled={authBusy || !email.trim() || password.length < 6} onClick={() => handleAuth("in")}>Войти</button>
            <button disabled={authBusy || !email.trim() || password.length < 6} onClick={() => handleAuth("up")}>Зарегистрироваться</button>
          </div>
          <button
            className="advancedLink"
            onClick={() => {
              if (window.confirm("Переключиться на свой проект Supabase? Это нужно только если вы разворачиваете собственный сервер.")) {
                setConfig(undefined);
                notify("Проект отвязан — введите данные своего проекта Supabase.");
              }
            }}
          >
            Использовать свой проект Supabase
          </button>
        </>
      ) : (
        <>
          <p className="onlineHint">
            Кнопки ниже переносят весь прогресс целиком: сохранённые герои, пачки, сцены, пресеты и текущий билд.
            «В облако» перезаписывает облачную копию, «Из облака» — локальную.
          </p>
          <div className="onlineActions">
            <button disabled={busy} onClick={() => void pushToCloud()}><CloudUpload size={15} />В облако</button>
            <button disabled={busy} onClick={() => void pullFromCloud()}><CloudDownload size={15} />Из облака</button>
            <button className="ghostButton" onClick={() => void handleSignOut()}><LogOut size={15} />Выйти</button>
          </div>
        </>
      )}
    </section>
  );
}

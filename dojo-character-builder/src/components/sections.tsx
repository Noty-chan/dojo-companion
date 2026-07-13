import { BookOpen, Clipboard, Download, FileImage, FileJson, Grid3x3, HeartPulse, ImageDown, ImagePlus, Layers3, Minus, PackageOpen, Plus, RotateCcw, Send, Shield, Swords, Trash2, Upload, UserRound, Wrench, X } from "lucide-react";
import type { BuilderData, CharacterBuild, MediaAsset } from "../types";
import type { AppMode, HeroRuntime, SavedHero } from "../appTypes";
import { archetypeAbility, archetypesForBuild, buildTitle, creationPathLabels, itemById } from "../utils/build";
import { enemyTokenTypes } from "../utils/enemy";
import { runExport } from "../utils/exporters";
import type { DiscordSettings } from "../utils/discord";
import type { CloudConfig } from "../utils/cloud";
import { ActionPreview, EmptyHint, NumberField } from "./shared";
import { CloudPanel, DiscordPanel } from "./online";

// Адрес стола: на Pages — подпапка ./table/, в dev-режиме — соседний порт 5178.
function tableUrl(): string {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" ? "http://127.0.0.1:5178/" : "./table/";
}

export function HomeDashboard({
  data,
  dataReady,
  build,
  savedHeroesCount,
  enemyRosterCount,
  setMode,
  setActiveReferenceSectionId,
}: {
  data: BuilderData;
  dataReady: boolean;
  build: CharacterBuild;
  savedHeroesCount: number;
  enemyRosterCount: number;
  setMode: (mode: AppMode) => void;
  setActiveReferenceSectionId: (id: string) => void;
}) {
  const referenceCount = data.referenceSections?.length ?? 0;
  const selectedStances = build.stances.filter((stance) => stance.formId || stance.styleId).length;
  const heroTitle = build.characterName.trim() || "Новый герой";
  const modules = [
    {
      id: "heroes" as AppMode,
      icon: <UserRound size={24} />,
      title: "Герои",
      text: "билдер / лист / сохранения",
      meta: `${selectedStances}/3 стоек · ${savedHeroesCount} сохранено`,
    },
    {
      id: "reference" as AppMode,
      icon: <BookOpen size={24} />,
      title: "Справочник",
      text: "таблицы / правила / поиск",
      meta: `${referenceCount} разделов`,
    },
    {
      id: "workshop" as AppMode,
      icon: <Wrench size={24} />,
      title: "Мастерская",
      text: "враги / сцены / заметки",
      meta: `${enemyRosterCount} записей сцены`,
    },
    {
      id: "io" as AppMode,
      icon: <Upload size={24} />,
      title: "Экспорт / импорт",
      text: "JSON / PNG / пакеты",
      meta: "переносимые данные",
    },
  ];
  const quickReferences = [
    { label: "Супер-приёмы", section: "super-moves" },
    { label: "Рост врагов", section: "enemy-advancement" },
    { label: "Параметры боя", section: "battle-parameters" },
    { label: "Архетипы злодеев", section: "villain-archetypes" },
  ];

  return (
    <section className="homeDashboard">
      <div className="homeConsole">
        <div className="homeConsoleHead">
          <div>
            <h2>Паника в Додзе</h2>
            <p>COMPANION UNIT // русская рабочая сборка</p>
            {!dataReady && <p className="dataLoadingHint">Загружаются полные данные книги…</p>}
          </div>
          <span>v{__APP_VERSION__}</span>
        </div>

        <div className="homeConsoleGrid">
          <div className="homeLaunchList">
            {modules.map((module) => (
              <button key={module.id} className={`homeLaunchRow ${module.id}`} onClick={() => setMode(module.id)}>
                <span className="homeLaunchIcon">{module.icon}</span>
                <strong>{module.title}</strong>
                <em>{module.text}</em>
                <small>{module.meta}</small>
              </button>
            ))}
            {/* Стол — отдельное приложение: на Pages живёт в ./table/, картотека
                (герои, пачки, сцена) видна ему напрямую через общий localStorage. */}
            <a className="homeLaunchRow table" href={tableUrl()} target="_blank" rel="noreferrer">
              <span className="homeLaunchIcon"><Grid3x3 size={24} /></span>
              <strong>Стол (VTT)</strong>
              <em>поле / фишки / комнаты</em>
              <small>герои и сцена уже там</small>
            </a>
          </div>

          <aside className="homeSysPanel">
            <div className="homeSysHeader">
              <span>DOJO/SYS // STATUS</span>
              <button onClick={() => setMode("io")}>Экспорт</button>
            </div>
            <div className="homeSysHero">
              <span>Текущий герой</span>
              <strong>{heroTitle}</strong>
              <p>{build.creationPath ? creationPathLabels[build.creationPath] : "подход не выбран"} · {selectedStances}/3 стоек</p>
            </div>
            <div className="homeStatusRows">
              <span><strong>{data.items.length}</strong>элементов</span>
              <span><strong>{referenceCount}</strong>разделов</span>
              <span><strong>{enemyRosterCount}</strong>сцена</span>
            </div>
            <div className="homeReferenceList">
              {quickReferences.map((item) => (
                <button
                  key={item.section}
                  onClick={() => {
                    setActiveReferenceSectionId(item.section);
                    setMode("reference");
                  }}
                >
                  <BookOpen size={15} />
                  {item.label}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export function SavedHeroesWorkspace({
  data,
  build,
  savedHeroes,
  activeSavedHeroId,
  saveCurrentHero,
  loadSavedHero,
  deleteSavedHero,
}: {
  data: BuilderData;
  build: CharacterBuild;
  savedHeroes: SavedHero[];
  activeSavedHeroId?: string;
  saveCurrentHero: () => void;
  loadSavedHero: (hero: SavedHero) => void;
  deleteSavedHero: (id: string) => void;
}) {
  return (
    <section className="heroStorage">
      <div className="heroStorageHead">
        <div>
          <span>Локальная картотека</span>
          <h2>Сохраненные герои</h2>
          <p>Пока это быстрые локальные слоты в браузере. Их можно загрузить обратно в билдер и экспортировать уже привычными форматами.</p>
        </div>
        <button className="primaryButton" onClick={saveCurrentHero}>
          <Download size={17} />
          Сохранить текущего
        </button>
      </div>

      <div className="savedHeroCurrent">
        <strong>{build.characterName.trim() || "Безымянный герой"}</strong>
        <span>{buildTitle(data, build)}</span>
        <small>{build.playerName.trim() || "игрок не указан"}</small>
      </div>

      {savedHeroes.length === 0 ? (
        <EmptyHint text="Сохраненных героев пока нет. Соберите героя и нажмите «Сохранить текущего»." />
      ) : (
        <div className="savedHeroList">
          {savedHeroes.map((hero) => (
            <article key={hero.id} className={activeSavedHeroId === hero.id ? "active" : ""}>
              <button onClick={() => loadSavedHero(hero)}>
                <strong>{hero.name}</strong>
                <span>{buildTitle(data, hero.build)}</span>
                <small>
                  {hero.playerName || "без игрока"} · {new Date(hero.updatedAt).toLocaleString()}
                </small>
              </button>
              <button className="dangerIcon" title="Удалить сохранение" onClick={() => deleteSavedHero(hero.id)}>
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// Портрет героя: ужимаем в квадрат 192px (dataURL) — он едет в JSON-экспорт
// и на столе становится картинкой фишки.
async function preparePortrait(file: File): Promise<string> {
  const SIDE = 192;
  const bitmap = await createImageBitmap(file);
  const crop = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен.");
  ctx.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, SIDE, SIDE);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.84);
}

export function CharacterSheetWorkspace({
  data,
  build,
  runtime,
  patchBuild,
  patchRuntime,
  adjustToken,
  resetRuntime,
}: {
  data: BuilderData;
  build: CharacterBuild;
  runtime: HeroRuntime;
  patchBuild: (patch: Partial<CharacterBuild>) => void;
  patchRuntime: (patch: Partial<HeroRuntime>) => void;
  adjustToken: (tokenId: string, delta: number) => void;
  resetRuntime: () => void;
}) {
  const archetypes = archetypesForBuild(data, build);
  const stat = itemById(data, build.statId);
  const tokenSummary = enemyTokenTypes.filter((token) => (runtime.tokens?.[token.id] ?? 0) > 0);
  const skills = build.skillIds.map((id) => itemById(data, id)).filter(Boolean) as NonNullable<ReturnType<typeof itemById>>[];
  const skillLine = [...skills.map((skill) => skill.nameRu), build.customSkill.trim() ? `${build.customSkill.trim()} (свой)` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="playSheetPanel">
      <div className="playSheetHero">
        <div className="portraitBox">
          {build.portrait ? (
            <>
              <img src={build.portrait} alt="Портрет героя" className="portraitPreview" />
              <button className="portraitClear" title="Убрать портрет" onClick={() => patchBuild({ portrait: undefined })}><X size={12} /></button>
            </>
          ) : (
            <label className="portraitUpload" title="Портрет героя: уедет в JSON-экспорт и станет картинкой фишки на столе">
              <ImagePlus size={18} />
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void preparePortrait(file).then((portrait) => patchBuild({ portrait })).catch(() => undefined);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
        </div>
        <div>
          <span>Игровой лист</span>
          <h2>{build.characterName.trim() || "Безымянный герой"}</h2>
          <p>{buildTitle(data, build)} · {stat?.nameRu ?? "стать не выбрана"}</p>
        </div>
        <button onClick={resetRuntime}><RotateCcw size={15} />Сбросить трекеры</button>
      </div>

      <div className="playTrackerGrid">
        <label>
          <span><HeartPulse size={16} />HP</span>
          <div className="numberStepper">
            <button aria-label="Минус 1 HP" onClick={() => patchRuntime({ hpCurrent: runtime.hpCurrent - 1 })}><Minus size={14} /></button>
            <strong>{runtime.hpCurrent}/{runtime.hpMax}</strong>
            <button aria-label="Плюс 1 HP" onClick={() => patchRuntime({ hpCurrent: runtime.hpCurrent + 1 })}><Plus size={14} /></button>
          </div>
        </label>
        <label>
          Макс. HP
          <NumberField min={1} max={99} value={runtime.hpMax} onCommit={(value) => patchRuntime({ hpMax: value })} />
        </label>
        <label>
          Щит
          <div className="numberStepper">
            <button aria-label="Минус 1 щит" onClick={() => patchRuntime({ shield: runtime.shield - 1 })}><Minus size={14} /></button>
            <strong>{runtime.shield}</strong>
            <button aria-label="Плюс 1 щит" onClick={() => patchRuntime({ shield: runtime.shield + 1 })}><Plus size={14} /></button>
          </div>
        </label>
        <button className={`armorToggle ${runtime.armorSpent ? "spent" : ""}`} onClick={() => patchRuntime({ armorSpent: !runtime.armorSpent })}>
          <Shield size={16} />
          {runtime.armorSpent ? "Броня потрачена" : "Броня готова"}
        </button>
      </div>

      <div className="tokenGrid heroTokenGrid">
        {enemyTokenTypes.map((token) => (
          <div key={token.id} className="tokenCounter">
            <span>{token.label}</span>
            <div className="numberStepper">
              <button aria-label={`Минус жетон: ${token.label}`} onClick={() => adjustToken(token.id, -1)}><Minus size={13} /></button>
              <strong>{runtime.tokens?.[token.id] ?? 0}</strong>
              <button aria-label={`Плюс жетон: ${token.label}`} onClick={() => adjustToken(token.id, 1)}><Plus size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="playSheetColumns">
        <section>
          <h3>Стойки</h3>
          {build.stances.map((stance, index) => {
            const form = itemById(data, stance.formId);
            const style = itemById(data, stance.styleId);
            return (
              <article key={stance.id} className="playStance">
                <span>{index + 1}</span>
                <div>
                  <strong>{stance.name}</strong>
                  <p>{form?.nameRu ?? "форма не выбрана"} + {style?.nameRu ?? "стиль не выбран"}</p>
                  <small>{form?.actionDice ? `Кости: ${form.actionDice}` : "кости не выбраны"}</small>
                  {(form || style) && <ActionPreview form={form} style={style} />}
                </div>
              </article>
            );
          })}
        </section>
        <section>
          <h3>Способности</h3>
          {archetypes.map((item) => (
            <article key={item.id} className="playAbility">
              <strong>{item.nameRu}</strong>
              <p>{archetypeAbility(item, build.creationPath) || item.rules.summary}</p>
            </article>
          ))}
          {stat && (
            <article className="playAbility">
              <strong>{stat.nameRu}</strong>
              <p>{stat.rules.ability || stat.rules.summary}</p>
            </article>
          )}
          {skillLine && <p className="activeTokenLine">Навыки: {skillLine}</p>}
          {tokenSummary.length > 0 && (
            <p className="activeTokenLine">Активные жетоны: {tokenSummary.map((token) => `${token.label} ${runtime.tokens[token.id]}`).join(", ")}</p>
          )}
        </section>
      </div>

      <label className="playNotes">
        Заметки за столом
        <textarea value={runtime.notes} onChange={(event) => patchRuntime({ notes: event.target.value })} placeholder="Состояния, цели, временные эффекты, план на ход" />
      </label>
    </section>
  );
}

export function ImportExportWorkspace({
  data,
  build,
  importPortableFiles,
  exportEnemyJson,
  exportEncounterJson,
  exportHeroCardPng,
  exportEnemyCardPng,
  exportEncounterCardPng,
  enemyRosterCount,
  mediaAssets,
  removeMediaAsset,
  discordSettings,
  patchDiscordSettings,
  sendDiscordTest,
  sendHeroToDiscord,
  discordReady,
  cloudConfig,
  setCloudConfig,
  cloudUserEmail,
  setCloudUserEmail,
  pushToCloud,
  pullFromCloud,
  cloudBusy,
  notify,
}: {
  data: BuilderData;
  build: CharacterBuild;
  importPortableFiles: (files: FileList | File[]) => Promise<void>;
  exportEnemyJson: () => void;
  exportEncounterJson: () => void;
  exportHeroCardPng: () => Promise<void>;
  exportEnemyCardPng: () => Promise<void>;
  exportEncounterCardPng: () => Promise<void>;
  enemyRosterCount: number;
  mediaAssets: MediaAsset[];
  removeMediaAsset: (id: string) => void;
  discordSettings: DiscordSettings;
  patchDiscordSettings: (patch: Partial<DiscordSettings>) => void;
  sendDiscordTest: () => void;
  sendHeroToDiscord: () => void;
  discordReady: boolean;
  cloudConfig?: CloudConfig;
  setCloudConfig: (config?: CloudConfig) => void;
  cloudUserEmail?: string;
  setCloudUserEmail: (email?: string) => void;
  pushToCloud: () => Promise<void>;
  pullFromCloud: () => Promise<void>;
  cloudBusy: boolean;
  notify: (message: string) => void;
}) {
  return (
    <section className="ioPanel">
      <div className="ioHeader">
        <div>
          <span>Системный слой</span>
          <h2>Экспорт / импорт</h2>
          <p>Единое место для переносимых героев, врагов, сцен, картинок и будущих пакетов для стола.</p>
        </div>
      </div>

      <div className="onlineGrid">
        <DiscordPanel settings={discordSettings} patchSettings={patchDiscordSettings} sendTest={sendDiscordTest} />
        <CloudPanel
          config={cloudConfig}
          setConfig={setCloudConfig}
          userEmail={cloudUserEmail}
          setUserEmail={setCloudUserEmail}
          pushToCloud={pushToCloud}
          pullFromCloud={pullFromCloud}
          busy={cloudBusy}
          notify={notify}
        />
      </div>

      <div
        className="ioDropZone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length) importPortableFiles(event.dataTransfer.files);
        }}
      >
        <Upload size={28} />
        <div>
          <strong>Загрузить или перетащить</strong>
          <span>JSON героя/врага/сцены, PNG-карточки с зашитыми данными, обычные картинки для медиатеки.</span>
        </div>
        <label>
          Выбрать
          <input
            type="file"
            multiple
            accept="application/json,.json,image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const files = event.target.files;
              if (!files?.length) return;
              importPortableFiles(files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>


      <div className="ioGrid">
        <article>
          <FileJson size={22} />
          <strong>Герой JSON</strong>
          <p>Переносимый билд текущего героя с расшифрованными стойками и выбранными элементами.</p>
          <button onClick={() => runExport("character-json", data, build)}>Скачать JSON</button>
        </article>
        <article>
          <Send size={22} />
          <strong>Герой → Discord</strong>
          <p>{discordReady ? "Карточка текущего героя уйдёт в канал через вебхук." : "Сначала вставьте ссылку вебхука в панели Discord выше."}</p>
          <button onClick={sendHeroToDiscord} disabled={!discordReady}>Отправить героя</button>
        </article>
        <article>
          <ImageDown size={22} />
          <strong>Герой PNG-лист</strong>
          <p>Большая картинка листа героя для чата, печати или быстрой передачи игроку.</p>
          <button onClick={() => runExport("sheet-png", data, build)}>Скачать PNG</button>
        </article>
        <article>
          <FileImage size={22} />
          <strong>Герой PNG-карточка</strong>
          <p>Короткая карточка героя с зашитыми данными: при загрузке она восстановит билд.</p>
          <button onClick={exportHeroCardPng}>Скачать карточку</button>
        </article>
        <article>
          <PackageOpen size={22} />
          <strong>Печатный лист</strong>
          <p>HTML-лист героя, который можно открыть на телефоне или распечатать.</p>
          <button onClick={() => runExport("print-html", data, build)}>Скачать HTML</button>
        </article>
        <article>
          <Swords size={22} />
          <strong>Текущий враг</strong>
          <p>JSON текущего врага из Мастерской, включая боевой трекер и выбранный архетип.</p>
          <button onClick={exportEnemyJson}>Скачать врага</button>
        </article>
        <article>
          <FileImage size={22} />
          <strong>Враг PNG-карточка</strong>
          <p>Картинка врага с зашитым билдом, которую можно загрузить обратно.</p>
          <button onClick={exportEnemyCardPng}>Скачать карточку</button>
        </article>
        <article>
          <Clipboard size={22} />
          <strong>Сцена</strong>
          <p>{enemyRosterCount > 0 ? `В сцене ${enemyRosterCount} записей.` : "Сцена пока без врагов; цели и заметки всё равно попадут в файл."}</p>
          <button onClick={exportEncounterJson}>Скачать сцену</button>
        </article>
        <article>
          <FileImage size={22} />
          <strong>Сцена PNG-карточка</strong>
          <p>Картинка сцены с целью, ставками, заметками и составом врагов.</p>
          <button onClick={exportEncounterCardPng}>Скачать карточку</button>
        </article>
        <article>
          <Layers3 size={22} />
          <strong>TTS / будущий стол</strong>
          <p>Пакеты для Tabletop Simulator и будущего отдельного интерактивного стола будут опираться на эти же данные.</p>
          <button onClick={() => runExport("tts-object", data, build)}>TTS героя</button>
        </article>
      </div>

      <section className="mediaLibrary">
        <div className="enemySectionTitle">
          <h3>Медиатека</h3>
          <span>{mediaAssets.length} файлов</span>
        </div>
        {mediaAssets.length === 0 ? (
          <EmptyHint text="Перетащите сюда портрет, карту или ассет из папки. Обычные изображения сохраняются в медиатеку." />
        ) : (
          <div className="mediaGrid">
            {mediaAssets.map((asset) => (
              <article key={asset.id}>
                <img src={asset.dataUrl} alt={asset.name} />
                <div>
                  <strong>{asset.name}</strong>
                  <span>{asset.type || "image"} · {new Date(asset.addedAt).toLocaleString()}</span>
                </div>
                <button className="dangerIcon" onClick={() => removeMediaAsset(asset.id)} title="Убрать картинку">
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export function ImportExportSide({ itemCount, referenceCount, enemyRosterCount, mediaCount }: { itemCount: number; referenceCount: number; enemyRosterCount: number; mediaCount: number }) {
  return (
    <>
      <div className="referenceStatBox">
        <h2>Форматы</h2>
        <p>Герои, враги и сцены теперь переносятся JSON-файлами или PNG-карточками с зашитыми данными. Обычные изображения остаются в медиатеке.</p>
        <div className="statRows">
          <span><strong>{itemCount}</strong>элементов библиотеки</span>
          <span><strong>{referenceCount}</strong>разделов справочника</span>
          <span><strong>{enemyRosterCount}</strong>записей сцены</span>
          <span><strong>{mediaCount}</strong>картинок</span>
        </div>
      </div>
      <div className="referenceStatBox">
        <h2>Карточки</h2>
        <div className="purpleList">
          <span><strong>Герои</strong>PNG-карточка восстанавливает билд.</span>
          <span><strong>Враги</strong>PNG-карточка восстанавливает трекер и настройки.</span>
          <span><strong>Сцены</strong>PNG-карточка переносит цели, заметки и состав.</span>
        </div>
      </div>
    </>
  );
}

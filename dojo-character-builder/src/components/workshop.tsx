import { useMemo, useState } from "react";
import { Clipboard, Copy, Download, FileJson, HeartPulse, Library, Minus, Plus, RotateCcw, Search, Send, Shield, Trash2, UserRound, Users } from "lucide-react";
import type { BuilderData, EnemyRosterEntry, CharacterBuild, EnemyBuild, EnemyKind, EnemyScaleId, ReferenceSection } from "../types";
import type { EncounterPreset, EnemyResolved, Party, SavedHero, SceneState, WorkshopSection } from "../appTypes";
import { archetypesForBuild, buildTitle, itemById } from "../utils/build";
import { enemyScales, enemyTokenTypes, scaleById } from "../utils/enemy";
import { enemyKindLabels, enemyPlainText, flattenSuperMoves } from "../utils/enemyResolve";
import { referenceEntriesByGroup, sceneParameterSummary } from "../utils/scene";
import { EmptyHint, NumberField, SectionSwitch } from "./shared";

export function EnemyWorkspace({
  data,
  workshopSection,
  setWorkshopSection,
  enemy,
  patchEnemy,
  adjustEnemyToken,
  resetEnemyCombat,
  resolved,
  roster,
  scene,
  patchScene,
  applySceneScale,
  clearSceneRoster,
  presets,
  savedHeroes,
  activeSavedHeroId,
  currentHero,
  saveEncounterPreset,
  saveCurrentHero,
  loadEncounterPreset,
  deleteEncounterPreset,
  openSavedHeroBuilder,
  openSavedHeroSheet,
  addEnemyToRoster,
  startNewEnemy,
  loadRosterEnemy,
  loadEnemyFromRoster,
  removeEnemyFromRoster,
  copyEnemyText,
  exportEnemyJson,
  exportEncounterJson,
  advancementSection,
  battleParameterSection,
  villainSection,
  superMoveSection,
  setActiveReferenceSectionId,
  parties,
  activePartyId,
  setActivePartyId,
  createParty,
  patchParty,
  deleteParty,
  toggleHeroInParty,
  exportPartyJson,
  discordReady,
  sendEnemyToDiscord,
  sendSceneToDiscord,
  sendPartyToDiscord,
}: {
  data: BuilderData;
  workshopSection: WorkshopSection;
  setWorkshopSection: (section: WorkshopSection) => void;
  enemy: EnemyBuild;
  patchEnemy: (patch: Partial<EnemyBuild>) => void;
  adjustEnemyToken: (tokenId: string, delta: number) => void;
  resetEnemyCombat: () => void;
  resolved: EnemyResolved;
  roster: EnemyResolved[];
  scene: SceneState;
  patchScene: (patch: Partial<SceneState>) => void;
  applySceneScale: (scaleId: EnemyScaleId) => void;
  clearSceneRoster: () => void;
  presets: EncounterPreset[];
  savedHeroes: SavedHero[];
  activeSavedHeroId?: string;
  currentHero: CharacterBuild;
  saveEncounterPreset: () => void;
  saveCurrentHero: () => void;
  loadEncounterPreset: (preset: EncounterPreset) => void;
  deleteEncounterPreset: (id: string) => void;
  openSavedHeroBuilder: (hero: SavedHero) => void;
  openSavedHeroSheet: (hero: SavedHero) => void;
  addEnemyToRoster: () => void;
  startNewEnemy: () => void;
  loadRosterEnemy: (entry: NonNullable<BuilderData["enemyRoster"]>[number]) => void;
  loadEnemyFromRoster: (enemy: EnemyBuild) => void;
  removeEnemyFromRoster: (id: string) => void;
  copyEnemyText: () => void;
  exportEnemyJson: () => void;
  exportEncounterJson: () => void;
  advancementSection?: ReferenceSection;
  battleParameterSection?: ReferenceSection;
  villainSection?: ReferenceSection;
  superMoveSection?: ReferenceSection;
  setActiveReferenceSectionId: (id: string) => void;
  parties: Party[];
  activePartyId?: string;
  setActivePartyId: (id?: string) => void;
  createParty: () => void;
  patchParty: (id: string, patch: Partial<Party>) => void;
  deleteParty: (id: string) => void;
  toggleHeroInParty: (heroId: string) => void;
  exportPartyJson: (party: Party) => void;
  discordReady: boolean;
  sendEnemyToDiscord: () => void;
  sendSceneToDiscord: () => void;
  sendPartyToDiscord: (party: Party) => void;
}) {
  const superMoves = flattenSuperMoves(superMoveSection);
  const activeScale = scaleById(scene.scaleId);
  const applyScale = (scaleId: EnemyScaleId) => {
    applySceneScale(scaleId);
  };
  return (
    <section className="enemyPanel">
      <div className="enemyHeader">
        <div>
          <span>Мастерская Ведущего</span>
          <h2>{scene.name || "Сцена без названия"}</h2>
          <p>{scene.objective || "Соберите врагов, задайте цель сцены, набросайте план и сохраните пресет для будущей игры."}</p>
        </div>
        <button onClick={() => setActiveReferenceSectionId("enemy-advancement")}>Таблица роста врагов →</button>
      </div>

      <SectionSwitch
        label="Мастерская"
        value={workshopSection}
        options={[
          { id: "enemy", label: "Враг", meta: resolved.kindLabel },
          { id: "scene", label: "Сцена", meta: `${roster.length}` },
          { id: "heroes", label: "Герои", meta: `${savedHeroes.length}` },
          { id: "notes", label: "Заметки", meta: scene.plan.trim() ? "план" : "пусто" },
          { id: "presets", label: "Пресеты", meta: `${presets.length}` },
        ]}
        onChange={setWorkshopSection}
      />

      {workshopSection === "enemy" ? (
      <>
      <RosterPicker roster={data.enemyRoster ?? []} activeId={enemy.rosterId} onLoad={loadRosterEnemy} onNew={startNewEnemy} />

      <div className="enemyComposer">
        <div className="enemyFormGrid">
          <label>
            Имя врага
            <input value={enemy.name} onChange={(event) => patchEnemy({ name: event.target.value })} />
          </label>
          <label>
            Количество
            <NumberField min={1} max={99} value={enemy.count} onCommit={(value) => patchEnemy({ count: value })} />
          </label>
        </div>

        <div className="enemyControls">
          <div className="levelControl">
            <label>Уровень врагов</label>
            <input
              type="range"
              min="1"
              max="10"
              value={enemy.level}
              onChange={(event) => patchEnemy({ level: Number(event.target.value) })}
            />
            <div className="levelSteps">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <button key={value} className={enemy.level === value ? "active" : ""} onClick={() => patchEnemy({ level: value })}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="enemyKindTabs">
            {(Object.keys(enemyKindLabels) as EnemyKind[]).map((kind) => (
              <button key={kind} className={enemy.kind === kind ? "active" : ""} onClick={() => patchEnemy({ kind })}>
                {enemyKindLabels[kind]}
              </button>
            ))}
          </div>
        </div>

        <div className="enemySelectGrid">
          <label>
            Форма стойки
            <select value={enemy.formId ?? ""} onChange={(event) => patchEnemy({ formId: event.target.value || undefined })}>
              <option value="">Без формы</option>
              {data.items.filter((item) => item.kind === "form").map((item) => (
                <option key={item.id} value={item.id}>{item.nameRu}{item.actionDice ? ` · ${item.actionDice}` : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Стиль стойки
            <select value={enemy.styleId ?? ""} onChange={(event) => patchEnemy({ styleId: event.target.value || undefined })}>
              <option value="">Без стиля</option>
              {data.items.filter((item) => item.kind === "style").map((item) => (
                <option key={item.id} value={item.id}>{item.nameRu}{item.family ? ` (${item.family})` : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Архетип злодея
            <select value={enemy.villainId ?? ""} onChange={(event) => patchEnemy({ villainId: event.target.value || undefined })}>
              <option value="">Без архетипа</option>
              {(villainSection?.entries ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.title}</option>
              ))}
            </select>
          </label>
          <label>
            Супер-приём
            <select value={enemy.superMoveId ?? ""} onChange={(event) => patchEnemy({ superMoveId: event.target.value || undefined })}>
              <option value="">Авто / без отдельного</option>
              {superMoves.map((move) => (
                <option key={move.moveId} value={move.moveId}>{move.kind} — {move.title}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="enemyNotes">
          Заметки
          <textarea value={enemy.notes} onChange={(event) => patchEnemy({ notes: event.target.value })} placeholder="Тактика, характер, фишки сцены" />
        </label>
      </div>

      <section className="enemyCombat">
        <div className="enemySectionTitle">
          <h3>Боевой трекер</h3>
          <button onClick={resetEnemyCombat}><RotateCcw size={15} />Сбросить бой</button>
        </div>
        <div className="enemyVitals">
          <label className="scaleSelect">
            <span><HeartPulse size={15} />Масштаб сцены</span>
            <select value={activeScale.id} onChange={(event) => applyScale(event.target.value as EnemyScaleId)}>
              {enemyScales.map((scale) => (
                <option key={scale.id} value={scale.id}>
                  {scale.label}: {scale.hp} HP / лечение {scale.heal} / щит {scale.shieldCap}
                </option>
              ))}
            </select>
            <small>{activeScale.note}</small>
          </label>
          <label>
            <span><HeartPulse size={15} />HP</span>
            <div className="numberStepper">
              <button aria-label="Минус 1 HP врага" onClick={() => patchEnemy({ hpCurrent: enemy.hpCurrent - 1 })}><Minus size={14} /></button>
              <strong>{enemy.hpCurrent}/{enemy.hpMax}</strong>
              <button aria-label="Плюс 1 HP врага" onClick={() => patchEnemy({ hpCurrent: enemy.hpCurrent + 1 })}><Plus size={14} /></button>
            </div>
          </label>
          <label>
            Макс. HP
            <NumberField min={1} max={99} value={enemy.hpMax} onCommit={(value) => patchEnemy({ hpMax: value })} />
          </label>
          <label>
            Лечение
            <strong className="healValue">{activeScale.heal}</strong>
          </label>
          <label>
            Щит
            <div className="numberStepper">
              <button aria-label="Минус 1 щит врага" onClick={() => patchEnemy({ shield: enemy.shield - 1 })}><Minus size={14} /></button>
              <strong>{enemy.shield}</strong>
              <button aria-label="Плюс 1 щит врага" onClick={() => patchEnemy({ shield: enemy.shield + 1 })}><Plus size={14} /></button>
            </div>
          </label>
          <div className="armorControl">
            <span><Shield size={14} />Броня</span>
            <div className="armorStates">
              {([
                { id: "none", label: "нет" },
                { id: "ready", label: "готова" },
                { id: "spent", label: "потрачена" },
              ] as const).map((state) => (
                <button
                  key={state.id}
                  className={(enemy.armorState ?? "ready") === state.id ? "active" : ""}
                  onClick={() => patchEnemy({ armorState: state.id, armorSpent: state.id === "spent" })}
                >
                  {state.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="tokenGrid">
          {enemyTokenTypes.map((token) => (
            <div key={token.id} className="tokenCounter">
              <span>{token.label}</span>
              <div className="numberStepper">
                <button aria-label={`Минус жетон врага: ${token.label}`} onClick={() => adjustEnemyToken(token.id, -1)}><Minus size={13} /></button>
                <strong>{enemy.tokens?.[token.id] ?? 0}</strong>
                <button aria-label={`Плюс жетон врага: ${token.label}`} onClick={() => adjustEnemyToken(token.id, 1)}><Plus size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="enemySummaryGrid">
        <div className="enemySummaryCard primary">
          <span>{resolved.kindLabel}</span>
          <strong>{resolved.dice === "-" ? "без бонусной кости" : resolved.dice}</strong>
          <p>{resolved.hint}</p>
        </div>
        <div className="enemySummaryCard">
          <span>Кости босса</span>
          <strong>{resolved.bossDice}</strong>
          <p>Значение из таблицы роста врагов для боссов этого уровня.</p>
        </div>
        <div className="enemySummaryCard">
          <span>Кость воина</span>
          <strong>{resolved.warriorDie}</strong>
          <p>Значение из таблицы роста врагов для воинов этого уровня.</p>
        </div>
        <div className="enemySummaryCard">
          <span>Преимущество уровня</span>
          <strong>{resolved.benefit}</strong>
          <p>Проверьте, к каким типам врагов применяется преимущество.</p>
        </div>
      </div>

      <div className="enemySheetCard">
        <div className="enemySectionTitle">
          <h3>Готовый блок</h3>
          <div className="enemyActionButtons">
            <button onClick={startNewEnemy}><Plus size={15} />Новый</button>
            <button onClick={copyEnemyText}><Copy size={15} />Копировать</button>
            <button onClick={exportEnemyJson}><FileJson size={15} />JSON</button>
            <button onClick={sendEnemyToDiscord} disabled={!discordReady} title={discordReady ? "Отправить блок врага в Discord" : "Сначала настройте вебхук в разделе «Экспорт / импорт»"}>
              <Send size={15} />В Discord
            </button>
            <button onClick={addEnemyToRoster}>
              <Clipboard size={15} />
              {roster.some((item) => item.build.id === enemy.id) ? "Обновить в сцене" : "В сцену"}
            </button>
          </div>
        </div>
        <pre>{enemyPlainText(resolved)}</pre>
      </div>

      <section className="enemyVillains">
        <div className="enemySectionTitle">
          <h3>Архетипы злодеев</h3>
          <button onClick={() => setActiveReferenceSectionId("villain-archetypes")}>Открыть раздел</button>
        </div>
        <div className="enemyVillainGrid selectable">
          {(villainSection?.entries ?? []).map((entry) => (
            <button
              key={entry.id}
              className={entry.id === enemy.villainId ? "active" : ""}
              title={entry.id === enemy.villainId ? "Нажмите ещё раз, чтобы снять архетип" : "Выбрать архетип"}
              onClick={() => patchEnemy({ villainId: entry.id === enemy.villainId ? undefined : entry.id })}
            >
              <strong>{entry.title}</strong>
              <p>{entry.body[0] ?? "Способность архетипа злодея."}</p>
              {entry.moves?.[0] && <span>{entry.moves[0].kind}: {entry.moves[0].title}</span>}
            </button>
          ))}
        </div>
      </section>
      </>
      ) : workshopSection === "scene" ? (
        <SceneWorkspace
          scene={scene}
          patchScene={patchScene}
          applySceneScale={applySceneScale}
          battleParameterSection={battleParameterSection}
          roster={roster}
          loadEnemyFromRoster={loadEnemyFromRoster}
          removeEnemyFromRoster={removeEnemyFromRoster}
          clearSceneRoster={clearSceneRoster}
          exportEncounterJson={exportEncounterJson}
          saveEncounterPreset={saveEncounterPreset}
          discordReady={discordReady}
          sendSceneToDiscord={sendSceneToDiscord}
        />
      ) : workshopSection === "heroes" ? (
        <WorkshopHeroes
          data={data}
          savedHeroes={savedHeroes}
          activeSavedHeroId={activeSavedHeroId}
          currentHero={currentHero}
          saveCurrentHero={saveCurrentHero}
          openHeroBuilder={openSavedHeroBuilder}
          openHeroSheet={openSavedHeroSheet}
          parties={parties}
          activePartyId={activePartyId}
          setActivePartyId={setActivePartyId}
          createParty={createParty}
          patchParty={patchParty}
          deleteParty={deleteParty}
          toggleHeroInParty={toggleHeroInParty}
          exportPartyJson={exportPartyJson}
          discordReady={discordReady}
          sendPartyToDiscord={sendPartyToDiscord}
        />
      ) : workshopSection === "notes" ? (
        <WorkshopNotes scene={scene} patchScene={patchScene} />
      ) : (
        <EncounterPresets
          presets={presets}
          saveEncounterPreset={saveEncounterPreset}
          loadEncounterPreset={loadEncounterPreset}
          deleteEncounterPreset={deleteEncounterPreset}
        />
      )}

      {workshopSection === "enemy" && (
      <section className="enemyRoster">
        <div className="enemySectionTitle">
          <h3>Сцена</h3>
          <button onClick={exportEncounterJson} disabled={roster.length === 0}>Экспорт сцены</button>
        </div>
        {roster.length === 0 ? (
          <p className="emptyHint">Добавьте врагов в сцену, чтобы собрать состав боя.</p>
        ) : (
          <div className="enemyRosterList">
            {roster.map((item) => (
              <article key={item.build.id}>
                <button onClick={() => loadEnemyFromRoster(item.build)}>
                  <strong>{item.build.count} × {item.build.name}</strong>
                  <span>
                    {item.kindLabel} {item.build.level}-го уровня · {item.villain?.title ?? "без архетипа"} · {item.dice === "-" ? "без кости" : item.dice} · HP {item.build.hpCurrent}/{item.build.hpMax}
                  </span>
                </button>
                <button className="dangerIcon" title="Убрать из сцены" onClick={() => removeEnemyFromRoster(item.build.id)}>
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      )}
    </section>
  );
}

const rosterKindLabels: Record<EnemyKind, string> = { stooge: "статисты", warrior: "воин", boss: "босс" };

// Готовые враги из книги: свернутый список с поиском и группами архетипов.
// Загрузка кладёт форму/стиль/вид/имя и полный блок правил в заметки.
function RosterPicker({
  roster,
  activeId,
  onLoad,
  onNew,
}: {
  roster: EnemyRosterEntry[];
  activeId?: string;
  onLoad: (entry: EnemyRosterEntry) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((e) =>
      [e.name, e.group, e.stanceName, e.styleName, e.formName].filter(Boolean).some((v) => v.toLowerCase().includes(needle)),
    );
  }, [roster, query]);
  const groups = useMemo(() => {
    const map = new Map<string, EnemyRosterEntry[]>();
    for (const e of filtered) {
      const key = e.group || "Прочие";
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  if (roster.length === 0) return null;

  return (
    <section className="rosterPicker">
      <div className="enemySectionTitle">
        <h3><Library size={15} /> Готовые враги из книги</h3>
        <div className="enemyActionButtons">
          <button onClick={onNew}><Plus size={14} />Пустой</button>
          <button className={open ? "active" : ""} onClick={() => setOpen((v) => !v)}>{open ? "Свернуть" : `Выбрать (${roster.length})`}</button>
        </div>
      </div>
      {open && (
        <div className="rosterBody">
          <div className="searchBox rosterSearch">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: имя, архетип, стиль" autoFocus />
          </div>
          <div className="rosterGroups">
            {groups.map(([group, list]) => (
              <div key={group} className="rosterGroup">
                <h4>{group}</h4>
                <div className="rosterList">
                  {list.map((entry) => (
                    <button
                      key={entry.id}
                      className={entry.id === activeId ? "active" : ""}
                      onClick={() => { onLoad(entry); setOpen(false); }}
                    >
                      <strong>{entry.name}</strong>
                      <span>{rosterKindLabels[entry.kind]}{entry.count > 1 ? ` ×${entry.count}` : ""}{entry.dice ? ` · ${entry.dice}` : ""}</span>
                      {entry.stanceName && <small>{entry.styleName} · {entry.formName}</small>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 && <p className="emptyLine">Ничего не найдено.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function WorkshopHeroes({
  data,
  savedHeroes,
  activeSavedHeroId,
  currentHero,
  saveCurrentHero,
  openHeroBuilder,
  openHeroSheet,
  parties,
  activePartyId,
  setActivePartyId,
  createParty,
  patchParty,
  deleteParty,
  toggleHeroInParty,
  exportPartyJson,
  discordReady,
  sendPartyToDiscord,
}: {
  data: BuilderData;
  savedHeroes: SavedHero[];
  activeSavedHeroId?: string;
  currentHero: CharacterBuild;
  saveCurrentHero: () => void;
  openHeroBuilder: (hero: SavedHero) => void;
  openHeroSheet: (hero: SavedHero) => void;
  parties: Party[];
  activePartyId?: string;
  setActivePartyId: (id?: string) => void;
  createParty: () => void;
  patchParty: (id: string, patch: Partial<Party>) => void;
  deleteParty: (id: string) => void;
  toggleHeroInParty: (heroId: string) => void;
  exportPartyJson: (party: Party) => void;
  discordReady: boolean;
  sendPartyToDiscord: (party: Party) => void;
}) {
  const currentHeroName = currentHero.characterName.trim() || "Безымянный герой";
  const activeParty = parties.find((party) => party.id === activePartyId);
  return (
    <section className="workshopHeroes">
      <div className="workshopHeroHead">
        <div>
          <span>Герои игроков</span>
          <h3>Картотека для сцены</h3>
          <p>Быстрый просмотр сохранённых героев: кто за столом, какие стойки собраны и куда открыть лист для игры.</p>
        </div>
        <div className="workshopHeroHeadActions">
          <span>{savedHeroes.length} записей</span>
          <button onClick={saveCurrentHero}><Download size={15} />Сохранить {currentHeroName}</button>
        </div>
      </div>

      <section className="partyBox">
        <div className="enemySectionTitle">
          <h3><Users size={17} /> Пачки игроков</h3>
          <button onClick={createParty}><Plus size={15} />Новая пачка</button>
        </div>
        {parties.length === 0 ? (
          <p className="emptyHint">Пачка — это состав героев на игру. Создайте пачку и отмечайте героев кнопкой «В пачку» на карточках ниже.</p>
        ) : (
          <>
            <div className="partyChips">
              {parties.map((party) => (
                <button
                  key={party.id}
                  className={party.id === activePartyId ? "active" : ""}
                  onClick={() => setActivePartyId(party.id === activePartyId ? undefined : party.id)}
                >
                  {party.name || "Без названия"} · {party.heroIds.length}
                </button>
              ))}
            </div>
            {activeParty && (
              <div className="partyDetails">
                <div className="onlineFieldRow">
                  <label>
                    Название пачки
                    <input value={activeParty.name} onChange={(event) => patchParty(activeParty.id, { name: event.target.value })} />
                  </label>
                  <label>
                    Заметки
                    <input
                      value={activeParty.notes}
                      onChange={(event) => patchParty(activeParty.id, { notes: event.target.value })}
                      placeholder="кампания, расписание, договорённости"
                    />
                  </label>
                </div>
                <div className="partyMembers">
                  {activeParty.heroIds.length === 0 ? (
                    <span className="emptyLine">Состав пуст — добавьте героев кнопками на карточках.</span>
                  ) : (
                    activeParty.heroIds.map((heroId) => {
                      const hero = savedHeroes.find((record) => record.id === heroId);
                      return (
                        <span key={heroId} className={hero ? "" : "missing"}>
                          <strong>{hero?.name ?? "герой удалён"}</strong>
                          {hero ? <em>{hero.playerName || "без игрока"}</em> : <em>сохранение не найдено</em>}
                          <button title="Убрать из пачки" onClick={() => toggleHeroInParty(heroId)}><Trash2 size={13} /></button>
                        </span>
                      );
                    })
                  )}
                </div>
                <div className="onlineActions">
                  <button onClick={() => exportPartyJson(activeParty)}><FileJson size={15} />Экспорт пачки</button>
                  <button
                    onClick={() => sendPartyToDiscord(activeParty)}
                    disabled={!discordReady}
                    title={discordReady ? "Отправить состав в Discord" : "Сначала настройте вебхук в разделе «Экспорт / импорт»"}
                  >
                    <Send size={15} />В Discord
                  </button>
                  <button className="dangerIcon" title="Удалить пачку" onClick={() => deleteParty(activeParty.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {savedHeroes.length === 0 ? (
        <EmptyHint text="Сохранённых героев пока нет. Импортируйте PNG/JSON героя или сохраните текущего героя в разделе «Герои»." />
      ) : (
        <div className="workshopHeroGrid">
          {savedHeroes.map((hero) => {
            const archetypes = archetypesForBuild(data, hero.build).map((item) => item.nameRu);
            const stat = itemById(data, hero.build.statId);
            const stances = hero.build.stances.filter((stance) => stance.formId || stance.styleId);
            return (
              <article key={hero.id} className={activeSavedHeroId === hero.id ? "active" : ""}>
                <div className="workshopHeroTitle">
                  <div>
                    <strong>{hero.name}</strong>
                    <span>{hero.playerName || "игрок не указан"}</span>
                  </div>
                  <small>{new Date(hero.updatedAt).toLocaleDateString()}</small>
                </div>
                <div className="workshopHeroMeta">
                  <span>{buildTitle(data, hero.build)}</span>
                  <span>{stat?.nameRu ?? "стать не выбрана"}</span>
                  <span>{archetypes.length ? archetypes.join(", ") : "архетип не выбран"}</span>
                </div>
                <div className="workshopStanceList">
                  {stances.length === 0 ? (
                    <span className="emptyLine">Стойки ещё не собраны.</span>
                  ) : (
                    stances.map((stance, index) => {
                      const form = itemById(data, stance.formId);
                      const style = itemById(data, stance.styleId);
                      return (
                        <span key={stance.id}>
                          <strong>{index + 1}</strong>
                          <em>{stance.name || `${style?.nameRu ?? "стиль"} + ${form?.nameRu ?? "форма"}`}</em>
                          <small>{form?.actionDice ?? "кости не выбраны"}</small>
                        </span>
                      );
                    })
                  )}
                </div>
                <div className="workshopHeroActions">
                  <button onClick={() => openHeroSheet(hero)}><HeartPulse size={15} />Лист</button>
                  <button onClick={() => openHeroBuilder(hero)}><UserRound size={15} />Билдер</button>
                  {activeParty && (
                    <button
                      className={activeParty.heroIds.includes(hero.id) ? "active" : ""}
                      onClick={() => toggleHeroInParty(hero.id)}
                    >
                      <Users size={15} />
                      {activeParty.heroIds.includes(hero.id) ? "Из пачки" : "В пачку"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SceneWorkspace({
  scene,
  patchScene,
  applySceneScale,
  battleParameterSection,
  roster,
  loadEnemyFromRoster,
  removeEnemyFromRoster,
  clearSceneRoster,
  exportEncounterJson,
  saveEncounterPreset,
  discordReady,
  sendSceneToDiscord,
}: {
  scene: SceneState;
  patchScene: (patch: Partial<SceneState>) => void;
  applySceneScale: (scaleId: EnemyScaleId) => void;
  battleParameterSection?: ReferenceSection;
  roster: EnemyResolved[];
  loadEnemyFromRoster: (enemy: EnemyBuild) => void;
  removeEnemyFromRoster: (id: string) => void;
  clearSceneRoster: () => void;
  exportEncounterJson: () => void;
  saveEncounterPreset: () => void;
  discordReady: boolean;
  sendSceneToDiscord: () => void;
}) {
  const totalEnemies = roster.reduce((sum, item) => sum + item.build.count, 0);
  const activeScale = scaleById(scene.scaleId);
  const arenaParameters = referenceEntriesByGroup(battleParameterSection, "Арена");
  const tiltedParameters = referenceEntriesByGroup(battleParameterSection, "Перекос");
  const victoryParameters = referenceEntriesByGroup(battleParameterSection, "Победа");
  const toggleSceneParameter = (field: "arenaParameterIds" | "tiltedParameterIds", id: string) => {
    const current = scene[field] ?? [];
    patchScene({ [field]: current.includes(id) ? current.filter((value) => value !== id) : [...current, id] });
  };
  return (
    <section className="sceneWorkspace">
      <div className="sceneFields">
        <label>
          Название сцены
          <input value={scene.name} onChange={(event) => patchScene({ name: event.target.value })} />
        </label>
        <label>
          Локация
          <input value={scene.location} onChange={(event) => patchScene({ location: event.target.value })} placeholder="где происходит драка" />
        </label>
        <label>
          Цель сцены
          <input value={scene.objective} onChange={(event) => patchScene({ objective: event.target.value })} placeholder="чего нужно добиться" />
        </label>
        <label>
          Ставки
          <input value={scene.stakes} onChange={(event) => patchScene({ stakes: event.target.value })} placeholder="что случится при провале" />
        </label>
        <label>
          Причины драться
          <input value={scene.reasons} onChange={(event) => patchScene({ reasons: event.target.value })} placeholder="чего хотят стороны" />
        </label>
        <label>
          Начальные условия
          <input value={scene.setupConditions} onChange={(event) => patchScene({ setupConditions: event.target.value })} placeholder="расстановка, прошлый бой, особые старты" />
        </label>
        <label className="sceneScaleField">
          Масштаб сцены
          <select value={activeScale.id} onChange={(event) => applySceneScale(event.target.value as EnemyScaleId)}>
            {enemyScales.map((scale) => (
              <option key={scale.id} value={scale.id}>
                {scale.label}: {scale.hp} HP / лечение {scale.heal} / щит {scale.shieldCap}
              </option>
            ))}
          </select>
          <small>{activeScale.note}</small>
        </label>
      </div>

      <div className="sceneToolbar">
        <span><strong>{roster.length}</strong> записей · <strong>{totalEnemies}</strong> врагов всего · <strong>{activeScale.hp}</strong> HP / лечение {activeScale.heal} · щит {activeScale.shieldCap}</span>
        <div>
          <button onClick={saveEncounterPreset}><Clipboard size={15} />В пресеты</button>
          <button onClick={exportEncounterJson} disabled={roster.length === 0}><FileJson size={15} />Экспорт</button>
          <button onClick={sendSceneToDiscord} disabled={!discordReady} title={discordReady ? "Отправить сцену в Discord" : "Сначала настройте вебхук в разделе «Экспорт / импорт»"}>
            <Send size={15} />В Discord
          </button>
          <button onClick={clearSceneRoster} disabled={roster.length === 0}><Trash2 size={15} />Очистить</button>
        </div>
      </div>

      <section className="sceneParameterBox">
        <div className="enemySectionTitle">
          <h3>Параметры боя</h3>
          <button onClick={() => patchScene({ arenaParameterIds: [], tiltedParameterIds: [], victoryParameterId: "battle-parameters-последний-выживший" })}>
            <RotateCcw size={15} />Сбросить
          </button>
        </div>
        <div className="sceneParameterColumns">
          <div>
            <strong>Арена</strong>
            <div className="parameterChips">
              {arenaParameters.map((entry) => (
                <button key={entry.id} className={scene.arenaParameterIds.includes(entry.id) ? "active" : ""} onClick={() => toggleSceneParameter("arenaParameterIds", entry.id)}>
                  {entry.title}
                </button>
              ))}
            </div>
          </div>
          <div>
            <strong>Перекос</strong>
            <div className="parameterChips">
              {tiltedParameters.map((entry) => (
                <button key={entry.id} className={scene.tiltedParameterIds.includes(entry.id) ? "active" : ""} onClick={() => toggleSceneParameter("tiltedParameterIds", entry.id)}>
                  {entry.title}
                </button>
              ))}
            </div>
          </div>
          <label>
            Победа
            <select value={scene.victoryParameterId} onChange={(event) => patchScene({ victoryParameterId: event.target.value })}>
              {victoryParameters.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.title}</option>
              ))}
            </select>
          </label>
        </div>
        <p>{sceneParameterSummary(scene, battleParameterSection)}</p>
      </section>

      {roster.length === 0 ? (
        <EmptyHint text="Сцена пока пустая. Соберите врага во вкладке «Враг» и добавьте его в сцену." />
      ) : (
        <div className="sceneRosterGrid">
          {roster.map((item) => (
            <article key={item.build.id}>
              <button onClick={() => loadEnemyFromRoster(item.build)}>
                <strong>{item.build.count} × {item.build.name}</strong>
                <span>{item.kindLabel} {item.build.level}-го уровня · {item.villain?.title ?? "без архетипа"}</span>
                <small>{item.dice === "-" ? "без кости" : item.dice} · HP {item.build.hpCurrent}/{item.build.hpMax} · щит {item.build.shield}</small>
              </button>
              <button className="dangerIcon" onClick={() => removeEnemyFromRoster(item.build.id)} title="Убрать из сцены">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkshopNotes({ scene, patchScene }: { scene: SceneState; patchScene: (patch: Partial<SceneState>) => void }) {
  const prompts = [
    "Открывающий кадр",
    "Что заметят игроки",
    "Опасность сцены",
    "Что изменится после боя",
  ];
  return (
    <section className="workshopNotes">
      <div className="notesPromptGrid">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => patchScene({ plan: `${scene.plan}${scene.plan.trim() ? "\n" : ""}- ${prompt}: ` })}
          >
            <Clipboard size={15} />
            {prompt}
          </button>
        ))}
      </div>
      <label>
        План на игру
        <textarea value={scene.plan} onChange={(event) => patchScene({ plan: event.target.value })} placeholder="- Завязка&#10;- Событие&#10;- Решение игроков&#10;- Последствия" />
      </label>
      <label>
        Заметки Ведущего
        <textarea value={scene.notes} onChange={(event) => patchScene({ notes: event.target.value })} placeholder="Импровизация, реплики NPC, подсказки по правилам, последствия сцены" />
      </label>
    </section>
  );
}

function EncounterPresets({
  presets,
  saveEncounterPreset,
  loadEncounterPreset,
  deleteEncounterPreset,
}: {
  presets: EncounterPreset[];
  saveEncounterPreset: () => void;
  loadEncounterPreset: (preset: EncounterPreset) => void;
  deleteEncounterPreset: (id: string) => void;
}) {
  return (
    <section className="presetWorkspace">
      <div className="presetHeader">
        <div>
          <span>Библиотека сцен</span>
          <h3>Пресеты мастерской</h3>
          <p>Сохраняют название, цели, заметки и текущий состав сцены. Удобно готовить несколько боёв заранее.</p>
        </div>
        <button className="primaryButton" onClick={saveEncounterPreset}>
          <Download size={17} />
          Сохранить сцену
        </button>
      </div>

      {presets.length === 0 ? (
        <EmptyHint text="Пресетов пока нет. Соберите сцену и сохраните ее здесь." />
      ) : (
        <div className="presetList">
          {presets.map((preset) => {
            const enemyCount = preset.roster.reduce((sum, enemy) => sum + enemy.count, 0);
            return (
              <article key={preset.id}>
                <button onClick={() => loadEncounterPreset(preset)}>
                  <strong>{preset.name}</strong>
                  <span>{preset.scene.location || "локация не указана"} · {preset.roster.length} записей · {enemyCount} врагов</span>
                  <small>{new Date(preset.updatedAt).toLocaleString()}</small>
                </button>
                <button className="dangerIcon" onClick={() => deleteEncounterPreset(preset.id)} title="Удалить пресет">
                  <Trash2 size={16} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function EnemySide({ resolved, roster, scene, presetCount, battleParameterSection }: { resolved: EnemyResolved; roster: EnemyResolved[]; scene: SceneState; presetCount: number; battleParameterSection?: ReferenceSection }) {
  const totalEnemies = roster.reduce((sum, item) => sum + item.build.count, 0);
  const scale = scaleById(scene.scaleId);
  const parameterText = sceneParameterSummary(scene, battleParameterSection);
  return (
    <>
      <div className="referenceStatBox">
        <h2>Сцена</h2>
        <p>{scene.name || "Сцена без названия"}{scene.location ? ` · ${scene.location}` : ""}</p>
        <div className="purpleList">
          <span><strong>Цель</strong>{scene.objective || "не указана"}</span>
          <span><strong>Ставки</strong>{scene.stakes || "не указаны"}</span>
          <span><strong>Причины</strong>{scene.reasons || "не указаны"}</span>
          <span><strong>Старт</strong>{scene.setupConditions || "обычные условия"}</span>
          <span><strong>Масштаб</strong>{scale.label}: {scale.hp} HP / лечение {scale.heal} / щит {scale.shieldCap}</span>
          <span><strong>Параметры</strong>{parameterText}</span>
          <span><strong>Пресеты</strong>{presetCount}</span>
        </div>
      </div>
      <div className="referenceStatBox">
        <h2>Текущий враг</h2>
        <p>{resolved.build.name}: {resolved.kindLabel} {resolved.build.level}-го уровня.</p>
        <div className="statRows">
          <span><strong>{resolved.dice === "-" ? "—" : resolved.dice}</strong>Кость врага</span>
          <span><strong>{resolved.build.hpCurrent}/{resolved.build.hpMax}</strong>HP</span>
          <span><strong>{resolved.build.shield}</strong>Щит</span>
          <span><strong>{resolved.villain?.title ?? "—"}</strong>Архетип</span>
          <span><strong>{resolved.superMove?.title ?? resolved.villainMove?.title ?? "—"}</strong>Супер</span>
        </div>
      </div>
      <div className="referenceStatBox">
        <h2>Сцена</h2>
        <p>{roster.length} записей, {totalEnemies} врагов всего.</p>
        <div className="purpleList">
          {roster.map((item) => (
            <span key={item.build.id}><strong>{item.build.count} × {item.build.name}</strong>{item.kindLabel} · {item.dice === "-" ? "без кости" : item.dice} · HP {item.build.hpCurrent}/{item.build.hpMax}</span>
          ))}
          {roster.length === 0 && <span><strong>Пока пусто</strong>Добавьте врага из мастерской.</span>}
        </div>
      </div>
    </>
  );
}

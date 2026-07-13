import { Dices, Download, Eye, EyeOff, HeartPulse, ImagePlus, Minus, Paperclip, Plus, Shield, Sparkles, Trash2, X } from "lucide-react";
import type { BuilderData, EnemyRosterEntry, LibraryItem } from "../companionTypes";
import { counterTypes, type BattleScale, type TableToken } from "../types";
import { prepareTokenImage } from "../utils/background";
import { parseStanceDice, type StanceDice } from "../utils/dice";
import { parseRangeSpec } from "../utils/range";
import { maxSharedFilesPerToken, prepareSharedFile, readableFileSize } from "../utils/attachments";

function itemById(data: BuilderData, id?: string): LibraryItem | undefined {
  return id ? data.items.find((item) => item.id === id) : undefined;
}

// Панель выбранной фишки: трекеры боя по правилам масштаба (лечение, лимит щита,
// слом шкал здоровья, возвращение), у героев — стойки из билда с бросками пулов.
export function TokenPanel({
  token,
  data,
  isGM,
  scale,
  patchToken,
  removeToken,
  rollDice,
  log,
}: {
  token: TableToken;
  data: BuilderData;
  isGM: boolean;
  scale: BattleScale;
  patchToken: (patch: Partial<TableToken>) => void;
  removeToken: () => void;
  rollDice: (dice: { roll: number[]; fixed: number[] }, label: string) => void;
  log: (text: string) => void;
}) {
  const build = token.build;
  const stances = build?.stances ?? [];
  const activeStance = Math.min(token.activeStance ?? 0, Math.max(0, stances.length - 1));
  const bars = token.bars ?? 1;
  // Кости врага — из статблока книги (или из заметок для импортированных файлом).
  const enemyDiceText = token.statBlock?.dice || token.enemy?.notes?.match(/Кости:\s*([^\n]+)/)?.[1];
  const enemyDice = parseStanceDice(enemyDiceText);

  function adjustHp(delta: number) {
    const hpMax = token.hpMax ?? 1;
    const next = Math.min(hpMax, Math.max(0, (token.hpCurrent ?? 0) + delta));
    if (next === 0 && bars > 1) {
      // Шкала сломана: юнит продолжает со следующей шкалой с полным HP.
      patchToken({ hpCurrent: hpMax, bars: bars - 1 });
      log(`${token.name}: шкала здоровья сломана! Осталось шкал: ${bars - 1}.`);
      return;
    }
    patchToken({ hpCurrent: next });
    if (next === 0) log(`${token.name}: 0 HP — выведен из строя!`);
  }

  function heal() {
    const hpMax = token.hpMax ?? 1;
    const next = Math.min(hpMax, (token.hpCurrent ?? 0) + scale.heal);
    patchToken({ hpCurrent: next });
    log(`${token.name}: лечение +${scale.heal} (${next}/${hpMax}).`);
  }

  // Возвращение (гл. 2, патч): выбывший встаёт с 3 HP (статистам недоступно).
  function comeback() {
    patchToken({ hpCurrent: Math.min(token.hpMax ?? 3, 3) });
    log(`${token.name}: возвращение — снова в бою с 3 HP.`);
  }

  function adjustCounter(id: string, delta: number) {
    const current = token.counters?.[id] ?? 0;
    patchToken({ counters: { ...token.counters, [id]: Math.min(99, Math.max(0, current + delta)) } });
  }

  async function attachFiles(files: FileList) {
    const available = maxSharedFilesPerToken - (token.attachments?.length ?? 0);
    if (available <= 0) {
      log(`У ${token.name} уже максимальное число вложений (${maxSharedFilesPerToken}).`);
      return;
    }
    try {
      const prepared = await Promise.all(Array.from(files).slice(0, available).map(prepareSharedFile));
      patchToken({ attachments: [...(token.attachments ?? []), ...prepared] });
      log(`${token.name}: прикреплено файлов — ${prepared.length}.`);
    } catch (error) {
      log(error instanceof Error ? error.message : "Не удалось прикрепить файл.");
    }
  }

  return (
    <section className="tokenPanel">
      <div className="tokenPanelHead">
        <input value={token.name} onChange={(event) => patchToken({ name: event.target.value })} aria-label="Имя фишки" />
        {isGM && (
          <button
            className={token.hidden ? "hiddenOn" : ""}
            title={token.hidden ? "Показать игрокам" : "Скрыть от игроков"}
            onClick={() => patchToken({ hidden: !token.hidden })}
          >
            {token.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
        {isGM && <button className="dangerGhost" title="Убрать со стола" onClick={removeToken}><Trash2 size={15} /></button>}
      </div>
      {token.hidden && <p className="hiddenNote">Фишка скрыта: игроки её не видят, Ведущий видит полупрозрачной.</p>}

      <div className="tokenImageRow">
        {token.image && <img src={token.image} alt="" className="tokenImagePreview" style={{ borderColor: token.color }} />}
        <label className="tokenImageBtn" title="Картинка на фишке: ужмётся и станет круглой">
          <ImagePlus size={14} />
          {token.image ? "Заменить картинку" : "Картинка фишки"}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void prepareTokenImage(file)
                  .then((image) => patchToken({ image }))
                  .catch(() => log(`Не удалось загрузить картинку для ${token.name}.`));
              }
              event.currentTarget.value = "";
            }}
          />
        </label>
        {token.image && (
          <button className="miniBtn dangerGhost" title="Убрать картинку" onClick={() => patchToken({ image: undefined })}>
            <X size={13} />
          </button>
        )}
        <label className="tokenColorBtn" title="Цвет фишки">
          <input type="color" value={token.color} onChange={(event) => patchToken({ color: event.target.value })} />
        </label>
      </div>

      <div className="tokenAttachments">
        <div className="attachmentHead">
          <strong><Paperclip size={13} /> Файлы</strong>
          <label className="miniBtn attachmentAdd" title="До 256 КБ на файл; файл передаётся всем участникам комнаты">
            <Paperclip size={12} /> Добавить
            <input
              type="file"
              multiple
              accept=".json,.html,.htm,.txt,.md,.pdf,image/*,application/json,text/*,application/pdf"
              onChange={(event) => {
                if (event.target.files?.length) void attachFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {(token.attachments?.length ?? 0) === 0 ? (
          <p className="mutedLine">Листы JSON/HTML, памятки и небольшие картинки до 256 КБ.</p>
        ) : (
          <ul>
            {token.attachments!.map((file) => (
              <li key={file.id}>
                <a href={file.dataUrl} download={file.name} title={`Скачать ${file.name}`}>
                  <Download size={12} />
                  <span>{file.name}</span>
                  <small>{readableFileSize(file.size)}</small>
                </a>
                <button
                  className="dangerGhost"
                  title="Удалить вложение"
                  onClick={() => patchToken({ attachments: token.attachments?.filter((item) => item.id !== file.id) })}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {token.kind === "prop" && (
        <p className="hiddenNote">Заглушка: двигается по полю, но без HP, трекеров и хода. Для декора, зон и «клонов».</p>
      )}

      {token.kind !== "prop" && (<>
      <div className="trackerRow">
        <label>
          HP
          <div className="stepper">
            <button onClick={() => adjustHp(-1)} aria-label="Минус HP"><Minus size={13} /></button>
            <strong>{token.hpCurrent ?? 0}/{token.hpMax ?? 0}</strong>
            <button onClick={() => adjustHp(1)} aria-label="Плюс HP"><Plus size={13} /></button>
          </div>
        </label>
        <label>
          Макс.
          <input
            type="number"
            min={1}
            max={99}
            value={token.hpMax ?? 1}
            onChange={(event) => {
              const hpMax = Math.min(99, Math.max(1, Number(event.target.value) || 1));
              patchToken({ hpMax, hpCurrent: Math.min(token.hpCurrent ?? hpMax, hpMax) });
            }}
          />
        </label>
        <label title={`Лимит щита по масштабу: ${scale.shieldCap}`}>
          Щит ≤{scale.shieldCap}
          <div className="stepper">
            <button onClick={() => patchToken({ shield: Math.max(0, (token.shield ?? 0) - 1) })} aria-label="Минус щит"><Minus size={13} /></button>
            <strong>{token.shield ?? 0}</strong>
            <button
              onClick={() => patchToken({ shield: Math.min(scale.shieldCap, (token.shield ?? 0) + 1) })}
              disabled={(token.shield ?? 0) >= scale.shieldCap}
              aria-label="Плюс щит"
            >
              <Plus size={13} />
            </button>
          </div>
        </label>
        <div className="healRow">
          <button onClick={heal} title={`Значение лечения по масштабу: +${scale.heal}`}>
            <HeartPulse size={14} /> Лечение +{scale.heal}
          </button>
          {(token.hpCurrent ?? 0) === 0 && (
            <button onClick={comeback} title="Возвращение: выбывший встаёт с 3 HP (статистам недоступно)">
              <Sparkles size={14} /> Возвращение
            </button>
          )}
        </div>
        <button className={`armorToggle ${token.armorSpent ? "spent" : ""}`} onClick={() => patchToken({ armorSpent: !token.armorSpent })}>
          <Shield size={14} />
          {token.armorSpent ? "Броня потрачена" : "Броня готова"}
        </button>
      </div>

      <label className="barsField">
        <span>Шкалы здоровья <em>(ходов за раунд)</em></span>
        <div className="stepper">
          <button onClick={() => patchToken({ bars: Math.max(1, (token.bars ?? 1) - 1) })} aria-label="Меньше шкал"><Minus size={13} /></button>
          <strong>{token.bars ?? 1}</strong>
          <button onClick={() => patchToken({ bars: Math.min(9, (token.bars ?? 1) + 1) })} aria-label="Больше шкал"><Plus size={13} /></button>
        </div>
      </label>

      <div className="counterGrid">
        {counterTypes.map((counter) => (
          <div key={counter.id} className="counterCell">
            <span>{counter.label}</span>
            <div className="stepper">
              <button onClick={() => adjustCounter(counter.id, -1)} aria-label={`Минус ${counter.label}`}><Minus size={12} /></button>
              <strong>{token.counters?.[counter.id] ?? 0}</strong>
              <button onClick={() => adjustCounter(counter.id, 1)} aria-label={`Плюс ${counter.label}`}><Plus size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {!build && (() => {
        // Кастомные кости хода для фишек без листа (кастомные враги/союзники):
        // вписать пул («к8·к6·к6» или «7·5·3·1») и бросить в общий пул стола.
        const custom = parseStanceDice(token.customDice);
        const hasCustom = custom.roll.length > 0 || custom.fixed.length > 0;
        return (
          <label className="customDiceRow">
            <span>Кости хода</span>
            <div className="customDiceInput">
              <input
                value={token.customDice ?? ""}
                onChange={(event) => patchToken({ customDice: event.target.value })}
                placeholder="к8·к6·к6 или 7·5·3·1"
              />
              <button
                className="rollBtn"
                disabled={!hasCustom}
                title={hasCustom ? "Бросить эти кости в пул" : "Впишите кости: к8·к6 или 7·5·3"}
                onClick={() => rollDice(custom, token.name)}
              >
                <Dices size={15} />
              </button>
            </div>
          </label>
        );
      })()}

      {build && stances.length > 0 && (
        <div className="stanceBlock">
          <h4>Стойки</h4>
          {stances.map((stance, index) => {
            const form = itemById(data, stance.formId);
            const style = itemById(data, stance.styleId);
            const pool = parseStanceDice(form?.actionDice);
            const hasDice = pool.roll.length > 0 || pool.fixed.length > 0;
            const rangeText = style?.range ? style.range.split("·")[0].trim() : undefined;
            return (
              <article key={stance.id} className={index === activeStance ? "active" : ""}>
                <button className="stancePick" onClick={() => patchToken({ activeStance: index })}>
                  <strong>{index + 1}. {stance.name || "Стойка"}</strong>
                  <span>{form?.nameRu ?? "форма?"} + {style?.nameRu ?? "стиль?"}</span>
                  <small>
                    {form?.actionDice ?? "кости неизвестны"}
                    {rangeText && parseRangeSpec(rangeText) ? ` · дальность ${rangeText}` : ""}
                  </small>
                </button>
                <button
                  className="rollBtn"
                  disabled={!hasDice}
                  title={hasDice ? (pool.fixed.length ? "Выложить фиксированный пул" : "Бросить пул костей действий") : "Кости формы не найдены в данных"}
                  onClick={() => rollDice(pool, `${token.name}, ${stance.name || `стойка ${index + 1}`}`)}
                >
                  <Dices size={15} />
                </button>
              </article>
            );
          })}
        </div>
      )}

      {build && (() => {
        // Способности листа: свои способности персонажа — не «правила в столе»,
        // а часть его листа, чтобы не бегать в компаньон посреди хода.
        const pathKey = { adept: "адепт", chimera: "химера", vortex: "вихрь" }[build.creationPath] ?? "адепт";
        const abilities = [
          ...build.archetypeIds
            .map((id) => itemById(data, id))
            .filter(Boolean)
            .map((item) => ({ title: item!.nameRu, text: item!.abilities?.[pathKey] ?? item!.rules.ability ?? item!.rules.summary })),
          ...(build.statId
            ? [itemById(data, build.statId)].filter(Boolean).map((item) => ({ title: item!.nameRu, text: item!.rules.ability ?? item!.rules.summary }))
            : []),
        ].filter((entry) => entry.text);
        if (abilities.length === 0) return null;
        return (
          <details className="sheetAbilities">
            <summary>Способности листа ({abilities.length})</summary>
            {abilities.map((entry) => (
              <article key={entry.title}>
                <strong>{entry.title}</strong>
                <p>{entry.text}</p>
              </article>
            ))}
          </details>
        );
      })()}

      {token.statBlock ? (
        <EnemyStatBlock entry={token.statBlock} dice={enemyDice} onRoll={() => rollDice(enemyDice, token.name)} />
      ) : (
        <>
          {(enemyDice.roll.length > 0 || enemyDice.fixed.length > 0) && (
            <button className="turnRollBtn" onClick={() => rollDice(enemyDice, token.name)}>
              <Dices size={15} />
              {enemyDice.fixed.length > 0 ? `Пул врага: ${enemyDice.fixed.join("·")} (фикс.)` : `Кости врага: ${enemyDiceText}`}
            </button>
          )}
          {token.enemy?.notes?.trim() && (
            <div className="enemyNotes">
              {token.enemy.notes.split("\n").map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          )}
        </>
      )}

      </>)}

      <label className="tokenNote">
        Заметка
        <textarea value={token.note ?? ""} onChange={(event) => patchToken({ note: event.target.value })} placeholder="состояния, цель, особенности" />
      </label>
    </section>
  );
}

// Строка правил, начинающаяся с триггера/стоимости («3+ или 7+:», «1+:»,
// «Уничтожьте свой активный щит:»), — это ход. Остальные строки — пассивные способности.
function splitRuleLine(line: string): { head: string; text: string } | undefined {
  const match = line.match(/^([^:]{1,50}):\s*(.+)$/s);
  if (match && (/\d\s*\+/.test(match[1]) || /^(Уничтожьте|Потратьте|Сбросьте|Отметьте|Если|Раз )/.test(match[1].trim()))) {
    return { head: match[1].trim(), text: match[2].trim() };
  }
  return undefined;
}

// Опрятный статблок готового врага книги: шапка (стойка/дальность/кости),
// способности и ходы по строкам, флейвор — отдельно курсивом.
function EnemyStatBlock({ entry, dice, onRoll }: { entry: EnemyRosterEntry; dice: StanceDice; onRoll: () => void }) {
  const hasDice = dice.roll.length > 0 || dice.fixed.length > 0;
  const rules = entry.body.filter((line) => line.trim() && line.trim() !== entry.flavor.trim());

  return (
    <section className="statBlock">
      <header className="statBlockHead">
        {entry.stanceName && (
          <strong>Стойка «{entry.stanceName}»</strong>
        )}
        {(entry.styleName || entry.formName) && (
          <span>{[entry.styleName, entry.formName].filter(Boolean).join(" · ")}</span>
        )}
        <div className="statBlockMeta">
          {entry.range && <em>Дальность {entry.range}</em>}
          {entry.dice && <em>{entry.dice}</em>}
        </div>
      </header>

      {hasDice && (
        <button className="turnRollBtn" onClick={onRoll}>
          <Dices size={15} />
          {dice.fixed.length > 0 ? `Пул врага: ${dice.fixed.join("·")} (фикс.)` : `Бросить кости: ${entry.dice}`}
        </button>
      )}

      <div className="statBlockRules">
        {rules.map((line, index) => {
          const move = splitRuleLine(line);
          return move ? (
            <p key={index} className="statBlockMove">
              <b>{move.head}</b> {move.text}
            </p>
          ) : (
            <p key={index}>{line}</p>
          );
        })}
      </div>

      {entry.flavor.trim() && <p className="statBlockFlavor">{entry.flavor}</p>}
    </section>
  );
}

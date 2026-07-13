import { ChevronLeft, ChevronRight, Dices, Flag, Play, Square, Swords, UserRound } from "lucide-react";
import type { BuilderData } from "../companionTypes";
import type { InitiativeState, TableToken } from "../types";
import { parseStanceDice, type StanceDice } from "../utils/dice";
import { eligibleTokens, tokenBars, turnPhases } from "../utils/initiative";
import { PoolDice, poolRemaining } from "./PoolDice";
import { archetypeDiceActions } from "../utils/abilities";

// Шкала инициативы: чередование сторон, выбор активного юнита на ячейке,
// «Следующий ход» с переходом раунда. Рутина хода автоматизирована прямо здесь:
// фаза 1 — переключение стойки чипами, фаза 4 — бросок костей стойки одной кнопкой.
export function InitiativePanel({
  initiative,
  tokens,
  data,
  isGM,
  startCombat,
  endCombat,
  assignActive,
  nextTurn,
  prevTurn,
  focusToken,
  patchToken,
  rollDice,
  togglePoolDie,
  adjustPoolDie,
  bumpPoolAll,
}: {
  initiative?: InitiativeState;
  tokens: TableToken[];
  data: BuilderData;
  isGM: boolean;
  startCombat: () => void;
  endCombat: () => void;
  assignActive: (tokenId: string) => void;
  nextTurn: () => void;
  prevTurn: () => void;
  focusToken: (tokenId: string) => void;
  patchToken: (id: string, patch: Partial<TableToken>) => void;
  rollDice: (tokenId: string, dice: StanceDice, label: string) => void;
  togglePoolDie: (tokenId: string, index: number) => void;
  adjustPoolDie: (tokenId: string, index: number, delta: number) => void;
  bumpPoolAll: (tokenId: string, delta: number) => void;
}) {
  const heroCount = tokens.filter((t) => t.kind === "hero").length;
  const enemyCount = tokens.filter((t) => t.kind === "enemy").length;

  if (!initiative?.active) {
    return (
      <section className="initiativePanel">
        <div className="enemySectionTitle">
          <h3><Flag size={15} /> Инициатива</h3>
          <span>{heroCount + enemyCount} юнитов</span>
        </div>
        <p className="mutedLine">
          Шкала инициативы соберётся по правилам: ячеек = числу шкал здоровья, первым ходит герой, дальше стороны
          чередуются. Босс со шкалами делает столько ходов за раунд.
        </p>
        <button className="startCombatBtn" disabled={heroCount + enemyCount === 0} onClick={startCombat}>
          <Play size={15} /> Начать бой
        </button>
      </section>
    );
  }

  const currentSlot = initiative.slots[initiative.slot];
  const activeId = currentSlot?.tokenId;
  const activeToken = activeId ? tokens.find((t) => t.id === activeId) : undefined;
  const eligible = currentSlot ? eligibleTokens(tokens, initiative.slots.slice(0, initiative.slot), currentSlot.side) : [];

  return (
    <section className="initiativePanel">
      <div className="enemySectionTitle">
        <h3><Flag size={15} /> Инициатива · раунд {initiative.round}</h3>
        {isGM && <button className="miniBtn" onClick={endCombat}><Square size={13} /> Завершить</button>}
      </div>

      <div className="initTrack">
        {initiative.slots.map((slot, index) => {
          const token = slot.tokenId ? tokens.find((t) => t.id === slot.tokenId) : undefined;
          return (
            <button
              key={index}
              className={`initSlot ${slot.side} ${index === initiative.slot ? "current" : ""} ${index < initiative.slot ? "done" : ""}`}
              title={token ? token.name : slot.side === "hero" ? "Ячейка героев" : "Ячейка врагов"}
              onClick={() => token && focusToken(token.id)}
            >
              {slot.side === "hero" ? <UserRound size={13} /> : <Swords size={13} />}
              {token ? <span>{token.name.split(/\s+/)[0]}</span> : null}
            </button>
          );
        })}
      </div>

      {activeToken ? (
        <div className="activeTurnBox">
          <div className="activeTurnHead">
            <span className={`sideDot ${currentSlot.side}`} />
            <strong>{activeToken.name}</strong>
            <em>ходит</em>
          </div>

          {/* Фазы 1 и 4 — прямо здесь: стойка и кости стойки. */}
          {activeToken.build && activeToken.build.stances.length > 0 && (() => {
            const stances = activeToken.build!.stances;
            const activeStance = Math.min(activeToken.activeStance ?? 0, stances.length - 1);
            const stance = stances[activeStance];
            const form = data.items.find((item) => item.id === stance.formId);
            const stancePool = parseStanceDice(form?.actionDice);
            const hasDice = stancePool.roll.length > 0 || stancePool.fixed.length > 0;
            const veryFirstTurn = initiative.round === 1 && initiative.slot === 0;
            return (
              <div className="turnStanceBox">
                <div className="turnStanceChips">
                  {stances.map((record, index) => (
                    <button
                      key={record.id}
                      className={index === activeStance ? "active" : ""}
                      disabled={veryFirstTurn && index !== activeStance}
                      title={veryFirstTurn ? "Первый ход боя: стойка остаётся стартовой" : "Выбрать стойку (фаза 1)"}
                      onClick={() => patchToken(activeToken.id, { activeStance: index })}
                    >
                      {index + 1}. {record.name || "Стойка"}
                    </button>
                  ))}
                </div>
                <button
                  className="turnRollBtn"
                  disabled={!hasDice}
                  onClick={() => rollDice(activeToken.id, stancePool, `${activeToken.name}, ${stance.name || `стойка ${activeStance + 1}`}`)}
                >
                  <Dices size={15} />
                  Кости стойки{form?.actionDice ? `: ${form.actionDice}` : ""}
                </button>
              </div>
            );
          })()}

          {/* Активный пул хода фишки: кости тратятся по значениям, значения правятся ±. */}
          {activeToken.pool && activeToken.pool.dice.length > 0 && (
            <div className="turnPool">
              <div className="turnPoolHead">
                <span className="trayLabel">{activeToken.pool.label}</span>
                <span className="poolSum">остаток {poolRemaining(activeToken.pool)}</span>
              </div>
              {(() => {
                const actions = archetypeDiceActions(activeToken, data);
                return actions.length > 0 ? (
                  <div className="poolActions">
                    {actions.map((action) => (
                      <button key={action.label} className="miniBtn" onClick={() => bumpPoolAll(activeToken.id, action.allDelta)}>{action.label}</button>
                    ))}
                  </div>
                ) : null;
              })()}
              <PoolDice pool={activeToken.pool} onToggle={(i) => togglePoolDie(activeToken.id, i)} onAdjust={(i, d) => adjustPoolDie(activeToken.id, i, d)} />
            </div>
          )}

          <details className="phaseDetails">
            <summary>Памятка: 8 фаз хода</summary>
            <ol className="phaseList">
              {turnPhases.map((phase, index) => (
                <li key={index} className={initiative.round === 1 && initiative.slot === 0 && index === 0 ? "skipped" : ""}>
                  <b>{index + 1}. {phase.title}</b>
                  <span>{phase.detail}</span>
                </li>
              ))}
            </ol>
          </details>

          <div className="turnNavRow">
            {initiative.prev && (
              <button className="nextTurnBtn ghost" title="Вернуться к предыдущему ходу" onClick={prevTurn}>
                <ChevronLeft size={15} /> Вернуть
              </button>
            )}
            <button className="nextTurnBtn" onClick={nextTurn}>
              Следующий ход <ChevronRight size={15} />
            </button>
          </div>
          <p className="turnFootHint">Конец хода: все сбросят жетоны скорости автоматически.</p>
        </div>
      ) : (
        <div className="pickTurnBox">
          <p className="pickPrompt">
            Ячейка {initiative.slot + 1}: ходят <strong>{currentSlot.side === "hero" ? "герои" : "враги"}</strong>. Кто берёт ход?
          </p>
          {eligible.length === 0 ? (
            <p className="mutedLine">Свободных юнитов этой стороны нет — переходите к следующему ходу.</p>
          ) : (
            <div className="pickList">
              {eligible.map((token) => (
                <button key={token.id} onClick={() => assignActive(token.id)}>
                  {token.kind === "hero" ? <UserRound size={14} /> : <Swords size={14} />}
                  <span>{token.name}</span>
                  {tokenBars(token) > 1 && <small>{tokenBars(token)} шк.</small>}
                </button>
              ))}
            </div>
          )}
          <div className="turnNavRow">
            {initiative.prev && (
              <button className="nextTurnBtn ghost" title="Вернуться к предыдущему ходу" onClick={prevTurn}>
                <ChevronLeft size={15} /> Вернуть
              </button>
            )}
            <button className="nextTurnBtn ghost" onClick={nextTurn}>
              Пропустить ячейку <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

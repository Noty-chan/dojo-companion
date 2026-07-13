import { Minus, Plus } from "lucide-react";
import type { DicePool } from "../types";

// Кости активного пула действий: клик по грани — потратить/вернуть,
// маленькие ±1 правят значение (бонусы вроде Танцующего в бою).
export function PoolDice({
  pool,
  onToggle,
  onAdjust,
}: {
  pool: DicePool;
  onToggle: (index: number) => void;
  onAdjust: (index: number, delta: number) => void;
}) {
  return (
    <div className="poolDice">
      {pool.dice.map((die, index) => (
        <div key={index} className={`poolDie ${die.spent ? "spent" : ""}`}>
          <button className="poolDieFace" onClick={() => onToggle(index)} title={die.spent ? "Вернуть кость" : "Потратить кость на действие"}>
            <small>{die.sides > 0 ? `к${die.sides}` : "фикс"}</small>
            <strong>{die.value}</strong>
          </button>
          <div className="poolDieAdj">
            <button onClick={() => onAdjust(index, -1)} aria-label="Минус значение"><Minus size={10} /></button>
            <button onClick={() => onAdjust(index, 1)} aria-label="Плюс значение"><Plus size={10} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Сумма непотраченных костей — удобно видеть остаток пула.
export function poolRemaining(pool: DicePool): number {
  return pool.dice.filter((die) => !die.spent).reduce((sum, die) => sum + die.value, 0);
}

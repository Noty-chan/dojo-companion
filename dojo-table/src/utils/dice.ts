// Пулы костей действий PatD: строки вида «к8 · к8 · к6» из данных компаньона,
// фиксированные пулы «7 · 5 · 3 · 1 (фикс.)» и кости врагов «4 (к8·к6·к6·к4)».

export interface StanceDice {
  roll: number[]; // кости, которые бросаются (грани)
  fixed: number[]; // фиксированные значения — кладутся в трей без броска
}

export function parseDicePool(text?: string): number[] {
  if (!text) return [];
  // Скобки — опциональные добавки вроде «(+ до 3×к6)»; в базовый пул не входят.
  const base = text.replace(/\([^)]*\)/g, "");
  return kDice(base);
}

// Универсальный разбор строки костей стойки. Кости кX ищем сперва вне скобок
// (у форм героев скобки — опциональные добавки), затем внутри (у врагов пул
// целиком в скобках: «4 (к8·к6·к6·к4)»). Если костей нет вовсе — это фикс-пул:
// берём числа из того источника, где их больше («4 действия (7·5·3·1)» → скобки).
export function parseStanceDice(text?: string): StanceDice {
  if (!text) return { roll: [], fixed: [] };
  const base = text.replace(/\([^)]*\)/g, "");
  const paren = [...text.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]).join(" ");
  let roll = kDice(base);
  if (roll.length === 0) roll = kDice(paren);
  if (roll.length > 0) return { roll, fixed: [] };
  const baseNumbers = plainNumbers(base);
  const parenNumbers = plainNumbers(paren);
  return { roll: [], fixed: parenNumbers.length > baseNumbers.length ? parenNumbers : baseNumbers };
}

function kDice(text: string): number[] {
  return [...text.matchAll(/[кkd](\d+)/gi)].map((match) => Number(match[1])).filter((sides) => sides >= 2 && sides <= 100);
}

function plainNumbers(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((match) => Number(match[0])).filter((value) => value >= 1 && value <= 20);
}

export interface DieResult {
  sides: number; // 0 = фиксированное значение (не бросалось)
  value: number;
}

export function rollPool(sides: number[], random: () => number = Math.random): DieResult[] {
  return sides.map((s) => ({ sides: s, value: 1 + Math.floor(random() * s) }));
}

export function rollStance(dice: StanceDice, random: () => number = Math.random): DieResult[] {
  return [...rollPool(dice.roll, random), ...dice.fixed.map((value) => ({ sides: 0, value }))];
}

export function formatRoll(results: DieResult[]): string {
  return results.map((die) => (die.sides > 0 ? `к${die.sides}: ${die.value}` : `${die.value} (фикс.)`)).join(", ");
}

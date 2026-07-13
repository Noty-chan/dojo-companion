import { describe, expect, it } from "vitest";
import type { TableState, TableToken } from "../types";
import { mergeTableStates } from "./merge";

function token(id: string, x = 0, hpCurrent = 10): TableToken {
  return { id, kind: "hero", name: id, x, y: 0, color: "#fff", hpMax: 10, hpCurrent };
}

function state(tokens: TableToken[]): TableState {
  return { schemaVersion: 2, name: "Арена", gridType: "square", gridW: 9, gridH: 7, round: 1, tokens, log: [], drawings: [], tray: [] };
}

describe("mergeTableStates", () => {
  it("сохраняет независимые изменения разных фишек", () => {
    const base = state([token("a"), token("b")]);
    const local = state([token("a", 3), token("b")]);
    const remote = state([token("a"), token("b", 0, 4)]);
    const merged = mergeTableStates(base, local, remote);
    expect(merged.tokens.find((item) => item.id === "a")?.x).toBe(3);
    expect(merged.tokens.find((item) => item.id === "b")?.hpCurrent).toBe(4);
  });

  it("объединяет разные поля одной фишки", () => {
    const base = state([token("a")]);
    const local = state([token("a", 2)]);
    const remote = state([token("a", 0, 6)]);
    expect(mergeTableStates(base, local, remote).tokens[0]).toMatchObject({ x: 2, hpCurrent: 6 });
  });

  it("сохраняет локальное значение при конфликте одного поля", () => {
    const base = state([token("a")]);
    const local = state([token("a", 2)]);
    const remote = state([token("a", 5)]);
    expect(mergeTableStates(base, local, remote).tokens[0].x).toBe(2);
  });
});

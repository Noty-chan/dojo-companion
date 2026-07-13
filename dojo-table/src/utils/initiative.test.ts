import { describe, expect, it } from "vitest";
import type { TableToken } from "../types";
import { advanceSlot, assignCurrentSlot, buildRoundSlots, eligibleTokens, startCombat, tokenBars } from "./initiative";

function unit(id: string, kind: "hero" | "enemy" | "terrain", bars?: number): TableToken {
  return { id, kind, name: id, x: 0, y: 0, color: "#000", bars };
}

describe("buildRoundSlots", () => {
  it("чередует стороны, первая ячейка — героев", () => {
    const slots = buildRoundSlots([unit("h1", "hero"), unit("h2", "hero"), unit("e1", "enemy"), unit("e2", "enemy")]);
    expect(slots.map((s) => s.side)).toEqual(["hero", "enemy", "hero", "enemy"]);
  });

  it("босс с 4 шкалами делает 4 хода за раунд (хвост — у стороны с избытком)", () => {
    const slots = buildRoundSlots([unit("h1", "hero"), unit("boss", "enemy", 4)]);
    // H E H E E E — 1 герой, 4 хода босса; чередование, затем хвост врага
    expect(slots.map((s) => s.side)).toEqual(["hero", "enemy", "enemy", "enemy", "enemy"]);
  });

  it("лишняя шкала у героев даёт им дополнительный ход", () => {
    const slots = buildRoundSlots([unit("h1", "hero", 2), unit("h2", "hero"), unit("e1", "enemy")]);
    // heroBars=3, enemyBars=1 → H E H H
    expect(slots.map((s) => s.side)).toEqual(["hero", "enemy", "hero", "hero"]);
  });

  it("terrain не участвует; пустой бой — пустая шкала", () => {
    expect(buildRoundSlots([unit("t", "terrain")])).toEqual([]);
  });
});

describe("tokenBars", () => {
  it("минимум 1, ограничение 9, округление", () => {
    expect(tokenBars(unit("a", "hero"))).toBe(1);
    expect(tokenBars(unit("a", "hero", 0))).toBe(1);
    expect(tokenBars(unit("a", "hero", 4))).toBe(4);
    expect(tokenBars(unit("a", "hero", 99))).toBe(9);
  });
});

describe("eligibleTokens", () => {
  it("исключает уже израсходовавших свои шкалы", () => {
    const tokens = [unit("h1", "hero"), unit("h2", "hero"), unit("boss", "enemy", 2)];
    const slots = [{ side: "hero" as const, tokenId: "h1" }];
    expect(eligibleTokens(tokens, slots, "hero").map((t) => t.id)).toEqual(["h2"]);
    // босс сходил один раз, но у него 2 шкалы — ещё доступен
    const slots2 = [{ side: "enemy" as const, tokenId: "boss" }];
    expect(eligibleTokens(tokens, slots2, "enemy").map((t) => t.id)).toEqual(["boss"]);
    const slots3 = [{ side: "enemy" as const, tokenId: "boss" }, { side: "enemy" as const, tokenId: "boss" }];
    expect(eligibleTokens(tokens, slots3, "enemy")).toEqual([]);
  });
});

describe("advanceSlot / раунды", () => {
  it("идёт по ячейкам, на последней запускает новый раунд и пересобирает шкалу", () => {
    const tokens = [unit("h1", "hero"), unit("e1", "enemy")];
    let state = startCombat(tokens);
    expect(state.round).toBe(1);
    expect(state.slots).toHaveLength(2);

    state = assignCurrentSlot(state, "h1");
    const step1 = advanceSlot(state, tokens);
    expect(step1.roundAdvanced).toBe(false);
    expect(step1.initiative.slot).toBe(1);

    const step2 = advanceSlot(step1.initiative, tokens);
    expect(step2.roundAdvanced).toBe(true);
    expect(step2.initiative.round).toBe(2);
    expect(step2.initiative.slot).toBe(0);
    expect(step2.initiative.slots).toHaveLength(2);
    // новый раунд — ячейки чистые
    expect(step2.initiative.slots.every((s) => !s.tokenId)).toBe(true);
  });
});

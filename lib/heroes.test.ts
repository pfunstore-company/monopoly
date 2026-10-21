import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newTable, reduceTable, rentOf, type TableState } from "./eight";
import { firstUses, levelCost, perkLine, pumpkinStart } from "./heroes";

const who = (hero: string, level = 1, bot = true) => ({ name: hero, avatar: `/art/avatars/${hero}.jpg`, colour: "#000", bot, level });
/** 領地 board (one die, every square a lot): `mover` at the plaza, about to land on o1. */
const clover = (players: ReturnType<typeof who>[], fair = false): TableState => newTable(players, { turnsEach: 12, fair }, "clover");

describe("角色升級", () => {
  it("level numbers", () => {
    assert.equal(levelCost(1), 20);
    assert.equal(levelCost(4), 150);
    assert.equal(levelCost(5), null);
    assert.equal(firstUses("franken", 4), 3);
    assert.equal(firstUses("vampire", 1), 0);
    assert.equal(pumpkinStart(4), 1.3);
    assert.equal(perkLine("vampire", 1), "");
    assert.equal(perkLine("vampire", 3), "第一次收租多 50%");
  });
  it("阿科 Lv2 pays half rent twice, the third in full", () => {
    let t = clover([who("franken", 2), who("zombie")]);
    t = { ...t, deeds: { o1: { owner: 1, level: 1 } } };
    const rent = rentOf("o1", 1, "clover");
    const go = (s: TableState) => reduceTable({ ...s, current: 0, phase: "roll", seats: s.seats.map((x, i) => (i === 0 ? { ...x, spot: { on: "loop" as const, i: 0 } } : x)) }, { type: "roll", dice: [1, 1] });
    const c0 = t.seats[0].cash;
    t = go(t);
    t = go(t);
    t = go(t);
    assert.equal(Math.round((c0 - t.seats[0].cash) * 10) / 10, Math.round(rent * 2 * 10) / 10);
  });
  it("伯爵 Lv2 collects half as much again the first time", () => {
    let t = clover([who("zombie"), who("vampire", 2)]);
    t = { ...t, deeds: { o1: { owner: 1, level: 1 } } };
    const before = t.seats[1].cash;
    t = reduceTable(t, { type: "roll", dice: [1, 1] });
    const rent = rentOf("o1", 1, "clover");
    assert.equal(t.seats[1].cash, Math.round((before + rent * 1.5) * 10) / 10);
    assert.ok(t.events.some((e) => e.kind === "perk" && e.perk === "vampire"));
  });
  it("阿木 Lv3 starts with a 護盾, but not in 公平模式", () => {
    assert.ok(newTable([who("mummy", 3), who("zombie")]).seats[0].powers.includes("shield"));
    assert.ok(!newTable([who("mummy", 3), who("zombie")], { fair: true }).seats[0].powers.includes("shield"));
    assert.equal(newTable([who("mummy", 4)], { fair: true }).seats[0].level, 1);
  });
  it("阿殭 Lv3 steps one more, once", () => {
    let t = clover([who("jiangshi", 3), who("zombie")]);
    t = reduceTable(t, { type: "roll", dice: [2, 1], nudge: 1 });
    assert.deepEqual(t.seats[0].spot, { on: "loop", i: 3 });
    assert.equal(t.seats[0].uses?.nudge, 1);
  });
  it("阿殭 below Lv3 can't", () => {
    let t = clover([who("jiangshi", 2), who("zombie")]);
    t = reduceTable(t, { type: "roll", dice: [2, 1], nudge: 1 });
    assert.deepEqual(t.seats[0].spot, { on: "loop", i: 2 });
  });
  it("阿強 Lv3 shrugs off one 拆樓", () => {
    let t = newTable([who("vampire"), who("zombie", 3)]);
    t = { ...t, deeds: { o1: { owner: 1, level: 3 } }, seats: t.seats.map((s, i) => (i === 0 ? { ...s, powers: ["wreck", "wreck"] } : s)) };
    t = reduceTable(t, { type: "power", index: 0 });
    assert.equal(t.deeds.o1.level, 3);
    t = reduceTable(t, { type: "power", index: 0 });
    assert.equal(t.deeds.o1.level, 2);
  });
  it("阿科 Lv3 loses nothing to the monster", () => {
    let t = newTable([who("vampire"), who("franken", 3)]);
    t = { ...t, seats: t.seats.map((s, i) => (i === 0 ? { ...s, powers: ["monster"] } : s)) };
    const cash = t.seats[1].cash;
    t = reduceTable(t, { type: "power", index: 0, target: 1 });
    assert.equal(t.seats[1].cash, cash);
  });
  it("阿神 Lv3 takes the best lot of someone going broke", () => {
    let t = clover([who("zombie"), who("vampire"), who("reaper", 3)]);
    t = { ...t, deeds: { o1: { owner: 1, level: 4 }, o5: { owner: 0, level: 3 }, o6: { owner: 0, level: 1 } }, seats: t.seats.map((s, i) => (i === 0 ? { ...s, cash: 0 } : s)) };
    t = reduceTable(t, { type: "roll", dice: [1, 1] });
    assert.ok(t.seats[0].bankrupt);
    assert.equal(t.deeds.o5?.owner, 2);
    assert.equal(t.deeds.o6, undefined);
  });
});

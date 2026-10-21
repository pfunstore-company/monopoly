import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newTable, reduceTable, SEAL_LAPS, type TableState } from "./eight";

const seat = (n: number, specials: string[] = []) => ({ name: `P${n}`, avatar: "", colour: "#000", bot: true, specials: specials as never });
const table = (a: string[], b: string[] = [], c: string[] = []): TableState => newTable([seat(0, a), seat(1, b), seat(2, c)], { turnsEach: 12 }, "clover");

describe("牽制卡", () => {
  it("反射鏡 turns 龍息 away and the attacker misses a turn", () => {
    let t = table(["dragon"], ["mirror"]);
    t = { ...t, deeds: { o3: { owner: 1, level: 3 } } };
    t = reduceTable(t, { type: "power", index: 0 });
    assert.deepEqual(t.deeds.o3, { owner: 1, level: 3 });
    assert.deepEqual(t.seats[1].powers, []);
    assert.deepEqual(t.seats[0].powers, []);
    assert.equal(t.seats[0].frozen, true);
    assert.ok(t.events.some((e) => e.kind === "mirrored" && e.seat === 0 && e.by === 1));
  });
  it("反射鏡 only covers its holder: 冰河時代 still freezes the others", () => {
    let t = table(["iceage"], ["mirror"]);
    t = reduceTable(t, { type: "power", index: 0 });
    assert.ok(!t.seats[1].frozen);
    assert.equal(t.seats[2].frozen, true);
    assert.equal(t.seats[0].frozen, true);
  });
  it("反射鏡 isn't used up when the attack wouldn't touch its holder", () => {
    let t = table(["blackhole"], ["mirror"]);
    t = { ...t, seats: t.seats.map((s, i) => (i === 2 ? { ...s, spot: { on: "loop" as const, i: 6 } } : s)) };
    t = reduceTable(t, { type: "power", index: 0 });
    assert.deepEqual(t.seats[1].powers, ["mirror"]);
    assert.ok(!t.seats[0].frozen);
  });
  it("反射鏡 keeps a 霸王收購 off your lots", () => {
    let t = table(["takeover"], ["mirror"]);
    t = { ...t, deeds: { o1: { owner: 1, level: 4 }, o2: { owner: 1, level: 3 } } };
    t = reduceTable(t, { type: "power", index: 0 });
    assert.equal(t.deeds.o1.owner, 1);
    assert.equal(t.deeds.o2.owner, 1);
    assert.equal(t.seats[0].frozen, true);
  });
  it("反射鏡 can't be played by hand", () => {
    const t = table(["mirror"]);
    assert.equal(reduceTable(t, { type: "power", index: 0 }).seats[0].powers.length, 1);
  });
  it("封印 takes the UR card first and it comes back after three laps", () => {
    let t = table(["seal"], ["dragon", "takeover"], ["mirror"]);
    t = reduceTable(t, { type: "power", index: 0 });
    assert.deepEqual(t.seats[1].powers, ["dragon"]);
    assert.deepEqual(t.seats[1].sealed, [{ card: "takeover", laps: SEAL_LAPS }]);
    assert.deepEqual(t.seats[2].powers, ["mirror"]);
  });
  it("封印 goes for a 反射鏡 before an ordinary card", () => {
    let t = table(["seal"], ["dragon"], ["mirror"]);
    t = reduceTable(t, { type: "power", index: 0 });
    assert.deepEqual(t.seats[2].powers, []);
    assert.deepEqual(t.seats[1].powers, ["dragon"]);
  });
  it("封印 needs someone with a 特別卡", () => {
    const t = table(["seal"]);
    assert.deepEqual(reduceTable(t, { type: "power", index: 0 }).seats[0].powers, ["seal"]);
  });
});

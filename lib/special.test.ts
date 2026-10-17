import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newTable, reduceTable, type TableState } from "./eight";

const seat = (n: number, specials: string[] = []) => ({ name: `P${n}`, avatar: "", colour: "#000", bot: true, specials: specials as never });
const table = (mine: string[]): TableState => newTable([seat(0, mine), seat(1), seat(2)], { turnsEach: 12 }, "clover");

describe("特別卡", () => {
  it("you bring up to three into a 領地 game, and nothing else", () => {
    const t = newTable([seat(0, ["dragon", "meteor", "blackhole", "iceage"]), seat(1)], {}, "clover");
    assert.deepEqual(t.seats[0].powers, ["dragon", "meteor", "blackhole"]);
    assert.deepEqual(t.seats[1].powers, []);
  });
  it("龍息 burns an opponent's lot back to nobody's", () => {
    let t = table(["dragon"]);
    t = { ...t, deeds: { o3: { owner: 1, level: 3 } } };
    t = reduceTable(t, { type: "power", index: 0 });
    assert.equal(t.deeds.o3, undefined);
  });
  it("黑洞 sends every opponent back to the plaza", () => {
    let t = table(["blackhole"]);
    t = { ...t, seats: t.seats.map((s, i) => (i ? { ...s, spot: { on: "loop" as const, i: 5 + i } } : s)) };
    t = reduceTable(t, { type: "power", index: 0 });
    assert.ok(t.seats.slice(1).every((s) => s.spot.on === "loop" && s.spot.i === 0));
  });
  it("冰河時代 skips every opponent's next turn", () => {
    let t = table(["iceage"]);
    t = reduceTable(t, { type: "power", index: 0 });
    t = reduceTable(t, { type: "roll", dice: [1, 1] });
    assert.equal(t.current, 0);
  });
  it("黃金之路 takes the empty lots walked over", () => {
    let t = table(["goldroad"]);
    t = reduceTable(t, { type: "power", index: 0 });
    t = reduceTable(t, { type: "roll", dice: [3, 1] });
    assert.equal(t.deeds.o1?.owner, 0);
    assert.equal(t.deeds.o2?.owner, 0);
    assert.ok(!t.seats[0].goldRoad);
  });
});

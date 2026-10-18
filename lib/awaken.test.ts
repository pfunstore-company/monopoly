import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newTable, reduceTable, rentOf, setOwnerOf, type TableState } from "./eight";

const seat = (n: number) => ({ name: `P${n}`, avatar: "", colour: "#000", bot: true });
const table = (): TableState => newTable([seat(0), seat(1), seat(2)], { turnsEach: 12 }, "clover");
const area = (owner: number, from: number, n = 6) => Object.fromEntries(Array.from({ length: n }, (_, k) => [`o${from + k}`, { owner, level: 1 }]));

describe("成套 (領地)", () => {
  it("one owner holding all six lots of an area is the set's owner", () => {
    const t = { ...table(), deeds: area(1, 1) };
    assert.equal(setOwnerOf(t, "o3"), 1);
    assert.equal(setOwnerOf(t, "o7"), null);
    assert.equal(setOwnerOf({ ...t, deeds: { ...t.deeds, o6: { owner: 2, level: 1 } } }, "o3"), null);
  });
  it("rent on a whole area is doubled", () => {
    const t = { ...table(), deeds: area(1, 1) };
    const after = reduceTable(t, { type: "roll", dice: [1, 2] });
    assert.ok(Math.abs(t.seats[0].cash - after.seats[0].cash - rentOf("o1", 1, "clover") * 2) < 1e-9);
  });
  it("buying the last lot of an area finishes the set", () => {
    const t = { ...table(), deeds: area(0, 1, 5) };
    const after = reduceTable(t, { type: "roll", dice: [6, 1] });
    assert.equal(after.deeds.o6?.owner, 0);
    assert.equal(setOwnerOf(after, "o1"), 0);
  });
});

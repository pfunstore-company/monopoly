import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIRST_ISLE_QUESTS, NO_ISLES, buyIsle, claimFirst, islePrice, parseIsles, questsDone, type Progress } from "./isles";

const all: Progress = { level: 99, rolls: 9999, city: 999, tables: 99, feeds: 999, dragon: 4 };
describe("領地嘅島", () => {
  it("first island: free, but only once its 成就 are done", () => {
    const half: Progress = { ...all, tables: FIRST_ISLE_QUESTS.find((q) => q.id === "tables")!.goal - 1 };
    assert.equal(questsDone(half), false);
    assert.deepEqual(claimFirst(NO_ISLES, "space", half).owned, []);
    assert.deepEqual(claimFirst(NO_ISLES, "space", all).owned, ["space"]);
  });
  it("later islands cost 能量, in order", () => {
    assert.equal(islePrice(0), 0);
    assert.equal(islePrice(1), 3_500_000);
    assert.equal(islePrice(2), 5_250_000);
    const ids = ["space", "two", "three"];
    assert.equal(buyIsle(NO_ISLES, ids, 1, 9e9).isles.owned.length, 0, "needs the first island");
    const one = { ...NO_ISLES, owned: ["space"] };
    assert.equal(buyIsle(one, ids, 1, 3_499_999).isles.owned.length, 1, "not enough 能量");
    const r = buyIsle(one, ids, 1, 4_000_000);
    assert.deepEqual(r.isles.owned, ["space", "two"]);
    assert.equal(r.energy, 500_000);
    assert.equal(buyIsle(r.isles, ids, 0, 9e9).isles.owned.length, 2, "the first is never bought");
  });
  it("reads saves safely", () => {
    assert.deepEqual(parseIsles({ owned: ["a", 3], tables: -1, feeds: 2.7 }), { owned: ["a"], tables: 0, feeds: 2, lv: -1 });
    assert.deepEqual(parseIsles(null), NO_ISLES);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOpen, levelOf, levelReward, xpFor, xpOf } from "./level";

describe("玩家等級", () => {
  it("counts experience from what you did", () => {
    assert.equal(xpOf({ rolls: 10, city: 2, tables: 1, feeds: 5 }), 10 + 30 + 40 + 5);
    assert.equal(xpOf({ rolls: -3, city: NaN, tables: 0, feeds: 0 }), 0);
  });
  it("levels up on a curve: Lv5 in 2–3 days, Lv10 in about a week, Lv15 in about two weeks", () => {
    const day = 60 + 5 * 15 + 20 + 20;
    assert.equal(levelOf(0).level, 1);
    assert.equal(levelOf(xpFor(5)).level, 5);
    assert.equal(levelOf(xpFor(5) - 1).level, 4);
    assert.ok(xpFor(5) / day > 1.5 && xpFor(5) / day < 3);
    assert.ok(xpFor(10) / day > 6 && xpFor(10) / day < 9);
    assert.ok(xpFor(15) / day > 13 && xpFor(15) / day < 17);
    const mid = levelOf(xpFor(7) + 5);
    assert.equal(mid.into, 5);
    assert.equal(mid.need, xpFor(8) - xpFor(7));
  });
  it("rewards and unlocks", () => {
    assert.deepEqual(levelReward(3), { coins: 15, dice: 5 });
    assert.equal(levelReward(10).dice, 10);
    assert.equal(isOpen("table", 4, false), false);
    assert.equal(isOpen("table", 5, false), true);
    assert.equal(isOpen("realm", 1, true), true);
  });
});

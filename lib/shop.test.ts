import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADS_PER_DAY, ODDS, PITY, adsLeft, convertMaterials, draw, newCollection, rollRarity, watchAd } from "./shop";

describe("商店", () => {
  it("odds add up to 100% and pity gives an SSR", () => {
    assert.equal(Object.values(ODDS).reduce((a, b) => a + b, 0), 100);
    assert.equal(rollRarity(0.99, PITY - 1), "SSR");
    assert.equal(rollRarity(0.005, 0), "SSR");
    assert.equal(rollRarity(0.99, 0), "N");
  });
  it("a ten-draw always holds an SR or better", () => {
    const out = draw(newCollection(), "hero", 10, () => 0.99);
    assert.ok(out.pulls.some((p) => p.rarity === "SR" || p.rarity === "SSR"));
    assert.equal(out.collection.sinceSSR.hero, 10);
  });
  it("every special draw is a 特別卡 and old materials convert once", () => {
    const count = (c: ReturnType<typeof newCollection>) => Object.values(c.specials).reduce((a, b) => a + (b ?? 0), 0);
    const start = newCollection();
    const out = draw(start, "special", 10, () => 0.5);
    assert.equal(out.pulls.length, 10);
    assert.ok(out.pulls.every((p) => p.prize.kind === "special"));
    assert.equal(count(out.collection) - count(start), 10);
    const conv = convertMaterials(newCollection(), { wood: 40, stone: 20, gold: 0 }, () => 0);
    assert.equal(conv.cards, 2);
    assert.equal(convertMaterials(conv.collection, { wood: 40, stone: 20, gold: 0 }, () => 0).cards, 0);
  });
  it("a duplicate character turns into shards", () => {
    const out = draw(newCollection(), "hero", 1, () => 0.2); // R → one of the four you already have
    assert.equal(out.pulls[0].duplicate, true);
    assert.equal(out.collection.shards, 5);
  });
  it("14 rewarded ads a day, then none until tomorrow", () => {
    let c = newCollection();
    for (let k = 0; k < ADS_PER_DAY; k++) c = watchAd(c, "2026-10-08")!;
    assert.equal(ADS_PER_DAY, 7);
    assert.equal(adsLeft(c, "2026-10-08", "double"), ADS_PER_DAY, "the board's 雙倍 ads count apart");
    assert.equal(watchAd(c, "2026-10-08"), null);
    assert.equal(adsLeft(c, "2026-10-09"), ADS_PER_DAY);
  });
});

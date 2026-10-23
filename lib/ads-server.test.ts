import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setup, guestAccount, userOf, type Sql } from "../supabase/functions/_shared/accounts.ts";
import { AD_LIMITS, SHOP_AD_ENERGY, adClaim, adStart, adsLeft, checkSave, derToRaw, setupAds, ssvReward, verifySsv } from "../supabase/functions/_shared/ads.ts";

function db(): Sql {
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(":memory:");
  return {
    async q(query: string, ...b: unknown[]) {
      const st = d.prepare(query);
      return /^\s*select/i.test(query) ? (st.all(...b) as Record<string, unknown>[]) : (st.run(...b), []);
    },
  };
}
const day = Date.UTC(2026, 9, 23, 12);
async function player() {
  const sql = db();
  await setup(sql);
  await setupAds(sql);
  const g = (await guestAccount(sql, day)) as unknown as { token: string };
  const u = (await userOf(sql, g.token))!;
  return { sql, id: u.id };
}
const nonceOf = (r: unknown) => (r as { nonce: string }).nonce;

describe("廣告由伺服器把關", () => {
  it("counts per day on the server, each code once", async () => {
    const { sql, id } = await player();
    for (let k = 0; k < AD_LIMITS.shop; k++) {
      const c = (await adClaim(sql, id, nonceOf(await adStart(sql, id, "shop", day)), day + 1000, false)) as unknown as { ok: boolean; energy: number };
      assert.ok(c.ok);
      assert.equal(c.energy, SHOP_AD_ENERGY);
    }
    assert.equal((await adStart(sql, id, "shop", day)).ok, false, "no more today");
    assert.equal(((await adsLeft(sql, id, day)) as unknown as { double: number }).double, AD_LIMITS.double, "double ads apart");
    assert.ok((await adStart(sql, id, "shop", day + 24 * 3600 * 1000)).ok, "next (server) day");
    const n = nonceOf(await adStart(sql, id, "double", day));
    assert.ok((await adClaim(sql, id, n, day, false)).ok);
    assert.equal((await adClaim(sql, id, n, day, false)).ok, false, "a code can't be used twice");
    assert.equal((await adClaim(sql, id + 1, nonceOf(await adStart(sql, id, "double", day)), day, false)).ok, false, "someone else's code");
  });
  it("with verification on, waits for Google", async () => {
    const { sql, id } = await player();
    const n = nonceOf(await adStart(sql, id, "shop", day));
    assert.equal(((await adClaim(sql, id, n, day, true)) as { error?: string }).error, "waiting");
    await ssvReward(sql, { transaction_id: "t1", custom_data: n, user_id: String(id) }, day);
    assert.ok((await adClaim(sql, id, n, day, true)).ok);
  });
  it("checks Google's signature", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const spki = Buffer.from(await crypto.subtle.exportKey("spki", pair.publicKey)).toString("base64");
    const content = "ad_network=5450213213286189855&ad_unit=1234&custom_data=abc&reward_amount=1&reward_item=Reward&timestamp=1&transaction_id=t9&user_id=7";
    const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(content)));
    // raw r‖s → DER, as Google sends it
    const int = (b: Uint8Array) => {
      let v = [...b];
      while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v = v.slice(1);
      if (v[0] & 0x80) v = [0, ...v];
      return [0x02, v.length, ...v];
    };
    const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
    const der = new Uint8Array([0x30, body.length, ...body]);
    assert.deepEqual([...derToRaw(der)!], [...raw]);
    const sig = Buffer.from(der).toString("base64url");
    const keys = [{ keyId: 42, base64: spki }];
    const ok = await verifySsv(`?${content}&signature=${sig}&key_id=42`, keys);
    assert.equal(ok?.user_id, "7");
    assert.equal(await verifySsv(`?${content.replace("t9", "t8")}&signature=${sig}&key_id=42`, keys), null, "changed");
    assert.equal(await verifySsv(`?${content}&signature=${sig}&key_id=1`, keys), null, "unknown key");
  });
  it("notes (only) saves whose 能量 jumps too far", async () => {
    const { sql, id } = await player();
    assert.equal(await checkSave(sql, id, { energy: 1_000_000, updated: day }, 2_000_000, day + 60_000), false);
    assert.equal(await checkSave(sql, id, { energy: 1_000_000, updated: day }, 90_000_000, day + 60_000), true);
  });
});

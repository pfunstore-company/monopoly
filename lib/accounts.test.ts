import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIREBASE_PROJECT, deleteAccount, deleteSelf, getSave, idSignIn, login, providerOf, putSave, register, setup, userOf, validName, verifyIdToken, type Sql } from "../supabase/functions/_shared/accounts.ts";

function db(): Sql {
  // node:sqlite (Node 22) through require, so the type check needs no sqlite types.
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(":memory:");
  return {
    async q(query: string, ...b: unknown[]) {
      const st = d.prepare(query);
      return /^\s*select/i.test(query) ? (st.all(...b) as Record<string, unknown>[]) : (st.run(...b), []);
    },
  };
}
const ok = (r: { ok: boolean }) => assert.ok(r.ok, JSON.stringify(r));

describe("帳號", () => {
  it("names", () => {
    assert.ok(validName("阿天123"));
    assert.ok(validName("Sky_1"));
    assert.ok(!validName("ab"));
    assert.ok(!validName("has space"));
  });
  it("register, log in, save, delete", async () => {
    const sql = db();
    await setup(sql);
    const r = await register(sql, "Sky", "secret1", 1);
    ok(r);
    assert.equal((await register(sql, "sky", "other12", 2)).ok, false, "names are unique, any case");
    assert.equal((await register(sql, "Bob", "123", 2)).ok, false, "password too short");
    const token = (r as unknown as { token: string }).token;
    assert.equal((await userOf(sql, token))?.name, "Sky");
    ok(await putSave(sql, 1, { a: "1" }, 5));
    assert.deepEqual((await getSave(sql, 1) as unknown as { data: unknown }).data, { a: "1" });
    assert.equal((await login(sql, "SKY", "wrong!!", 6)).ok, false);
    const l = await login(sql, "SKY", "secret1", 7);
    ok(l);
    assert.equal((await deleteAccount(sql, "Sky", "nope123", 8)).ok, false);
    ok(await deleteAccount(sql, "Sky", "secret1", 9));
    assert.equal(await userOf(sql, token), null, "sessions go with it");
    assert.equal((await getSave(sql, 1) as unknown as { data: unknown }).data, null, "and the save");
    ok(await register(sql, "Sky", "secret1", 10));
  });
  it("locks after ten wrong passwords", async () => {
    const sql = db();
    await setup(sql);
    await register(sql, "Lee", "secret1", 0);
    for (let k = 0; k < 10; k++) await login(sql, "Lee", "bad-pass", 1);
    const r = await login(sql, "Lee", "secret1", 2);
    assert.equal(r.ok, false);
    assert.equal((r as unknown as { error: string }).error, "locked");
    ok(await login(sql, "Lee", "secret1", 16 * 60 * 1000));
  });
});

describe("Google / Apple 登入", () => {
  const b64u = (x: string | Uint8Array) => Buffer.from(x).toString("base64url");
  async function maker() {
    const pair = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
    const make = async (claims: Record<string, unknown>, kid = "k1") => {
      const head = b64u(JSON.stringify({ alg: "RS256", kid }));
      const body = b64u(JSON.stringify(claims));
      const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
      return `${head}.${body}.${b64u(sig)}`;
    };
    return { jwk, make };
  }
  const now = 1_800_000_000_000;
  const good = (over: Record<string, unknown> = {}) => ({
    aud: FIREBASE_PROJECT,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT}`,
    sub: "uid-1",
    iat: now / 1000 - 10,
    exp: now / 1000 + 3000,
    name: "Sky Yung",
    firebase: { sign_in_provider: "google.com" },
    ...over,
  });
  it("checks the token", async () => {
    const { jwk, make } = await maker();
    assert.equal((await verifyIdToken(await make(good()), [jwk], now))?.sub, "uid-1");
    assert.equal(await verifyIdToken(await make(good({ aud: "other" })), [jwk], now), null, "other project");
    assert.equal(await verifyIdToken(await make(good({ exp: now / 1000 - 999 })), [jwk], now), null, "expired");
    assert.equal(await verifyIdToken(await make(good({ firebase: { sign_in_provider: "password" } })), [jwk], now), null, "not Google/Apple");
    assert.equal(await verifyIdToken(await make(good(), "k2"), [jwk], now), null, "unknown key");
    const t = await make(good());
    assert.equal(await verifyIdToken(t.slice(0, -4) + "AAAA", [jwk], now), null, "bad signature");
  });
  it("makes the account once, then signs back in; deleting removes it", async () => {
    const sql = db();
    await setup(sql);
    const first = (await idSignIn(sql, { sub: "uid-1", provider: "apple.com", name: "Sky Yung" }, 1)) as unknown as { ok: boolean; token: string; name: string; fresh: boolean };
    assert.ok(first.ok && first.fresh);
    assert.equal(first.name, "Sky Yung");
    const again = (await idSignIn(sql, { sub: "uid-1", provider: "apple.com" }, 2)) as unknown as { token: string; fresh: boolean };
    assert.equal(again.fresh, false);
    const u = await userOf(sql, again.token);
    assert.equal(await providerOf(sql, u!.id), "apple.com");
    assert.equal((await login(sql, "id:uid-1", "", 3)).ok, false, "no password sign-in for these");
    ok(await deleteSelf(sql, u!.id));
    assert.equal(await userOf(sql, again.token), null);
    const back = (await idSignIn(sql, { sub: "uid-1", provider: "apple.com" }, 4)) as unknown as { fresh: boolean };
    assert.equal(back.fresh, true, "a new account after deleting");
    const anon = (await idSignIn(sql, { sub: "uid-2", provider: "google.com" }, 5)) as unknown as { name: string };
    assert.match(anon.name, /^玩家\d{4}$/);
  });
});

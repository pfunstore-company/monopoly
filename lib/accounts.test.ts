import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteAccount, getSave, login, putSave, register, setup, userOf, validName, type Sql } from "../worker/accounts";

function db(): Sql {
  // node:sqlite (Node 22) through require, so the type check needs no sqlite types.
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(":memory:");
  return {
    exec(query: string, ...b: unknown[]) {
      const st = d.prepare(query);
      const isRead = /^\s*select/i.test(query);
      const rows: Record<string, unknown>[] = isRead ? st.all(...b) : (st.run(...b), []);
      return { toArray: () => rows };
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
    setup(sql);
    const r = await register(sql, "Sky", "secret1", 1);
    ok(r);
    assert.equal((await register(sql, "sky", "other12", 2)).ok, false, "names are unique, any case");
    assert.equal((await register(sql, "Bob", "123", 2)).ok, false, "password too short");
    const token = (r as unknown as { token: string }).token;
    assert.equal((await userOf(sql, token))?.name, "Sky");
    ok(putSave(sql, 1, { a: "1" }, 5));
    assert.deepEqual((getSave(sql, 1) as unknown as { data: unknown }).data, { a: "1" });
    assert.equal((await login(sql, "SKY", "wrong!!", 6)).ok, false);
    const l = await login(sql, "SKY", "secret1", 7);
    ok(l);
    assert.equal((await deleteAccount(sql, "Sky", "nope123", 8)).ok, false);
    ok(await deleteAccount(sql, "Sky", "secret1", 9));
    assert.equal(await userOf(sql, token), null, "sessions go with it");
    assert.equal((getSave(sql, 1) as unknown as { data: unknown }).data, null, "and the save");
    ok(await register(sql, "Sky", "secret1", 10));
  });
  it("locks after ten wrong passwords", async () => {
    const sql = db();
    setup(sql);
    await register(sql, "Lee", "secret1", 0);
    for (let k = 0; k < 10; k++) await login(sql, "Lee", "bad-pass", 1);
    const r = await login(sql, "Lee", "secret1", 2);
    assert.equal(r.ok, false);
    assert.equal((r as unknown as { error: string }).error, "locked");
    ok(await login(sql, "Lee", "secret1", 16 * 60 * 1000));
  });
});

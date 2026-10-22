/**
 * 帳號 (Sky 2026-10-22): player accounts with a name and password, a cloud save per account, and deleting an
 * account (App Store and Google Play both require it once players can make accounts). Pure logic over a small
 * SQL interface, so the same code runs in the Cloudflare Durable Object and in the tests.
 */
export type Sql = { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] } };

export const NAME_MIN = 3;
export const NAME_MAX = 16;
export const PASSWORD_MIN = 6;
export const SAVE_MAX = 512 * 1024;
const ITERATIONS = 100_000;
const LOCK_AFTER = 10;
const LOCK_MS = 15 * 60 * 1000;

export type Result = { ok: true; [k: string]: unknown } | { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Result => ({ ok: false, error, status });

export function setup(sql: Sql): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS saves (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)`);
}

const NAME_CHARS = new RegExp("^[\\p{L}\\p{N}_]+$", "u");
/** Letters (any language), numbers and _ ; 3–16 long. */
export function validName(name: unknown): name is string {
  return typeof name === "string" && name.length >= NAME_MIN && name.length <= NAME_MAX && NAME_CHARS.test(name);
}
const keyOf = (name: string) => name.normalize("NFKC").toLowerCase();

const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256));
}
async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function newSession(sql: Sql, userId: number, now: number): Promise<string> {
  const token = randomHex(32);
  sql.exec(`INSERT INTO sessions (token_hash, user_id, created) VALUES (?, ?, ?)`, await sha256(token), userId, now);
  return token;
}

export async function register(sql: Sql, name: unknown, password: unknown, now: number): Promise<Result> {
  if (!validName(name)) return fail("bad-name");
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > 128) return fail("bad-password");
  if (sql.exec(`SELECT id FROM users WHERE name_key = ?`, keyOf(name)).toArray().length) return fail("name-taken", 409);
  const salt = randomHex(16);
  sql.exec(`INSERT INTO users (name, name_key, salt, hash, created) VALUES (?, ?, ?, ?, ?)`, name, keyOf(name), salt, await hashPassword(password, salt), now);
  const id = Number(sql.exec(`SELECT id FROM users WHERE name_key = ?`, keyOf(name)).toArray()[0].id);
  return { ok: true, token: await newSession(sql, id, now), name };
}

/** The account for a name and password (with a lock after too many wrong tries), or a failure. */
async function check(sql: Sql, name: unknown, password: unknown, now: number): Promise<Result & { id?: number }> {
  if (typeof name !== "string" || typeof password !== "string") return fail("wrong", 401);
  const row = sql.exec(`SELECT id, name, salt, hash, fails, locked_until FROM users WHERE name_key = ?`, keyOf(name)).toArray()[0];
  if (!row) return fail("wrong", 401);
  if (Number(row.locked_until) > now) return fail("locked", 429);
  if (!same(await hashPassword(password, String(row.salt)), String(row.hash))) {
    const fails = Number(row.fails) + 1;
    sql.exec(`UPDATE users SET fails = ?, locked_until = ? WHERE id = ?`, fails >= LOCK_AFTER ? 0 : fails, fails >= LOCK_AFTER ? now + LOCK_MS : 0, row.id);
    return fail("wrong", 401);
  }
  sql.exec(`UPDATE users SET fails = 0, locked_until = 0 WHERE id = ?`, row.id);
  return { ok: true, id: Number(row.id), name: String(row.name) };
}

export async function login(sql: Sql, name: unknown, password: unknown, now: number): Promise<Result> {
  const who = await check(sql, name, password, now);
  if (!who.ok) return who;
  return { ok: true, token: await newSession(sql, who.id!, now), name: who.name };
}

/** The user behind a session token. */
export async function userOf(sql: Sql, token: string | null): Promise<{ id: number; name: string; created: number } | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = sql.exec(`SELECT u.id, u.name, u.created FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, await sha256(token)).toArray()[0];
  return row ? { id: Number(row.id), name: String(row.name), created: Number(row.created) } : null;
}

export async function logout(sql: Sql, token: string | null): Promise<Result> {
  if (token) sql.exec(`DELETE FROM sessions WHERE token_hash = ?`, await sha256(token));
  return { ok: true };
}

export function getSave(sql: Sql, userId: number): Result {
  const row = sql.exec(`SELECT data, updated FROM saves WHERE user_id = ?`, userId).toArray()[0];
  return { ok: true, data: row ? JSON.parse(String(row.data)) : null, updated: row ? Number(row.updated) : 0 };
}

export function putSave(sql: Sql, userId: number, data: unknown, now: number): Result {
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("bad-save");
  const text = JSON.stringify(data);
  if (text.length > SAVE_MAX) return fail("too-big", 413);
  sql.exec(`INSERT INTO saves (user_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated`, userId, text, now);
  return { ok: true, updated: now };
}

function wipe(sql: Sql, userId: number): void {
  sql.exec(`DELETE FROM sessions WHERE user_id = ?`, userId);
  sql.exec(`DELETE FROM saves WHERE user_id = ?`, userId);
  sql.exec(`DELETE FROM users WHERE id = ?`, userId);
}

/** 刪除帳號: the account, its sessions and its save, for good. Needs the password again (in the app or on the web page). */
export async function deleteAccount(sql: Sql, name: unknown, password: unknown, now: number): Promise<Result> {
  const who = await check(sql, name, password, now);
  if (!who.ok) return who;
  wipe(sql, who.id!);
  return { ok: true, deleted: true };
}

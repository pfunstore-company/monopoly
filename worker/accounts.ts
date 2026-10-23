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
  // Google / Apple sign-in (through Firebase): one row per Firebase user, pointing at their account.
  sql.exec(`CREATE TABLE IF NOT EXISTS links (uid TEXT PRIMARY KEY, provider TEXT NOT NULL, user_id INTEGER NOT NULL, created INTEGER NOT NULL)`);
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
  if (!row || !row.hash) return fail("wrong", 401);
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
  sql.exec(`DELETE FROM links WHERE user_id = ?`, userId);
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

/** 刪除帳號 for a signed-in player (Google / Apple accounts have no password to ask for). */
export function deleteSelf(sql: Sql, userId: number): Result {
  wipe(sql, userId);
  return { ok: true, deleted: true };
}

// ---- Google / Apple sign-in (Sky 2026-10-23) ----
// The app signs the player in with Google or Apple through Firebase Authentication and sends us the Firebase ID
// token; we check Google's signature on it and that it was made for our Firebase project, then sign them in here.
export const FIREBASE_PROJECT = "boolionaire-4f7b5";
export const FIREBASE_KEYS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
export type IdClaims = { sub: string; provider: string; name?: string };

const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

/** The checked claims of a Firebase ID token, or null. `keys` are Google's current signing keys (JWK). */
export async function verifyIdToken(token: unknown, keys: (JsonWebKey & { kid?: string })[], nowMs: number): Promise<IdClaims | null> {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    const body = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
    if (head.alg !== "RS256") return null;
    const jwk = keys.find((k) => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!good) return null;
    const now = Math.floor(nowMs / 1000);
    if (body.aud !== FIREBASE_PROJECT || body.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT}`) return null;
    if (typeof body.exp !== "number" || body.exp < now - 60 || typeof body.iat !== "number" || body.iat > now + 300) return null;
    if (typeof body.sub !== "string" || !body.sub || body.sub.length > 128) return null;
    const provider = String(body.firebase?.sign_in_provider ?? "");
    if (provider !== "google.com" && provider !== "apple.com") return null;
    return { sub: body.sub, provider, name: typeof body.name === "string" ? body.name : undefined };
  } catch {
    return null;
  }
}

/** A display name for a new Google / Apple account: their own name if given, else 玩家 + 4 digits. */
function displayName(name: string | undefined): string {
  const clean = (name ?? "").replace(/[^\p{L}\p{N}_ ]/gu, "").trim().slice(0, NAME_MAX);
  return clean || `玩家${1000 + Math.floor(Math.random() * 9000)}`;
}

/** Sign in with checked Google / Apple claims; the first time makes the account. */
export async function idSignIn(sql: Sql, who: IdClaims, now: number): Promise<Result> {
  let link = sql.exec(`SELECT user_id FROM links WHERE uid = ?`, who.sub).toArray()[0];
  let fresh = false;
  if (!link) {
    const name = displayName(who.name);
    // name_key "id:<uid>" can never clash with a typed name (":" isn't allowed there); no password.
    sql.exec(`INSERT INTO users (name, name_key, salt, hash, created) VALUES (?, ?, '', '', ?)`, name, `id:${who.sub}`, now);
    const id = Number(sql.exec(`SELECT id FROM users WHERE name_key = ?`, `id:${who.sub}`).toArray()[0].id);
    sql.exec(`INSERT INTO links (uid, provider, user_id, created) VALUES (?, ?, ?, ?)`, who.sub, who.provider, id, now);
    link = { user_id: id };
    fresh = true;
  }
  const id = Number(link.user_id);
  const row = sql.exec(`SELECT name FROM users WHERE id = ?`, id).toArray()[0];
  if (!row) return fail("wrong", 401);
  return { ok: true, token: await newSession(sql, id, now), name: String(row.name), provider: who.provider, fresh };
}

/** How the account signs in: "google.com", "apple.com" or "password". */
export function providerOf(sql: Sql, userId: number): string {
  return String(sql.exec(`SELECT provider FROM links WHERE user_id = ?`, userId).toArray()[0]?.provider ?? "password");
}

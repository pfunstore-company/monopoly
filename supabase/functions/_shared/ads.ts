/**
 * 廣告獎勵由伺服器把關 (Sky 2026-10-23): the server counts each player's rewarded ads per (UTC) day, so changing the
 * phone's clock does nothing, and — once REQUIRE_SSV is on — gives a reward only after Google itself tells us the
 * ad was watched (AdMob server-side verification, signed with Google's keys). Every reward lands in a ledger.
 */
import type { Result, Sql } from "./accounts.ts";

/** Testing uses Google's sample ad units, which never call our server; turn this on with the real units. */
export const REQUIRE_SSV = false;
export const AD_LIMITS = { shop: 5, double: 7 } as const;
export type AdKind = keyof typeof AD_LIMITS;
/** What one shop ad gives, in 能量 (the board's double ad doubles a landing instead). */
export const SHOP_AD_ENERGY = 15_000;
export const SSV_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const PENDING_MS = 30 * 60 * 1000;

const fail = (error: string, status = 400): Result => ({ ok: false, error, status });
export const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

/** SQLite tables (the Durable Object and the tests); Supabase gets its tables from supabase/schema.sql. */
export async function setupAds(sql: Sql): Promise<void> {
  await sql.q(`CREATE TABLE IF NOT EXISTS ad_claims (nonce TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL,
    created INTEGER NOT NULL, status TEXT NOT NULL, txn TEXT)`);
  await sql.q(`CREATE INDEX IF NOT EXISTS ad_claims_user_day ON ad_claims (user_id, day)`);
  await sql.q(`CREATE TABLE IF NOT EXISTS ssv_txns (txn TEXT PRIMARY KEY, created INTEGER NOT NULL)`);
  await sql.q(`CREATE TABLE IF NOT EXISTS grants (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, energy INTEGER NOT NULL, created INTEGER NOT NULL)`);
  await sql.q(`CREATE TABLE IF NOT EXISTS save_flags (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created INTEGER NOT NULL, detail TEXT NOT NULL)`);
}

const isKind = (k: unknown): k is AdKind => k === "shop" || k === "double";

async function used(sql: Sql, userId: number, kind: AdKind, day: string): Promise<number> {
  return Number((await sql.q(`SELECT COUNT(*) AS n FROM ad_claims WHERE user_id = ? AND kind = ? AND day = ? AND status = 'claimed'`, userId, kind, day))[0].n);
}

/** Ads left today for both kinds. */
export async function adsLeft(sql: Sql, userId: number, now: number): Promise<Result> {
  const day = dayOf(now);
  return { ok: true, shop: AD_LIMITS.shop - await used(sql, userId, "shop", day), double: AD_LIMITS.double - await used(sql, userId, "double", day), day };
}

/** Before showing an ad: a one-time code that goes with it to Google and back. */
export async function adStart(sql: Sql, userId: number, kind: unknown, now: number): Promise<Result> {
  if (!isKind(kind)) return fail("bad-kind");
  const day = dayOf(now);
  if (await used(sql, userId, kind, day) >= AD_LIMITS[kind]) return fail("limit", 429);
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await sql.q(`DELETE FROM ad_claims WHERE status = 'pending' AND created < ?`, now - PENDING_MS);
  await sql.q(`INSERT INTO ad_claims (nonce, user_id, kind, day, created, status) VALUES (?, ?, ?, ?, ?, 'pending')`, nonce, userId, kind, day, now);
  return { ok: true, nonce, uid: String(userId), ssv: REQUIRE_SSV };
}

/** After the ad: the reward, once Google has confirmed it (when REQUIRE_SSV). */
export async function adClaim(sql: Sql, userId: number, nonce: unknown, now: number, requireSsv = REQUIRE_SSV): Promise<Result> {
  if (typeof nonce !== "string") return fail("bad-nonce");
  const row = (await sql.q(`SELECT kind, day, status, created FROM ad_claims WHERE nonce = ? AND user_id = ?`, nonce, userId))[0];
  if (!row || now - Number(row.created) > PENDING_MS) return fail("bad-nonce", 404);
  if (row.status === "claimed") return fail("used", 409);
  if (requireSsv && row.status !== "rewarded") return fail("waiting", 202);
  const kind = String(row.kind) as AdKind;
  // Counted on the day the ad started, so a claim just after midnight still counts for that day.
  if (await used(sql, userId, kind, String(row.day)) >= AD_LIMITS[kind]) return fail("limit", 429);
  await sql.q(`UPDATE ad_claims SET status = 'claimed' WHERE nonce = ?`, nonce);
  const energy = kind === "shop" ? SHOP_AD_ENERGY : 0;
  await sql.q(`INSERT INTO grants (user_id, kind, energy, created) VALUES (?, ?, ?, ?)`, userId, `ad-${kind}`, energy, now);
  return { ok: true, kind, energy, left: AD_LIMITS[kind] - await used(sql, userId, kind, String(row.day)) };
}

// ---- AdMob server-side verification ----
type SsvKey = { keyId: number | string; base64: string };
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

/** An ECDSA signature in DER (what Google sends) as the raw r‖s that WebCrypto checks. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (der[0] !== 0x30) return null;
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const part = (): Uint8Array | null => {
    if (der[i] !== 0x02) return null;
    const len = der[i + 1];
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) return null;
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = part();
  const s = part();
  if (!r || !s) return null;
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/** Check Google's signature on an SSV callback's query string. Returns its fields, or null. */
export async function verifySsv(query: string, keys: SsvKey[]): Promise<Record<string, string> | null> {
  const q = query.replace(/^\?/, "");
  const at = q.indexOf("&signature=");
  if (at < 0) return null;
  const content = q.slice(0, at);
  const params = new URLSearchParams(q);
  const sig = params.get("signature");
  const keyId = params.get("key_id");
  const key = keys.find((k) => String(k.keyId) === keyId);
  if (!sig || !key) return null;
  try {
    const pub = await crypto.subtle.importKey("spki", unb64(key.base64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const raw = derToRaw(unb64(sig));
    if (!raw) return null;
    const good = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, raw, new TextEncoder().encode(content));
    return good ? Object.fromEntries(params.entries()) : null;
  } catch {
    return null;
  }
}

/** Google says this ad was watched: mark the matching code as rewarded (each transaction once). */
export async function ssvReward(sql: Sql, fields: Record<string, string>, now: number): Promise<Result> {
  const txn = fields.transaction_id;
  const nonce = fields.custom_data;
  const userId = Number(fields.user_id);
  if (!txn || !nonce || !Number.isInteger(userId)) return fail("bad-ssv");
  if ((await sql.q(`SELECT txn FROM ssv_txns WHERE txn = ?`, txn)).length) return { ok: true, repeat: true };
  await sql.q(`INSERT INTO ssv_txns (txn, created) VALUES (?, ?)`, txn, now);
  await sql.q(`UPDATE ad_claims SET status = 'rewarded', txn = ? WHERE nonce = ? AND user_id = ? AND status = 'pending'`, txn, nonce, userId);
  return { ok: true };
}

// ---- 可疑存檔 ----
/** The board's 能量 in a cloud save (coins × 1,000). */
export function saveEnergy(data: unknown): number | null {
  try {
    const raw = (data as Record<string, string>)["dafuweng-daily-board-v4"];
    const points = JSON.parse(raw)?.state?.points;
    return typeof points === "number" ? points * 1000 : null;
  } catch {
    return null;
  }
}
/** Most a player could plausibly gain between two saves, besides what the server itself granted. */
export const PLAUSIBLE_BASE = 3_000_000;
export const PLAUSIBLE_PER_HOUR = 2_000_000;

/** Note (never block) a save whose 能量 jumped more than play could explain; Sky can look at these later. */
export async function checkSave(sql: Sql, userId: number, before: { energy: number | null; updated: number } | null, after: number | null, now: number): Promise<boolean> {
  if (!before || before.energy === null || after === null) return false;
  const granted = Number((await sql.q(`SELECT COALESCE(SUM(energy), 0) AS e FROM grants WHERE user_id = ? AND created > ?`, userId, before.updated))[0].e);
  const hours = Math.max(0, (now - before.updated) / 3_600_000);
  const allowed = PLAUSIBLE_BASE + hours * PLAUSIBLE_PER_HOUR + granted;
  const gain = after - before.energy;
  if (gain <= allowed) return false;
  await sql.q(`INSERT INTO save_flags (user_id, created, detail) VALUES (?, ?, ?)`, userId, now, JSON.stringify({ from: before.energy, to: after, hours: Math.round(hours * 10) / 10, granted }));
  return true;
}

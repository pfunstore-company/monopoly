/**
 * 遊戲伺服器 (Sky 2026-10-22; moved to Supabase 2026-10-23): every /api/… call, the same whether it runs as the
 * Supabase Edge Function "api" (Postgres) or in the old Cloudflare Durable Object (SQLite).
 */
import { SSV_KEYS_URL, adClaim, adStart, adsLeft, checkSave, saveEnergy, ssvReward, verifySsv } from "./ads.ts";
import {
  FIREBASE_KEYS_URL,
  deleteAccount,
  deleteSelf,
  getSave,
  guestAccount,
  idSignIn,
  login,
  logout,
  providerOf,
  putSave,
  register,
  userOf,
  verifyIdToken,
  type Result,
  type Sql,
} from "./accounts.ts";

// Google's signing keys for Firebase ID tokens, kept until they say they expire.
let keyCache: { keys: JsonWebKey[]; until: number } | null = null;
async function firebaseKeys(now: number): Promise<JsonWebKey[]> {
  if (keyCache && keyCache.until > now) return keyCache.keys;
  const r = await fetch(FIREBASE_KEYS_URL);
  const keys = ((await r.json()) as { keys?: JsonWebKey[] }).keys ?? [];
  const age = Number(/max-age=(\d+)/.exec(r.headers.get("Cache-Control") ?? "")?.[1] ?? 3600);
  keyCache = { keys, until: now + Math.min(age, 6 * 3600) * 1000 };
  return keys;
}

// Google's AdMob reward-signing keys.
let ssvCache: { keys: { keyId: number | string; base64: string }[]; until: number } | null = null;
async function ssvKeys(now: number) {
  if (ssvCache && ssvCache.until > now) return ssvCache.keys;
  const keys = ((await (await fetch(SSV_KEYS_URL)).json()) as { keys?: { keyId: number | string; base64: string }[] }).keys ?? [];
  ssvCache = { keys, until: now + 6 * 3600 * 1000 };
  return keys;
}

/** The app's pages call this from their own address, so every answer says any page may read it (no cookies used). */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });

/** `path` is what follows /api/ (e.g. "save", "ad/start"). */
export async function handle(req: Request, sql: Sql, path: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const now = Date.now();
  let body: Record<string, unknown> = {};
  if (req.method === "POST" || req.method === "PUT") {
    try {
      const text = await req.text();
      if (text.length > 600 * 1024) return json({ ok: false, error: "too-big" }, 413);
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ ok: false, error: "bad-json" }, 400);
    }
  }
  // The token comes in the Authorization header, or in the body for the save sent as the app is put away
  // (a plain request the browser can send without asking first).
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "") || (typeof body.token === "string" ? body.token : null);
  const send = (r: Result) => json(r, r.ok ? 200 : r.status);
  try {
    // Google calls this after a player watches a rewarded ad (AdMob server-side verification).
    if (req.method === "GET" && path === "admob-ssv") {
      const fields = await verifySsv(url.search, await ssvKeys(now));
      if (!fields) return json({ ok: false, error: "bad-signature" }, 400);
      return send((await ssvReward(sql, fields, now)).ok ? { ok: true } : { ok: true, ignored: true });
    }
    if (req.method === "POST" && path === "guest") return send(await guestAccount(sql, now));
    if (req.method === "POST" && path === "register") return send(await register(sql, body.name, body.password, now));
    if (req.method === "POST" && path === "login") return send(await login(sql, body.name, body.password, now));
    // The web page for deleting an account (Google Play asks for one outside the app).
    if (req.method === "POST" && path === "delete" && body.idToken === undefined) return send(await deleteAccount(sql, body.name, body.password, now));
    // Google / Apple sign-in, and the web delete page for a Google account.
    if (req.method === "POST" && (path === "id-signin" || path === "delete")) {
      const who = await verifyIdToken(body.idToken, await firebaseKeys(now), now);
      if (!who) return json({ ok: false, error: "bad-token" }, 401);
      const r = await idSignIn(sql, who, now);
      if (path === "id-signin" || !r.ok) return send(r);
      const u = await userOf(sql, String(r.token));
      return send(u ? await deleteSelf(sql, u.id) : { ok: false, error: "wrong", status: 401 });
    }
    const user = await userOf(sql, token);
    if (!user) return json({ ok: false, error: "signed-out" }, 401);
    if (req.method === "GET" && path === "me") return json({ ok: true, name: user.name, created: user.created, provider: await providerOf(sql, user.id) });
    if (req.method === "POST" && path === "delete-me") return send(await deleteSelf(sql, user.id));
    if (req.method === "POST" && path === "logout") return send(await logout(sql, token));
    if (req.method === "GET" && path === "save") return send(await getSave(sql, user.id));
    if ((req.method === "PUT" || req.method === "POST") && path === "save") {
      const prev = (await getSave(sql, user.id)) as { data?: unknown; updated?: number };
      await checkSave(sql, user.id, prev.data ? { energy: saveEnergy(prev.data), updated: Number(prev.updated) } : null, saveEnergy(body.data), now);
      return send(await putSave(sql, user.id, body.data, now));
    }
    if (req.method === "GET" && path === "ad/left") return send(await adsLeft(sql, user.id, now));
    if (req.method === "POST" && path === "ad/start") return send(await adStart(sql, user.id, body.kind, now));
    if (req.method === "POST" && path === "ad/claim") return send(await adClaim(sql, user.id, body.nonce, now));
    return json({ ok: false, error: "not-found" }, 404);
  } catch (e) {
    return json({ ok: false, error: "server", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}

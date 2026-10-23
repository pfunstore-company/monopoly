/**
 * The site's worker (Sky 2026-10-22): /api/* goes to the accounts Durable Object (SQLite, created by
 * `wrangler deploy` itself — no database to set up by hand); everything else is the static game in ./out.
 */
import { FIREBASE_KEYS_URL, deleteAccount, deleteSelf, getSave, idSignIn, login, logout, providerOf, putSave, register, setup, userOf, verifyIdToken, type Result, type Sql } from "./accounts";

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

type Env = { ASSETS: { fetch(req: Request): Promise<Response> }; ACCOUNTS: { idFromName(n: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } } };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      // One accounts store for everyone (plenty while the game is small).
      const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName("all"));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};

export class Accounts {
  sql: Sql;
  constructor(state: { storage: { sql: Sql } }) {
    this.sql = state.storage.sql;
    setup(this.sql);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\//, "");
    const now = Date.now();
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "") || null;
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
    const send = (r: Result) => json(r, r.ok ? 200 : r.status);
    try {
      if (req.method === "POST" && path === "register") return send(await register(this.sql, body.name, body.password, now));
      if (req.method === "POST" && path === "login") return send(await login(this.sql, body.name, body.password, now));
      // The web page for deleting an account (Google Play asks for one outside the app).
      if (req.method === "POST" && path === "delete" && body.idToken === undefined) return send(await deleteAccount(this.sql, body.name, body.password, now));
      // Google / Apple sign-in, and the web delete page for a Google account.
      if (req.method === "POST" && (path === "id-signin" || path === "delete")) {
        const who = await verifyIdToken(body.idToken, await firebaseKeys(now), now);
        if (!who) return json({ ok: false, error: "bad-token" }, 401);
        const r = await idSignIn(this.sql, who, now);
        if (path === "id-signin" || !r.ok) return send(r);
        const u = await userOf(this.sql, String(r.token));
        return send(u ? deleteSelf(this.sql, u.id) : { ok: false, error: "wrong", status: 401 });
      }
      const user = await userOf(this.sql, token);
      if (!user) return json({ ok: false, error: "signed-out" }, 401);
      if (req.method === "GET" && path === "me") return json({ ok: true, name: user.name, created: user.created, provider: providerOf(this.sql, user.id) });
      if (req.method === "POST" && path === "delete-me") return send(deleteSelf(this.sql, user.id));
      if (req.method === "POST" && path === "logout") return send(await logout(this.sql, token));
      if (req.method === "GET" && path === "save") return send(getSave(this.sql, user.id));
      if (req.method === "PUT" && path === "save") return send(putSave(this.sql, user.id, body.data, now));
      return json({ ok: false, error: "not-found" }, 404);
    } catch (e) {
      return json({ ok: false, error: "server", detail: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
}

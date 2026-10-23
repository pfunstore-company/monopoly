/**
 * The site's worker (Sky 2026-10-22): /api/* goes to the accounts Durable Object (SQLite, created by
 * `wrangler deploy` itself — no database to set up by hand); everything else is the static game in ./out.
 * 2026-10-23: the server moves to Supabase (supabase/functions/api); this one keeps answering until the switch, with
 * the same code (supabase/functions/_shared), plus a one-off export of everything for the move.
 */
import { setupAds } from "../supabase/functions/_shared/ads.ts";
import { setup, type Sql } from "../supabase/functions/_shared/accounts.ts";
import { handle } from "../supabase/functions/_shared/router.ts";

type Env = { ASSETS: { fetch(req: Request): Promise<Response> }; ACCOUNTS: { idFromName(n: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } } };
type DoSql = { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] } };

/** SHA-256 of the one-off key for the move to Supabase (the key itself is only on Sky's Mac). */
const MIGRATE_KEY_HASH = "85581890130408ba6595ddb7198face91b5aeebe87e8167fc184a41584a427d6";
const TABLES = ["users", "sessions", "saves", "links", "ad_claims", "ssv_txns", "grants", "save_flags"];

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

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export class Accounts {
  sql: Sql;
  raw: DoSql;
  ready: Promise<void>;
  constructor(state: { storage: { sql: DoSql } }) {
    this.raw = state.storage.sql;
    this.sql = { q: async (query, ...b) => this.raw.exec(query, ...b).toArray() };
    this.ready = setup(this.sql).then(() => setupAds(this.sql));
  }

  async fetch(req: Request): Promise<Response> {
    await this.ready;
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\//, "");
    if (req.method === "GET" && path === "migrate-export") {
      const key = req.headers.get("X-Migrate-Key") ?? "";
      if (!key || hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))) !== MIGRATE_KEY_HASH) {
        return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 });
      }
      const out: Record<string, unknown[]> = {};
      for (const t of TABLES) out[t] = this.raw.exec(`SELECT * FROM ${t}`).toArray();
      return new Response(JSON.stringify({ ok: true, tables: out }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    return handle(req, this.sql, path);
  }
}

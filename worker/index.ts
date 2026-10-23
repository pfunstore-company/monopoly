/**
 * The site's worker (Sky 2026-10-22): /api/* goes to the accounts Durable Object (SQLite, created by
 * `wrangler deploy` itself — no database to set up by hand); everything else is the static game in ./out.
 * 2026-10-23: the game now uses the Supabase server (supabase/functions/api) and the data has moved there. This old
 * one only stays as a fallback with the same code (supabase/functions/_shared); its one-off export is gone.
 */
import { setupAds } from "../supabase/functions/_shared/ads.ts";
import { setup, type Sql } from "../supabase/functions/_shared/accounts.ts";
import { handle } from "../supabase/functions/_shared/router.ts";

type Env = { ASSETS: { fetch(req: Request): Promise<Response> }; ACCOUNTS: { idFromName(n: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } } };
type DoSql = { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] } };

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
  raw: DoSql;
  ready: Promise<void>;
  constructor(state: { storage: { sql: DoSql } }) {
    this.raw = state.storage.sql;
    this.sql = { q: async (query, ...b) => this.raw.exec(query, ...b).toArray() };
    this.ready = setup(this.sql).then(() => setupAds(this.sql));
  }

  async fetch(req: Request): Promise<Response> {
    await this.ready;
    const path = new URL(req.url).pathname.replace(/^\/api\//, "");
    return handle(req, this.sql, path);
  }
}

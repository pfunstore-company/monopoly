/**
 * 遊戲伺服器 on Supabase (Sky 2026-10-23): the Edge Function "api" — every /api/… call of the game, over the
 * project's own Postgres (tables in the private schema "game", see supabase/schema.sql). Deployed from Sky's Mac
 * by scripts/supabase.mjs. Address: https://vszyjyoatqryctuldarb.supabase.co/functions/v1/api/<path>
 */
import postgres from "npm:postgres@3.4.5";
import type { Sql } from "../_shared/accounts.ts";
import { handle } from "../_shared/router.ts";

const pg = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20, connection: { search_path: "game" } });

/** The shared code writes SQLite-style "?" placeholders; Postgres wants $1, $2, … */
const sql: Sql = {
  async q(query, ...bindings) {
    let n = 0;
    const text = query.replace(/\?/g, () => `$${++n}`);
    const rows = await pg.unsafe(text, bindings as never[]);
    return [...rows] as Record<string, unknown>[];
  },
};

Deno.serve((req) => {
  const path = new URL(req.url).pathname.replace(/^\/(functions\/v1\/)?api\/?/, "");
  return handle(req, sql, path);
});

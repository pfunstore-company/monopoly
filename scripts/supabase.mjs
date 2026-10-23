// Supabase (Sky 2026-10-23): after each web deploy on Sky's Mac, bring the company's Supabase project
// "boolionaire" up to date — the tables (supabase/schema.sql) and the server (Edge Function "api") — when they
// changed. Uses this Mac's key in ~/monopoly-inbox/supabase/token.txt (put there by Sky; read only to call
// Supabase, never printed or copied). The one-off move of the old server's data runs when supabase/migrate-now
// exists. Progress: ~/monopoly-inbox/supabase/status.txt and deploy.log.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") process.exit(0);
const REF = "vszyjyoatqryctuldarb";
const API = `https://${REF}.supabase.co/functions/v1/api`;
const OLD = "https://monopoly.zbs-yung.workers.dev/api";
const DIR = join(homedir(), "monopoly-inbox", "supabase");
const statePath = join(DIR, "state.json");
const logPath = join(DIR, "deploy.log");
const status = (s) => writeFileSync(join(DIR, "status.txt"), `${new Date().toISOString()} ${s}\n`);
const log = (s) => appendFileSync(logPath, `${new Date().toISOString()} ${s}\n`);
const notes = [];
try {
  const token = existsSync(join(DIR, "token.txt")) ? readFileSync(join(DIR, "token.txt"), "utf8").trim() : "";
  if (!token.startsWith("sbp_")) {
    status("WAITING: no key in token.txt");
    process.exit(0);
  }
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
  const query = async (sql) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`query ${r.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : [];
  };
  const hash = (paths) => {
    const h = createHash("sha256");
    for (const p of paths) h.update(p).update(readFileSync(p));
    return h.digest("hex");
  };
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])).sort();

  // 1. Tables.
  const schemaHash = hash(["supabase/schema.sql"]);
  if (state.schemaHash !== schemaHash) {
    await query(readFileSync("supabase/schema.sql", "utf8"));
    state.schemaHash = schemaHash;
    save();
    notes.push("tables updated");
    log("schema applied");
  }

  // 2. The server (Edge Function "api").
  const fnHash = hash([...walk("supabase/functions"), "supabase/config.toml"]);
  if (state.fnHash !== fnHash) {
    const out = execFileSync("npx", ["-y", "supabase@2", "functions", "deploy", "api", "--project-ref", REF, "--use-api"], {
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    }).toString();
    log(`function deployed: ${out.split("\n").slice(-4).join(" | ")}`);
    state.fnHash = fnHash;
    save();
    notes.push("server deployed");
  }

  // 3. One-off: move the old server's data (accounts, sessions, saves, ads) into Supabase.
  if (existsSync("supabase/migrate-now") && !state.migrated) {
    const key = readFileSync(join(DIR, "migrate-key.txt"), "utf8").trim();
    const r = await fetch(`${OLD}/migrate-export`, { headers: { "X-Migrate-Key": key } });
    const dump = await r.json();
    if (!dump.ok) throw new Error(`export ${r.status} ${JSON.stringify(dump).slice(0, 200)}`);
    // Test accounts Claude made while checking the new server.
    await query(`delete from game.users where name like '測試搬家%';`);
    const counts = [];
    for (const [table, rows] of Object.entries(dump.tables)) {
      if (!rows.length) continue;
      const body = JSON.stringify(rows);
      if (body.includes("$mig$")) throw new Error(`odd data in ${table}`);
      await query(`insert into game.${table} select * from json_populate_recordset(null::game.${table}, $mig$${body}$mig$) on conflict do nothing;`);
      counts.push(`${table} ${rows.length}`);
    }
    for (const t of ["users", "grants", "save_flags"]) {
      await query(`select setval(pg_get_serial_sequence('game.${t}', 'id'), greatest((select coalesce(max(id), 0) from game.${t}), 1));`);
    }
    state.migrated = new Date().toISOString();
    state.migratedCounts = counts;
    save();
    notes.push(`data moved (${counts.join(", ") || "nothing"})`);
    log(`migrated: ${counts.join(", ")}`);
  }

  // 4. Check the server answers.
  const probe = await fetch(`${API}/me`);
  const answer = await probe.json().catch(() => ({}));
  const healthy = probe.status === 401 && answer.error === "signed-out";
  status(`${healthy ? "OK" : "CHECK FAILED"} ${notes.join("; ") || "no changes"}; /me → ${probe.status} ${JSON.stringify(answer).slice(0, 120)}`);
} catch (e) {
  const msg = e instanceof Error ? `${e.message}${e.stderr ? ` ${String(e.stderr).slice(-400)}` : ""}` : String(e);
  log(`FAILED ${msg}`);
  status(`FAILED ${msg.slice(0, 500)}`);
}

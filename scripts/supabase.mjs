// Supabase (Sky 2026-10-23): this Mac's key for the company's Supabase project "boolionaire" (ref below) sits in
// ~/monopoly-inbox/supabase/token.txt, put there by Sky; it is read only to call Supabase's own API, never printed
// or copied. For now: a read-only check that the key works. Results in ~/monopoly-inbox/supabase/status.txt.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") process.exit(0);
const REF = "vszyjyoatqryctuldarb";
const DIR = join(homedir(), "monopoly-inbox", "supabase");
const tokenFile = join(DIR, "token.txt");
const status = (s) => writeFileSync(join(DIR, "status.txt"), `${new Date().toISOString()} ${s}\n`);
try {
  if (!existsSync(tokenFile)) process.exit(0);
  const token = readFileSync(tokenFile, "utf8").trim();
  if (!token.startsWith("sbp_")) {
    status("WAITING: no key in token.txt");
    process.exit(0);
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  status(r.ok ? `OK key works: ${j.name} ${j.region} ${j.status}` : `KEY FAILED ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
} catch (e) {
  status(`FAILED ${e instanceof Error ? e.message : e}`);
}

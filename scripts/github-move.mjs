// 搬去公司 GitHub (Sky 2026-10-23: "pfunstore-company"，只轉大富翁): move this one repository from the personal
// account to the company organisation, once, with this Mac's GitHub login. If the login was invited to the
// organisation but hasn't accepted yet, it accepts first (Sky asked for the move). Then points this Mac's copy at
// the new address. Progress in ~/monopoly-inbox/github-move.txt.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") process.exit(0);
const ORG = "pfunstore-company";
const FROM = "yung1978823-cmyk/monopoly";
const log = join(homedir(), "monopoly-inbox", "github-move.txt");
if (existsSync(log) && readFileSync(log, "utf8").includes("DONE")) process.exit(0);
const gh = (args) => {
  try {
    return { ok: true, out: execFileSync(join(homedir(), "bin", "gh"), args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim() };
  } catch (e) {
    return { ok: false, out: String(e?.stderr ?? e?.message ?? e).split("\n").slice(0, 3).join(" ") };
  }
};
const lines = [new Date().toISOString()];
const member = gh(["api", `user/memberships/orgs/${ORG}`, "--jq", '.state + " " + .role']);
lines.push(`membership: ${member.out}`);
if (member.ok && member.out.startsWith("pending")) {
  const accept = gh(["api", "-X", "PATCH", `user/memberships/orgs/${ORG}`, "-f", "state=active"]);
  lines.push(`accept: ${accept.ok ? "ok" : accept.out}`);
}
const now = gh(["api", `user/memberships/orgs/${ORG}`, "--jq", ".state"]);
if (now.ok && now.out === "active") {
  const moved = gh(["api", "-X", "POST", `repos/${FROM}/transfer`, "-f", `new_owner=${ORG}`, "--jq", ".full_name"]);
  lines.push(`transfer: ${moved.ok ? moved.out : moved.out}`);
  if (moved.ok) {
    try {
      execFileSync("git", ["remote", "set-url", "origin", `https://github.com/${ORG}/monopoly.git`]);
      lines.push("remote: updated");
    } catch (e) {
      lines.push(`remote: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
    lines.push("DONE");
  }
} else lines.push("WAITING: not an active member of the organisation yet");
writeFileSync(log, lines.join("\n") + "\n");

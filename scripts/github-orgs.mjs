// One-off (Sky 2026-10-23, moving the code to the company GitHub): list the GitHub organisations this Mac's
// GitHub login belongs to, and its role in each, into ~/monopoly-inbox/github-orgs.txt. Read-only.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") process.exit(0);
const out = join(homedir(), "monopoly-inbox", "github-orgs.txt");
const gh = (args) => {
  try {
    return execFileSync(join(homedir(), "bin", "gh"), args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (e) {
    return `ERR ${e instanceof Error ? e.message.split("\n")[0] : e}`;
  }
};
writeFileSync(
  out,
  `${new Date().toISOString()}\nuser: ${gh(["api", "user", "--jq", ".login"])}orgs: ${gh(["api", "user/orgs", "--jq", ".[].login"])}memberships: ${gh(["api", "user/memberships/orgs", "--jq", ".[] | .organization.login + \" \" + .role + \" \" + .state"])}`,
);

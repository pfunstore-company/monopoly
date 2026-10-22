// One-off (2026-10-22): see what this Mac has for building the iPhone app. Writes a short note into the
// inbox folder; prints no passwords or tokens. Removed again in the next update.
import { execSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
const run = (c) => {
  try {
    return execSync(c, { stdio: ["ignore", "pipe", "pipe"], timeout: 20000 }).toString().trim();
  } catch (e) {
    return `ERR ${(e.stderr || e.message || "").toString().trim().split("\n")[0]}`;
  }
};
const out = [
  `os: ${run("sw_vers -productVersion")} ${run("uname -m")}`,
  `xcode-select: ${run("xcode-select -p")}`,
  `xcodebuild: ${run("xcodebuild -version | head -1")}`,
  `apps: ${run("ls /Applications | grep -i xcode || echo none")}`,
  `credential.helper: ${run("git config --get credential.helper || echo none")}`,
  `gh: ${run("which gh || echo none")}`,
  `gh scopes: ${run("gh auth status 2>&1 | grep -i scope || echo none")}`,
  `brew: ${run("which brew || echo none")}`,
  `pod: ${run("which pod || echo none")}`,
  `fastlane: ${run("which fastlane || echo none")}`,
  `node: ${process.version}`,
].join("\n");
const dir = `${homedir()}/monopoly-inbox`;
if (existsSync(dir)) writeFileSync(`${dir}/mac-probe.txt`, out + "\n");
console.log(out);

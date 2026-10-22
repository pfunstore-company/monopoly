// iPhone 測試版 (Sky 2026-10-22): after each web deploy on Sky's Mac, if ios/release.json has a new build number,
// archive the iPhone app with Xcode and upload it to Apple's test service, in the background so the web deploy
// isn't held up. The App Store Connect key (AuthKey_<id>.p8, downloaded by Sky) is used where it lies and never
// read or printed here. Progress goes to ~/monopoly-inbox/ios/status.txt and build.log.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") process.exit(0);
const HOME = homedir();
const DIR = join(HOME, "monopoly-inbox", "ios");
mkdirSync(DIR, { recursive: true });
const status = (s) => writeFileSync(join(DIR, "status.txt"), `${new Date().toISOString()} ${s}\n`);
try {
  const rel = JSON.parse(readFileSync("ios/release.json", "utf8"));
  const tag = `${rel.version}+${rel.build}`;
  const lastFile = join(DIR, "last-build.txt");
  if (existsSync(lastFile) && readFileSync(lastFile, "utf8").trim() === tag) process.exit(0);
  const keyDirs = [DIR, join(HOME, "Downloads")];
  const key = keyDirs.flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => /^AuthKey_[A-Z0-9]+\.p8$/.test(f)).map((f) => join(d, f)) : []))[0];
  const platform = `xcodebuild -showsdks | grep -q iphoneos || xcodebuild -downloadPlatform iOS`;
  if (!key || !rel.teamId || !rel.issuerId) {
    const why = `${!key ? "no AuthKey_*.p8 in Downloads; " : ""}${!rel.teamId ? "no teamId; " : ""}${!rel.issuerId ? "no issuerId" : ""}`;
    // Meanwhile, once: check the app builds at all (no signing), so the first real upload has fewer surprises.
    const tested = join(DIR, "test-build.txt");
    if (existsSync(tested) && readFileSync(tested, "utf8").trim() === tag) {
      status(`WAITING ${tag}: ${why}`);
      process.exit(0);
    }
    status(`TEST-BUILDING ${tag} (unsigned) while waiting: ${why}`);
    const work = join(DIR, "work");
    rmSync(work, { recursive: true, force: true });
    cpSync("ios", work, { recursive: true });
    const test = `set -o pipefail; ${platform} && xcodebuild -project '${join(work, "App", "App.xcodeproj")}' -scheme App -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`;
    const end = `if [ $? -eq 0 ]; then echo '${tag}' > '${tested}'; echo "$(date -u +%FT%TZ) TEST-BUILD OK ${tag}; WAITING: ${why}" > '${join(DIR, "status.txt")}'; else echo "$(date -u +%FT%TZ) TEST-BUILD FAILED ${tag} (see build.log)" > '${join(DIR, "status.txt")}'; fi`;
    spawn("/bin/bash", ["-c", `(${test}) > '${join(DIR, "build.log")}' 2>&1; ${end}`], { detached: true, stdio: "ignore" }).unref();
    process.exit(0);
  }
  const keyId = /AuthKey_([A-Z0-9]+)\.p8$/.exec(key)[1];
  // Work on a copy, so the next web update can't change files under Xcode's feet.
  const work = join(DIR, "work");
  rmSync(work, { recursive: true, force: true });
  cpSync("ios", work, { recursive: true });
  writeFileSync(
    join(DIR, "ExportOptions.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>teamID</key><string>${rel.teamId}</string>
<key>signingStyle</key><string>automatic</string>
<key>uploadSymbols</key><true/>
<key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
`,
  );
  const auth = `-allowProvisioningUpdates -authenticationKeyPath '${key}' -authenticationKeyID ${keyId} -authenticationKeyIssuerID ${rel.issuerId}`;
  const archive = join(DIR, "App.xcarchive");
  const script = [
    `set -o pipefail`,
    platform,
    `rm -rf '${archive}' '${join(DIR, "export")}'`,
    `xcodebuild -project '${join(work, "App", "App.xcodeproj")}' -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath '${archive}' ${auth} DEVELOPMENT_TEAM=${rel.teamId} CODE_SIGN_STYLE=Automatic MARKETING_VERSION=${rel.version} CURRENT_PROJECT_VERSION=${rel.build} archive`,
    `xcodebuild -exportArchive -archivePath '${archive}' -exportPath '${join(DIR, "export")}' -exportOptionsPlist '${join(DIR, "ExportOptions.plist")}' ${auth}`,
  ].join(" && ");
  status(`BUILDING ${tag}`);
  const done = `if [ $? -eq 0 ]; then echo '${tag}' > '${lastFile}'; echo "$(date -u +%FT%TZ) OK ${tag} uploaded" > '${join(DIR, "status.txt")}'; else echo "$(date -u +%FT%TZ) FAILED ${tag} (see build.log)" > '${join(DIR, "status.txt")}'; fi`;
  const child = spawn("/bin/bash", ["-c", `(${script}) > '${join(DIR, "build.log")}' 2>&1; ${done}`], { detached: true, stdio: "ignore" });
  child.unref();
} catch (e) {
  status(`FAILED to start: ${e instanceof Error ? e.message : e}`);
}

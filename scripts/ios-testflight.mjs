// iPhone 測試版 (Sky 2026-10-22): after each web deploy on Sky's Mac, if ios/release.json has a new build number,
// archive the iPhone app with Xcode and upload it to Apple's test service, in the background so the web deploy
// isn't held up. The App Store Connect key (AuthKey_<id>.p8, downloaded by Sky) is used where it lies (only to sign
// Apple's login), never copied or printed. Progress goes to ~/monopoly-inbox/ios/status.txt and build.log.
import { spawn } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  // The newest key wins (an older one may have too few rights).
  const key = keyDirs
    .flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => /^AuthKey_[A-Z0-9]+\.p8$/.test(f)).map((f) => join(d, f)) : []))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
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
  // The app's bundle ID has to be registered before Sky can make the app page; Xcode only used its wildcard
  // profile, so register it through Apple's API with the same key.
  try {
    const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const head = `${b64({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64({ iss: rel.issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" })}`;
    const sig = sign("sha256", Buffer.from(head), { key: createPrivateKey(readFileSync(key)), dsaEncoding: "ieee-p1363" }).toString("base64url");
    const api = (path, body) =>
      fetch(`https://api.appstoreconnect.apple.com${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${head}.${sig}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }).then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }));
    const bundle = JSON.parse(readFileSync(join("ios", "App", "App", "capacitor.config.json"), "utf8")).appId;
    const found = await api(`/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundle)}`);
    let note = `bundle ${bundle}: lookup ${found.status}`;
    if (found.ok && !(found.json.data ?? []).some((d) => d.attributes?.identifier === bundle)) {
      const made = await api("/v1/bundleIds", { data: { type: "bundleIds", attributes: { identifier: bundle, name: "Boolionaire", platform: "IOS" } } });
      note += `, registered ${made.status}${made.ok ? "" : ` ${JSON.stringify(made.json.errors?.[0]?.detail ?? "")}`}`;
    } else if (found.ok) note += ", already registered";
    // 蘋果登入 (Sky 2026-10-23): the app ID needs the Sign in with Apple capability.
    const look = await api(`/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundle)}`);
    const bid = (look.json.data ?? []).find((d) => d.attributes?.identifier === bundle)?.id;
    if (bid) {
      const caps = await api(`/v1/bundleIds/${bid}/bundleIdCapabilities`);
      if (caps.ok && !(caps.json.data ?? []).some((c) => c.attributes?.capabilityType === "APPLE_ID_AUTH")) {
        const made = await api("/v1/bundleIdCapabilities", {
          data: {
            type: "bundleIdCapabilities",
            attributes: { capabilityType: "APPLE_ID_AUTH", settings: [{ key: "APPLE_ID_AUTH_APP_CONSENT", options: [{ key: "PRIMARY_APP_CONSENT" }] }] },
            relationships: { bundleId: { data: { type: "bundleIds", id: bid } } },
          },
        });
        note += `; Sign in with Apple ${made.status}${made.ok ? "" : ` ${JSON.stringify(made.json.errors?.[0]?.detail ?? "")}`}`;
      } else note += `; Sign in with Apple ${caps.ok ? "on" : `lookup ${caps.status}`}`;
    }
    writeFileSync(join(DIR, "bundle.txt"), `${new Date().toISOString()} ${note}\n`);
  } catch (e) {
    writeFileSync(join(DIR, "bundle.txt"), `${new Date().toISOString()} bundle step failed: ${e instanceof Error ? e.message : e}\n`);
  }
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
  const appId = JSON.parse(readFileSync(join("ios", "App", "App", "capacitor.config.json"), "utf8")).appId;
  cpSync(join("scripts", "ios-sign.mjs"), join(DIR, "ios-sign.mjs"));
  const script = [
    `set -o pipefail`,
    platform,
    `rm -rf '${archive}' '${join(DIR, "export")}'`,
    `xcodebuild -project '${join(work, "App", "App.xcodeproj")}' -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath '${archive}' ${auth} DEVELOPMENT_TEAM=${rel.teamId} CODE_SIGN_STYLE=Automatic MARKETING_VERSION=${rel.version} CURRENT_PROJECT_VERSION=${rel.build} archive`,
    // Our own distribution certificate and profile (Apple refused the key its cloud one).
    `'${process.execPath}' '${join(DIR, "ios-sign.mjs")}' '${key}' ${keyId} ${rel.issuerId} ${rel.teamId} ${appId} '${DIR}'`,
    `xcodebuild -exportArchive -archivePath '${archive}' -exportPath '${join(DIR, "export")}' -exportOptionsPlist '${join(DIR, "ExportOptions.plist")}' ${auth}`,
  ].join(" && ");
  status(`BUILDING ${tag}`);
  const done = `if [ $? -eq 0 ]; then echo '${tag}' > '${lastFile}'; echo "$(date -u +%FT%TZ) OK ${tag} uploaded" > '${join(DIR, "status.txt")}'; else echo "$(date -u +%FT%TZ) FAILED ${tag} (see build.log)" > '${join(DIR, "status.txt")}'; fi`;
  const child = spawn("/bin/bash", ["-c", `(${script}) > '${join(DIR, "build.log")}' 2>&1; ${done}`], { detached: true, stdio: "ignore" });
  child.unref();
} catch (e) {
  status(`FAILED to start: ${e instanceof Error ? e.message : e}`);
}

// iPhone 測試版 signing (Sky 2026-10-22). Apple wouldn't let the key use its cloud-managed distribution
// certificate, so this makes the app's own distribution certificate and App Store profile through Apple's API
// (once, then reused), puts them in a keychain kept just for these builds, and writes ExportOptions.plist for a
// manually signed upload. Usage: node ios-sign.mjs <keyPath> <keyId> <issuerId> <teamId> <bundleId> <dir>
import { execFileSync } from "node:child_process";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [keyPath, keyId, issuerId, teamId, bundle, dir] = process.argv.slice(2);
const sh = (cmd, args, input) => execFileSync(cmd, args, { input, stdio: ["pipe", "pipe", "pipe"] }).toString();
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = `${b64({ alg: "ES256", kid: keyId, typ: "JWT" })}.${b64({ iss: issuerId, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" })}`;
const token = `${head}.${sign("sha256", Buffer.from(head), { key: createPrivateKey(readFileSync(keyPath)), dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
const api = async (path, body) => {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(json.errors?.[0] ?? json).slice(0, 400)}`);
  return json;
};

const sdir = join(dir, "signing");
mkdirSync(sdir, { recursive: true });
const statePath = join(sdir, "state.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};

// 1. Our own distribution certificate (key made here, never leaves this Mac).
if (!state.certId) {
  const keyPem = join(sdir, "dist.key");
  sh("openssl", ["genrsa", "-out", keyPem, "2048"]);
  const csr = sh("openssl", ["req", "-new", "-key", keyPem, "-subj", "/CN=Boolionaire Distribution/C=HK"]);
  const made = await api("/v1/certificates", { data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: csr } } });
  state.certId = made.data.id;
  const der = Buffer.from(made.data.attributes.certificateContent, "base64");
  writeFileSync(join(sdir, "dist.cer"), der);
  sh("openssl", ["x509", "-inform", "DER", "-in", join(sdir, "dist.cer"), "-out", join(sdir, "dist.pem")]);
  state.p12Pass = randomBytes(12).toString("hex");
  const legacy = sh("openssl", ["version"]).startsWith("OpenSSL 3") ? ["-legacy"] : [];
  sh("openssl", ["pkcs12", "-export", ...legacy, "-inkey", keyPem, "-in", join(sdir, "dist.pem"), "-out", join(sdir, "dist.p12"), "-passout", `pass:${state.p12Pass}`, "-name", "Boolionaire Distribution"]);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// 2. A keychain of its own for these builds, holding that certificate.
const kc = join(sdir, "build.keychain-db");
if (!state.kcPass) state.kcPass = randomBytes(12).toString("hex");
if (!existsSync(kc)) {
  sh("security", ["create-keychain", "-p", state.kcPass, kc]);
  sh("security", ["set-keychain-settings", kc]);
  sh("security", ["unlock-keychain", "-p", state.kcPass, kc]);
  sh("security", ["import", join(sdir, "dist.p12"), "-k", kc, "-P", state.p12Pass, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"]);
  sh("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", state.kcPass, kc]);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}
sh("security", ["unlock-keychain", "-p", state.kcPass, kc]);
const list = sh("security", ["list-keychains", "-d", "user"]).split("\n").map((l) => l.trim().replace(/^"|"$/g, "")).filter(Boolean);
if (!list.includes(kc)) sh("security", ["list-keychains", "-d", "user", "-s", kc, ...list]);

// 3. An App Store profile for the app with that certificate.
if (!state.profileName) {
  const ids = await api(`/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundle)}`);
  const bid = (ids.data ?? []).find((d) => d.attributes.identifier === bundle)?.id;
  if (!bid) throw new Error(`bundle id ${bundle} not registered`);
  const name = `Boolionaire App Store ${new Date().toISOString().slice(0, 10)}`;
  const prof = await api("/v1/profiles", {
    data: {
      type: "profiles",
      attributes: { name, profileType: "IOS_APP_STORE" },
      relationships: { bundleId: { data: { type: "bundleIds", id: bid } }, certificates: { data: [{ type: "certificates", id: state.certId }] } },
    },
  });
  state.profileName = name;
  state.profileContent = prof.data.attributes.profileContent;
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}
const raw = Buffer.from(state.profileContent, "base64");
const plist = sh("security", ["cms", "-D", "-i", "/dev/stdin"], raw);
const uuid = /<key>UUID<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
for (const d of [join(homedir(), "Library/MobileDevice/Provisioning Profiles"), join(homedir(), "Library/Developer/Xcode/UserData/Provisioning Profiles")]) {
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `${uuid}.mobileprovision`), raw);
}

// 4. Export options for a manual-signed upload.
writeFileSync(
  join(dir, "ExportOptions.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>teamID</key><string>${teamId}</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>provisioningProfiles</key><dict><key>${bundle}</key><string>${state.profileName}</string></dict>
<key>uploadSymbols</key><true/>
<key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
`,
);
console.log(`signing ready: cert ${state.certId}, profile "${state.profileName}" (${uuid})`);

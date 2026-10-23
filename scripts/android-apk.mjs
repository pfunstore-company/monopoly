// Android 測試版 (Sky 2026-10-22): after each web deploy on Sky's Mac, if android/release.json has a new build number,
// build an Android install file (APK) in the background so the web deploy isn't held up: the debug-signed APK Sky can
// put straight on a phone, and (2026-10-23, Play Console app com.pfunstore.boolionaire) the Play upload bundle (AAB),
// signed with an upload key made here once. The key and its password stay in ~/monopoly-inbox/android/upload.
// The first run fetches its own tools into ~/monopoly-inbox/android/tools: a Java 21 (Adoptium) and Google's Android
// SDK, whose licences Sky agreed to accept ("可以，幫我接受"). Progress: ~/monopoly-inbox/android/status.txt, build.log.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.platform !== "darwin") process.exit(0);
const DIR = join(homedir(), "monopoly-inbox", "android");
mkdirSync(DIR, { recursive: true });
const status = (s) => writeFileSync(join(DIR, "status.txt"), `${new Date().toISOString()} ${s}\n`);
try {
  const rel = JSON.parse(readFileSync("android/release.json", "utf8"));
  const tag = `${rel.version}+${rel.build}`;
  const lastFile = join(DIR, "last-build.txt");
  if (existsSync(lastFile) && readFileSync(lastFile, "utf8").trim() === tag) process.exit(0);
  // Work on a copy, so the next web update can't change files under Gradle's feet.
  const work = join(DIR, "work");
  rmSync(work, { recursive: true, force: true });
  cpSync("android", work, { recursive: true });
  const gradleFile = join(work, "app", "build.gradle");
  writeFileSync(
    gradleFile,
    readFileSync(gradleFile, "utf8")
      .replace(/versionCode \d+/, `versionCode ${rel.build}`)
      .replace(/versionName "[^"]*"/, `versionName "${rel.version}"`),
  );
  const tools = join(DIR, "tools");
  const sdk = join(tools, "sdk");
  const jdk = join(tools, "jdk");
  const out = join(DIR, `Boolionaire-${rel.version}-${rel.build}.apk`);
  const script = `
set -euo pipefail
mkdir -p '${tools}'
cd '${tools}'
if [ ! -x '${jdk}/Contents/Home/bin/java' ]; then
  arch=$( [ "$(uname -m)" = arm64 ] && echo aarch64 || echo x64 )
  curl -fsSL -o jdk.tgz "https://api.adoptium.net/v3/binary/latest/21/ga/mac/$arch/jdk/hotspot/normal/eclipse"
  rm -rf '${jdk}' && mkdir -p '${jdk}' && tar xzf jdk.tgz -C '${jdk}' --strip-components 1 && rm jdk.tgz
fi
export JAVA_HOME='${jdk}/Contents/Home'
export PATH="$JAVA_HOME/bin:$PATH"
if [ ! -x '${sdk}/cmdline-tools/latest/bin/sdkmanager' ]; then
  curl -fsSL -o clt.zip https://dl.google.com/android/repository/commandlinetools-mac-13114758_latest.zip
  rm -rf clt && mkdir clt && unzip -q clt.zip -d clt && mkdir -p '${sdk}/cmdline-tools' && rm -rf '${sdk}/cmdline-tools/latest' && mv clt/cmdline-tools '${sdk}/cmdline-tools/latest' && rm -rf clt clt.zip
fi
SM='${sdk}/cmdline-tools/latest/bin/sdkmanager'
yes | "$SM" --sdk_root='${sdk}' --licenses > /dev/null || true
"$SM" --sdk_root='${sdk}' "platform-tools" "platforms;android-36" "build-tools;36.0.0" > /dev/null
echo "sdk.dir=${sdk}" > '${work}/local.properties'
cd '${work}'
chmod +x gradlew
UP='${join(DIR, "upload")}'
mkdir -p "$UP" && chmod 700 "$UP"
if [ ! -f "$UP/upload.jks" ]; then
  ( umask 077; openssl rand -hex 16 > "$UP/password.txt" )
  keytool -genkeypair -v -keystore "$UP/upload.jks" -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$(cat "$UP/password.txt")" -keypass "$(cat "$UP/password.txt")" \
    -dname "CN=P Fun Store Company Limited, O=P Fun Store Company Limited, C=HK" > /dev/null 2>&1
  keytool -exportcert -rfc -keystore "$UP/upload.jks" -alias upload -storepass "$(cat "$UP/password.txt")" > "$UP/upload_certificate.pem"
fi
export BN_UPLOAD_STORE="$UP/upload.jks"
export BN_UPLOAD_PASS="$(cat "$UP/password.txt")"
./gradlew --no-daemon assembleDebug bundleRelease
cp app/build/outputs/apk/debug/app-debug.apk '${out}'
cp app/build/outputs/bundle/release/app-release.aab '${join(DIR, "Boolionaire-")}${rel.version}-${rel.build}.aab'
cp app/build/outputs/bundle/release/app-release.aab '${join(DIR, "Boolionaire.aab")}'
keytool -list -v -keystore "$UP/upload.jks" -alias upload -storepass "$BN_UPLOAD_PASS" 2>/dev/null | grep -E 'SHA1:|SHA256:' > '${join(DIR, "fingerprint-upload.txt")}' || true
# The signing key's fingerprint, for Google sign-in (Firebase needs it once).
keytool -list -v -keystore "$HOME/.android/debug.keystore" -storepass android -alias androiddebugkey 2>/dev/null | grep -E 'SHA1:|SHA256:' > '${join(DIR, "fingerprint.txt")}' || true
cp '${out}' '${join(DIR, "Boolionaire.apk")}'
`;
  const end = `if [ $? -eq 0 ]; then echo '${tag}' > '${lastFile}'; echo "$(date -u +%FT%TZ) OK ${tag} built ${out}" > '${join(DIR, "status.txt")}'; else echo "$(date -u +%FT%TZ) FAILED ${tag} (see build.log)" > '${join(DIR, "status.txt")}'; fi`;
  writeFileSync(join(DIR, "build.sh"), script);
  status(`BUILDING ${tag}`);
  spawn("/bin/bash", ["-c", `/bin/bash '${join(DIR, "build.sh")}' > '${join(DIR, "build.log")}' 2>&1; ${end}`], { detached: true, stdio: "ignore" }).unref();
} catch (e) {
  status(`FAILED to start: ${e instanceof Error ? e.message : e}`);
}

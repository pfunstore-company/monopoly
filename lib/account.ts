/**
 * 帳號 on the device (Sky 2026-10-22; Google / Apple sign-in 2026-10-23): sign in with Google (everywhere) or Apple
 * (iPhone), or play as a guest; the older name + password accounts can still sign in. Signed in,
 * the game's saved data (everything this site keeps on the device) is copied to the account's cloud save every
 * minute and when the app goes to the background; signing in on another phone brings it back.
 */
const SESSION_KEY = "boolionaire-account";
const GUEST_KEY = "boolionaire-guest";
const GAME_KEY = /^(boolionaire|dafuweng)-/;

export type Session = { token: string; name: string; provider?: string };

export function session(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    return s && typeof s.token === "string" && typeof s.name === "string" ? s : null;
  } catch {
    return null;
  }
}
export function isGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}
export function playAsGuest(): void {
  try {
    localStorage.setItem(GUEST_KEY, "1");
  } catch {
    // Not remembered; asked again next time.
  }
}

type Reply = { ok: boolean; error?: string; [k: string]: unknown };
async function api(path: string, method: string, body?: unknown, token?: string): Promise<Reply> {
  try {
    const r = await fetch(`/api/${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      keepalive: method === "PUT" && JSON.stringify(body ?? "").length < 60_000,
    });
    return (await r.json().catch(() => ({ ok: false, error: "server" }))) as Reply;
  } catch {
    return { ok: false, error: "offline" };
  }
}

// ---- The server's view of this player, for ads (Sky 2026-10-23) ----
// Not "boolionaire-…", so it never goes into the cloud save.
const GUEST_TOKEN_KEY = "bn-guest-token";

/** A token the server knows: the signed-in account's, or a quiet guest account made the first time. */
export async function serverToken(fresh = false): Promise<string | null> {
  const s = session();
  if (s) return s.token;
  try {
    const saved = fresh ? null : localStorage.getItem(GUEST_TOKEN_KEY);
    if (saved) return saved;
    const r = await api("guest", "POST", {});
    if (!r.ok) return null;
    localStorage.setItem(GUEST_TOKEN_KEY, String(r.token));
    return String(r.token);
  } catch {
    return null;
  }
}

/** Call the server as this player (signed in or guest). */
export async function playerApi(path: string, method: string, body?: unknown): Promise<Reply> {
  const token = await serverToken();
  if (!token) return { ok: false, error: "offline" };
  const r = await api(path, method, body, token);
  // A guest token the server no longer knows: make a new one once.
  if (!r.ok && r.error === "signed-out" && !session()) {
    const again = await serverToken(true);
    return again ? api(path, method, body, again) : r;
  }
  return r;
}

/** Everything the game keeps on this device (not the sign-in itself). */
export function collectSave(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (GAME_KEY.test(k) && k !== SESSION_KEY && k !== GUEST_KEY) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
}
function clearGame(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (GAME_KEY.test(k) && k !== SESSION_KEY) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
function applySave(data: Record<string, string>): void {
  clearGame();
  for (const [k, v] of Object.entries(data)) if (GAME_KEY.test(k) && typeof v === "string") localStorage.setItem(k, v);
}

/**
 * Sign in (or make the account). An account with a cloud save brings it onto this device (the page then reloads);
 * a new account takes what this device already has.
 */
export async function signIn(mode: "login" | "register", name: string, password: string): Promise<{ ok: true; reload: boolean } | { ok: false; error: string }> {
  const r = await api(mode, "POST", { name, password });
  if (!r.ok) return { ok: false, error: String(r.error ?? "server") };
  return finishSignIn({ token: String(r.token), name: String(r.name), provider: "password" });
}

// ---- Google / Apple (through Firebase Authentication) ----
const FIREBASE_WEB = {
  apiKey: "AIzaSyAXcNCVnLayC2cLkqltWaGfb3oxKOPm1jA",
  authDomain: "boolionaire-4f7b5.firebaseapp.com",
  projectId: "boolionaire-4f7b5",
  appId: "1:246388073348:web:a5e145d48e9bdb5ad4b3d1",
};
const FIREBASE_JS = "https://www.gstatic.com/firebasejs/12.6.0";

type NativeAuth = {
  signInWithGoogle(o?: object): Promise<unknown>;
  signInWithApple(o?: object): Promise<unknown>;
  getIdToken(o?: object): Promise<{ token: string }>;
  signOut(): Promise<void>;
};
type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { FirebaseAuthentication?: NativeAuth } };
const cap = (): Cap | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: Cap }).Capacitor);
function nativeAuth(): NativeAuth | null {
  const c = cap();
  return c?.isNativePlatform?.() ? (c.Plugins?.FirebaseAuthentication ?? null) : null;
}
/** "ios", "android" or "web". */
export function platform(): string {
  const c = cap();
  return c?.isNativePlatform?.() ? (c.getPlatform?.() ?? "web") : "web";
}
/** Which sign-in buttons to show: Apple only on iPhone (Apple's rule: with Google there, Apple must be too). */
export function providers(): ("apple" | "google")[] {
  return platform() === "ios" ? ["apple", "google"] : ["google"];
}

type WebFirebase = {
  apps: unknown[];
  initializeApp(c: object): void;
  auth: { (): { signInWithPopup(p: unknown): Promise<{ user: { getIdToken(): Promise<string> } | null }>; signOut(): Promise<void> }; GoogleAuthProvider: new () => unknown };
};
function script(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("load"));
    document.head.appendChild(el);
  });
}
/** Firebase for the web page, loaded only when someone presses a sign-in button. */
async function webFirebase(): Promise<WebFirebase> {
  await script(`${FIREBASE_JS}/firebase-app-compat.js`);
  await script(`${FIREBASE_JS}/firebase-auth-compat.js`);
  const fb = (window as unknown as { firebase: WebFirebase }).firebase;
  if (!fb.apps.length) fb.initializeApp(FIREBASE_WEB);
  return fb;
}

const cancelled = (e: unknown) => /cancel|popup-closed|canceled|12501|1001/i.test(e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ""}` : String(e));

/** A Firebase ID token for the player, after they sign in with Google or Apple. */
export async function idToken(provider: "google" | "apple"): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const native = nativeAuth();
    if (native) {
      await (provider === "apple" ? native.signInWithApple() : native.signInWithGoogle());
      return { ok: true, token: (await native.getIdToken()).token };
    }
    if (provider === "apple") return { ok: false, error: "server" };
    const fb = await webFirebase();
    const r = await fb.auth().signInWithPopup(new fb.auth.GoogleAuthProvider());
    if (!r.user) return { ok: false, error: "cancelled" };
    return { ok: true, token: await r.user.getIdToken() };
  } catch (e) {
    return { ok: false, error: cancelled(e) ? "cancelled" : "provider" };
  }
}

/** Sign in with Google or Apple; a guest's progress on this device goes to a new account. */
export async function signInWith(provider: "google" | "apple"): Promise<{ ok: true; reload: boolean } | { ok: false; error: string }> {
  const t = await idToken(provider);
  if (!t.ok) return t;
  const r = await api("id-signin", "POST", { idToken: t.token });
  if (!r.ok) return { ok: false, error: String(r.error ?? "server") };
  return finishSignIn({ token: String(r.token), name: String(r.name), provider: String(r.provider) });
}

async function finishSignIn(s: Session): Promise<{ ok: true; reload: boolean }> {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  localStorage.removeItem(GUEST_KEY);
  const saved = await api("save", "GET", undefined, s.token);
  if (saved.ok && saved.data && typeof saved.data === "object") {
    applySave(saved.data as Record<string, string>);
    return { ok: true, reload: true };
  }
  await upload();
  return { ok: true, reload: false };
}

/** Copy this device's progress to the account (when signed in). */
export async function upload(): Promise<boolean> {
  const s = session();
  if (!s) return false;
  const r = await api("save", "PUT", { data: collectSave() }, s.token);
  if (!r.ok && r.error === "signed-out") localStorage.removeItem(SESSION_KEY);
  return r.ok;
}

let syncing = false;
/** Upload every minute and whenever the app is put away. */
export function startAutoSync(): void {
  if (syncing || typeof window === "undefined") return;
  syncing = true;
  window.setInterval(() => void upload(), 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void upload();
  });
}

export async function signOut(): Promise<void> {
  const s = session();
  if (!s) return;
  await upload();
  await api("logout", "POST", {}, s.token);
  localStorage.removeItem(SESSION_KEY);
  await nativeAuth()?.signOut().catch(() => {});
}

/** Whether the signed-in account is a name + password one (deleting it asks for the password). */
export function usesPassword(): boolean {
  const p = session()?.provider;
  return !p || p === "password";
}

/** 刪除帳號: gone from the server for good, and this device starts afresh. */
export async function deleteMyAccount(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = session();
  if (!s) return { ok: false, error: "signed-out" };
  const r = usesPassword() ? await api("delete", "POST", { name: s.name, password }) : await api("delete-me", "POST", {}, s.token);
  if (!r.ok) return { ok: false, error: String(r.error ?? "server") };
  localStorage.removeItem(SESSION_KEY);
  await nativeAuth()?.signOut().catch(() => {});
  clearGame();
  return { ok: true };
}

/** What to tell the player for an error code (the text goes through t()). */
export const ACCOUNT_ERRORS: Record<string, string> = {
  "bad-name": "帳號名稱需為 3 至 16 個字，只可使用文字、數字或底線",
  "bad-password": "密碼至少需要 6 個字元",
  "name-taken": "此帳號名稱已被使用",
  wrong: "帳號名稱或密碼錯誤",
  locked: "嘗試次數過多，請 15 分鐘後再試",
  offline: "無法連線，請檢查網路後再試",
  server: "伺服器發生問題，請稍後再試",
  "signed-out": "登入已過期，請重新登入",
  cancelled: "已取消登入",
  provider: "登入失敗，請稍後再試",
  "bad-token": "登入失敗，請稍後再試",
};

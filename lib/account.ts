/**
 * 帳號 on the device (Sky 2026-10-22): sign in or make an account (name + password), or play as a guest. Signed in,
 * the game's saved data (everything this site keeps on the device) is copied to the account's cloud save every
 * minute and when the app goes to the background; signing in on another phone brings it back.
 */
const SESSION_KEY = "boolionaire-account";
const GUEST_KEY = "boolionaire-guest";
const GAME_KEY = /^(boolionaire|dafuweng)-/;

export type Session = { token: string; name: string };

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
  const s: Session = { token: String(r.token), name: String(r.name) };
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
}

/** 刪除帳號: gone from the server for good, and this device starts afresh. */
export async function deleteMyAccount(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = session();
  if (!s) return { ok: false, error: "signed-out" };
  const r = await api("delete", "POST", { name: s.name, password });
  if (!r.ok) return { ok: false, error: String(r.error ?? "server") };
  localStorage.removeItem(SESSION_KEY);
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
};

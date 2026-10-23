"use client";

/**
 * 帳號 screens (Sky 2026-10-22; Google / Apple 2026-10-23): on the way into the game, sign in with Apple (iPhone)
 * or Google, or play as a guest; older name + password accounts sign in from a small link. The account block in
 * 設定 has sign out and 刪除帳號.
 */
import { useState } from "react";
import { ACCOUNT_ERRORS, deleteMyAccount, playAsGuest, providers, session, signIn, signInWith, signOut, usesPassword } from "@/lib/account";
import { useLang } from "@/lib/i18n";
import { cn } from "cn";

const field = "h-12 w-full rounded-2xl border-[3px] border-[#D6DEEA] bg-white px-4 text-base font-bold text-[#1E3A8A] outline-none focus:border-[#FBD000]";
const bigBtn = "h-13 w-full cursor-pointer rounded-full border-4 border-[#FBD000] py-2.5 text-lg font-black text-white disabled:cursor-default disabled:opacity-60";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-6" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 384 512" className="size-6" aria-hidden="true">
      <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

/** Sign in with Apple / Google, or play as a guest (`onGuest`). */
export function AccountGate({ onDone, onGuest }: { onDone: (reload: boolean) => void; onGuest?: () => void }) {
  const { t } = useLang();
  const [busy, setBusy] = useState<"" | "apple" | "google" | "old">("");
  const [error, setError] = useState("");
  const [old, setOld] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const done = (r: { ok: true; reload: boolean } | { ok: false; error: string }) => {
    setBusy("");
    if (!r.ok) return setError(r.error === "cancelled" ? "" : t(ACCOUNT_ERRORS[r.error] ?? ACCOUNT_ERRORS.server));
    onDone(r.reload);
  };
  const go = async (p: "apple" | "google") => {
    setBusy(p);
    setError("");
    done(await signInWith(p));
  };
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-[#0B1030]/85 sm:items-center" data-testid="account-gate">
      <div className="w-full max-w-md space-y-3 rounded-t-[32px] bg-gradient-to-b from-white to-[#EEF3FB] p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-[32px]">
        <p className="text-center text-2xl font-black text-[#1E3A8A]">{t("歡迎來到 Boolionaire")}</p>
        <p className="-mt-1 text-center text-xs font-bold text-[#475569]">{t("登入後遊戲進度會儲存在雲端，換手機也不會遺失")}</p>
        {providers().map((p) =>
          p === "apple" ? (
            <button
              key={p}
              type="button"
              disabled={!!busy}
              onClick={() => void go("apple")}
              className="flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-black py-2.5 text-lg font-black text-white disabled:opacity-60"
              data-testid="account-apple"
            >
              <AppleMark />
              {busy === "apple" ? t("請稍候…") : t("使用 Apple 登入")}
            </button>
          ) : (
            <button
              key={p}
              type="button"
              disabled={!!busy}
              onClick={() => void go("google")}
              className="flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-[3px] border-[#D6DEEA] bg-white py-2 text-lg font-black text-[#1F2937] disabled:opacity-60"
              data-testid="account-google"
            >
              <GoogleMark />
              {busy === "google" ? t("請稍候…") : t("使用 Google 登入")}
            </button>
          ),
        )}
        {error ? <p className="text-center text-sm font-black text-[#DC2626]" data-testid="account-error">{error}</p> : null}
        {onGuest ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              playAsGuest();
              onGuest();
            }}
            className="h-12 w-full cursor-pointer rounded-full bg-gradient-to-b from-[#22A447] to-[#167A33] text-lg font-black text-white shadow-[0_4px_0_#0F5A25] disabled:opacity-60"
            data-testid="account-guest"
          >
            {t("以訪客身分開始")}
          </button>
        ) : null}
        <p className="text-center text-[10px] font-bold text-[#94A3B8]">{t("訪客進度只會儲存在這部手機，之後隨時可在設定中登入，進度會一併保留")}</p>
        {old ? (
          <form
            className="space-y-2 border-t border-[#D6DEEA] pt-3"
            onSubmit={(e: { preventDefault: () => void }) => {
              e.preventDefault();
              setBusy("old");
              setError("");
              void signIn("login", name.trim(), password).then(done);
            }}
          >
            <input className={field} value={name} onChange={(e: { target: { value: string } }) => setName(e.target.value)} placeholder={t("帳號名稱")} autoComplete="username" autoCapitalize="off" autoCorrect="off" maxLength={16} data-testid="account-name" />
            <input className={field} type="password" value={password} onChange={(e: { target: { value: string } }) => setPassword(e.target.value)} placeholder={t("密碼")} autoComplete="current-password" maxLength={128} data-testid="account-password" />
            <button type="submit" disabled={!!busy || !name || !password} className={cn(bigBtn, "h-11 bg-[#3B5BA9] py-1.5 text-base")} data-testid="account-submit">
              {busy === "old" ? t("請稍候…") : t("登入")}
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setOld(true)} className="w-full cursor-pointer text-center text-xs font-bold text-[#64748B] underline underline-offset-4" data-testid="account-old">
            {t("用舊帳號名稱和密碼登入")}
          </button>
        )}
      </div>
    </div>
  );
}

/** The account block in 設定. */
export function AccountPanel({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useLang();
  const me = typeof window === "undefined" ? null : session();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!me) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#F4F6FA] px-3 py-2" data-testid="account-panel">
        <span className="text-sm font-black text-[#1E3A8A]">👤 {t("訪客")}</span>
        <button type="button" onClick={onSignIn} className="cursor-pointer rounded-full bg-[#22A447] px-3 py-1.5 text-xs font-black text-white" data-testid="account-open">
          {t("登入")}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl bg-[#F4F6FA] px-3 py-2" data-testid="account-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-black text-[#1E3A8A]">
          {me.provider === "apple.com" ? "" : me.provider === "google.com" ? "G" : "👤"} {me.name}
        </span>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.reload();
            }}
            className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#1E3A8A] ring-1 ring-[#D6DEEA]"
            data-testid="account-signout"
          >
            {t("登出")}
          </button>
          <button type="button" onClick={() => setDeleting(true)} className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#DC2626] ring-1 ring-[#FECACA]" data-testid="account-delete">
            {t("刪除帳號")}
          </button>
        </div>
      </div>
      {deleting ? (
        <div className="space-y-2 rounded-xl border-2 border-[#FECACA] bg-white p-2.5">
          {usesPassword() ? (
            <>
              <p className="text-xs font-black text-[#DC2626]">{t("刪除後，帳號及雲端進度將永久消失，無法復原。請輸入密碼確認：")}</p>
              <input className={cn(field, "h-10")} type="password" value={password} onChange={(e: { target: { value: string } }) => setPassword(e.target.value)} placeholder={t("密碼")} autoComplete="current-password" data-testid="account-delete-password" />
            </>
          ) : (
            <p className="text-xs font-black text-[#DC2626]">{t("刪除後，帳號及雲端進度將永久消失，無法復原。確定要刪除嗎？")}</p>
          )}
          {error ? <p className="text-xs font-black text-[#DC2626]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (setDeleting(false), setPassword(""), setError(""))} className="cursor-pointer rounded-full bg-[#E5E7EB] py-2 text-sm font-black">
              {t("取消")}
            </button>
            <button
              type="button"
              disabled={busy || (usesPassword() && !password)}
              onClick={async () => {
                setBusy(true);
                const r = await deleteMyAccount(password);
                setBusy(false);
                if (!r.ok) return setError(t(ACCOUNT_ERRORS[r.error] ?? ACCOUNT_ERRORS.server));
                window.location.reload();
              }}
              className="cursor-pointer rounded-full bg-[#DC2626] py-2 text-sm font-black text-white disabled:opacity-50"
              data-testid="account-delete-confirm"
            >
              {busy ? t("請稍候…") : t("永久刪除")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

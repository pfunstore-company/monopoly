"use client";

/**
 * 帳號 screens (Sky 2026-10-22): the sign-in / make-an-account page on the way into the game (or play as a guest),
 * and the account block in 設定 with sign out and 刪除帳號.
 */
import { useState } from "react";
import { ACCOUNT_ERRORS, deleteMyAccount, playAsGuest, session, signIn, signOut } from "@/lib/account";
import { useLang } from "@/lib/i18n";
import { cn } from "cn";

const field = "h-12 w-full rounded-2xl border-[3px] border-[#D6DEEA] bg-white px-4 text-base font-bold text-[#1E3A8A] outline-none focus:border-[#FBD000]";
const bigBtn = "h-13 w-full cursor-pointer rounded-full border-4 border-[#FBD000] py-2.5 text-lg font-black text-white disabled:cursor-default disabled:opacity-60";

/** Sign in or make an account; `onGuest` when the player would rather just play. */
export function AccountGate({ onDone, onGuest }: { onDone: (reload: boolean) => void; onGuest?: () => void }) {
  const { t } = useLang();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (mode === "register" && password !== again) return setError(t("兩次輸入的密碼不一致"));
    setBusy(true);
    setError("");
    const r = await signIn(mode, name.trim(), password);
    setBusy(false);
    if (!r.ok) return setError(t(ACCOUNT_ERRORS[r.error] ?? ACCOUNT_ERRORS.server));
    onDone(r.reload);
  };
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-[#0B1030]/85 sm:items-center" data-testid="account-gate">
      <div className="w-full max-w-md space-y-3 rounded-t-[32px] bg-gradient-to-b from-white to-[#EEF3FB] p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-[32px]">
        <p className="text-center text-2xl font-black text-[#1E3A8A]">{t("歡迎來到 Boolionaire")}</p>
        <p className="-mt-1 text-center text-xs font-bold text-[#475569]">{t("登入後遊戲進度會儲存在雲端，換手機也不會遺失")}</p>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[#E3E9F3] p-1" role="tablist">
          {(["register", "login"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={cn("cursor-pointer rounded-full py-2 text-sm font-black transition", mode === m ? "bg-white text-[#1E3A8A] shadow" : "text-[#64748B]")}
              data-testid={`account-tab-${m}`}
            >
              {m === "register" ? t("建立帳號") : t("登入")}
            </button>
          ))}
        </div>
        <form
          className="space-y-2.5"
          onSubmit={(e: { preventDefault: () => void }) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input className={field} value={name} onChange={(e: { target: { value: string } }) => setName(e.target.value)} placeholder={t("帳號名稱")} autoComplete="username" autoCapitalize="off" autoCorrect="off" maxLength={16} data-testid="account-name" />
          <input className={field} type="password" value={password} onChange={(e: { target: { value: string } }) => setPassword(e.target.value)} placeholder={t("密碼（至少 6 個字元）")} autoComplete={mode === "register" ? "new-password" : "current-password"} maxLength={128} data-testid="account-password" />
          {mode === "register" ? (
            <input className={field} type="password" value={again} onChange={(e: { target: { value: string } }) => setAgain(e.target.value)} placeholder={t("再輸入一次密碼")} autoComplete="new-password" maxLength={128} data-testid="account-again" />
          ) : null}
          {error ? <p className="text-center text-sm font-black text-[#DC2626]" data-testid="account-error">{error}</p> : null}
          <button type="submit" disabled={busy || !name || !password} className={cn(bigBtn, "bg-gradient-to-b from-[#22A447] to-[#167A33] shadow-[0_5px_0_#0F5A25]")} data-testid="account-submit">
            {busy ? t("請稍候…") : mode === "register" ? t("建立帳號並開始") : t("登入")}
          </button>
        </form>
        {onGuest ? (
          <button
            type="button"
            onClick={() => {
              playAsGuest();
              onGuest();
            }}
            className="w-full cursor-pointer py-1 text-center text-sm font-black text-[#3B5BA9] underline underline-offset-4"
            data-testid="account-guest"
          >
            {t("先以訪客身分試玩")}
          </button>
        ) : null}
        <p className="text-center text-[10px] font-bold text-[#94A3B8]">{t("訪客進度只會儲存在這部手機，之後隨時可在設定中建立帳號")}</p>
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
          {t("登入／建立帳號")}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl bg-[#F4F6FA] px-3 py-2" data-testid="account-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-black text-[#1E3A8A]">👤 {me.name}</span>
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
          <p className="text-xs font-black text-[#DC2626]">{t("刪除後，帳號及雲端進度將永久消失，無法復原。請輸入密碼確認：")}</p>
          <input className={cn(field, "h-10")} type="password" value={password} onChange={(e: { target: { value: string } }) => setPassword(e.target.value)} placeholder={t("密碼")} autoComplete="current-password" data-testid="account-delete-password" />
          {error ? <p className="text-xs font-black text-[#DC2626]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (setDeleting(false), setPassword(""), setError(""))} className="cursor-pointer rounded-full bg-[#E5E7EB] py-2 text-sm font-black">
              {t("取消")}
            </button>
            <button
              type="button"
              disabled={busy || !password}
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

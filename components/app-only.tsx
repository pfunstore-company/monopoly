"use client";

/**
 * 只做 app (Sky 2026-10-23): the game is played in the iPhone / Android app; in a browser the site shows this page
 * instead. While testing, a small 測試入口 lets Sky (and Claude) still try things on a computer; it goes before launch.
 */
import { useLang } from "@/lib/i18n";
import { TESTING } from "@/lib/shop";

const TESTER_KEY = "bn-tester";

/** Whether this page runs inside the app (Capacitor puts its bridge in before the page's own scripts). */
export function inApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** A browser that may still play: only a tester, only while testing. */
export function testerBrowser(): boolean {
  if (!TESTING || typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("tester") === "1") localStorage.setItem(TESTER_KEY, "1");
    return localStorage.getItem(TESTER_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppOnly({ onTester }: { onTester: () => void }) {
  const { t } = useLang();
  return (
    <main
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#1E1446] bg-cover bg-center px-6 text-center text-white"
      style={{ backgroundImage: "linear-gradient(rgba(10,8,40,0.35), rgba(10,8,40,0.75)), url(/art/space-realm.webp)" }}
      data-testid="app-only"
    >
      <img src="/icon-512.png" alt="" className="size-28 rounded-[28px] shadow-2xl" onError={(e: { currentTarget: HTMLImageElement }) => (e.currentTarget.style.display = "none")} />
      <h1 className="text-3xl font-black drop-shadow-[0_3px_0_#1E3A8A]">Boolionaire</h1>
      <p className="max-w-xs text-base font-bold">{t("請下載 Boolionaire app 開始遊戲")}</p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <span className="rounded-full bg-black/70 py-3 text-base font-black"> App Store · {t("即將推出")}</span>
        <span className="rounded-full bg-black/70 py-3 text-base font-black">▶ Google Play · {t("即將推出")}</span>
      </div>
      <a href="/delete-account.html" className="text-xs font-bold text-white/60 underline">
        {t("刪除帳號")}
      </a>
      {TESTING ? (
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(TESTER_KEY, "1");
            } catch {
              // Only for this visit.
            }
            onTester();
          }}
          className="absolute bottom-[max(env(safe-area-inset-bottom),1rem)] cursor-pointer text-[11px] font-bold text-white/30"
          data-testid="tester-entry"
        >
          {t("測試入口")}
        </button>
      ) : null}
    </main>
  );
}

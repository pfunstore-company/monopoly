"use client";

import { useEffect, useRef, useState } from "react";

import { useLang } from "@/lib/i18n";
import { earnAd, nativeAds, showRewarded, type AdKind } from "@/lib/ads";
import { TESTING } from "@/lib/shop";

/** How long the tester's countdown card runs (a real rewarded ad is usually 15–30 s). */
export const FAKE_AD_SECONDS = 5;

const ERRORS = {
  limit: "今日廣告次數已用完，聽日再嚟",
  "no-ad": "暫時未有廣告，請遲啲再試",
  offline: "無法連線，請檢查網路後再試",
  server: "伺服器發生問題，請稍後再試",
} as const;

/**
 * 睇廣告攞獎勵 (Sky 2026-10-08; server-checked 2026-10-23). In the app a real AdMob rewarded ad plays; if none can
 * play there is no reward. In a browser only the tester's countdown card exists, and only while testing. The
 * reward itself comes from the server (lib/ads.ts earnAd), which counts the day's ads and, with real ads, waits
 * for Google to confirm the ad was watched.
 */
export function FakeAd({ kind, onDone, onCancel }: { kind: AdKind; onDone: (r: { energy: number; left: number }) => void; onCancel: () => void }) {
  const { t } = useLang();
  const native = !!nativeAds();
  const [phase, setPhase] = useState<"loading" | "countdown" | "claiming" | "error">(native ? "loading" : TESTING ? "countdown" : "error");
  const [error, setError] = useState<string>(native || TESTING ? "" : ERRORS["no-ad"]);
  const [left, setLeft] = useState(FAKE_AD_SECONDS);
  // The tester's card: resolves when the countdown is claimed (or closed).
  const card = useRef<((r: "rewarded" | "closed") => void) | null>(null);

  useEffect(() => {
    if (!native && !TESTING) return;
    let alive = true;
    void earnAd(kind, (ssv) => {
      if (native) return showRewarded(ssv);
      return new Promise<"rewarded" | "closed">((resolve) => {
        card.current = resolve;
        if (alive) setPhase("countdown");
      });
    }).then((r) => {
      if (!alive) return;
      if (r.ok) return onDone({ energy: r.energy, left: r.left });
      if (r.error === "closed") return onCancel();
      setError(ERRORS[r.error]);
      setPhase("error");
    });
    return () => {
      alive = false;
    };
    // Runs once when the card opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "countdown" || left <= 0) return;
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left, phase]);

  if (phase === "loading" || phase === "claiming") {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/80 text-white" data-testid="ad-loading">
        <p className="animate-pulse text-lg font-black">{t("廣告載入中…")}</p>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 bg-black/85 px-6 text-center text-white" data-testid="ad-error">
        <p className="text-5xl">📺</p>
        <p className="text-lg font-black">{t(error)}</p>
        <button type="button" onClick={onCancel} className="h-12 w-full max-w-xs cursor-pointer rounded-full bg-white/90 text-lg font-black text-[#1E3A8A]">
          {t("知道")}
        </button>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/90 px-6 text-center text-white" data-testid="fake-ad">
      <p className="rounded-full bg-white/15 px-3 py-0.5 text-xs font-black">{t("測試廣告")}</p>
      <p className="mt-6 text-6xl">📺</p>
      <p className="mt-4 text-lg font-black">{t("呢度之後會播真廣告")}</p>
      <p className="mt-2 text-sm font-bold text-white/70">{t("睇完就有獎勵")}</p>
      {left > 0 ? (
        <>
          <p className="mt-6 text-4xl font-black tabular-nums">{left}</p>
          <button type="button" onClick={() => card.current?.("closed")} className="mt-6 cursor-pointer text-sm font-bold text-white/60 underline">
            {t("唔睇（冇獎勵）")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setPhase("claiming");
            card.current?.("rewarded");
          }}
          className="mt-6 h-14 w-full max-w-xs cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#16A34A] text-xl font-black shadow-[0_5px_0_#166534]"
          data-testid="fake-ad-claim"
        >
          {t("領獎勵")}
        </button>
      )}
    </div>
  );
}

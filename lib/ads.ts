/**
 * 廣告 (Sky 2026-10-22): in the iPhone app, real AdMob ads — 獎勵式 (unit "Rewarded - Energy"), 插頁式 after a game
 * (unit "Interstitial - After game") and 開啟應用程式 on start / coming back (unit "App Open");
 * in a browser there is no AdMob, and the test card (components/fake-ad.tsx) stands in.
 * While testing, Google's own sample ad unit is used: tapping your own live ads can get an AdMob account banned.
 */
import { TESTING } from "@/lib/shop";

const SAMPLE_REWARDED = "ca-app-pub-3940256099942544/1712485313";
const REWARDED = "ca-app-pub-8275164530713085/1844135448";
const SAMPLE_INTERSTITIAL = "ca-app-pub-3940256099942544/4411468910";
const INTERSTITIAL = "ca-app-pub-8275164530713085/4996912390";
const SAMPLE_APP_OPEN = "ca-app-pub-3940256099942544/5575463023";
const APP_OPEN = "ca-app-pub-8275164530713085/9205504738";

/** No 插頁式 more often than this, and never after the very first game. */
const INTERSTITIAL_GAP_MS = 3 * 60_000;
/** 開啟應用程式 again only after being away at least this long. */
const AWAY_MS = 30_000;

type Listener = { remove(): void };
type AdMob = {
  initialize(o: object): Promise<void>;
  prepareRewardVideoAd(o: object): Promise<unknown>;
  showRewardVideoAd(): Promise<{ type?: string; amount?: number } | undefined>;
  prepareInterstitial(o: object): Promise<unknown>;
  showInterstitial(): Promise<void>;
  loadAppOpen(o: object): Promise<unknown>;
  showAppOpen(o?: object): Promise<unknown>;
  isAppOpenLoaded(o?: object): Promise<{ value: boolean }>;
  addListener(event: string, fn: () => void): Promise<Listener>;
};

/** The AdMob plugin when running inside the app. */
export function nativeAds(): AdMob | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { AdMob?: AdMob } } }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.AdMob ?? null) : null;
}

let ready: Promise<void> | null = null;
/** A full-screen ad is up: don't stack another on top. */
let showing = false;

async function start(ad: AdMob): Promise<boolean> {
  try {
    ready ??= ad.initialize({ initializeForTesting: TESTING });
    await ready;
    return true;
  } catch {
    ready = null;
    return false;
  }
}

/** Show one full-screen ad and wait until it is gone (or failed). */
function fullScreen(ad: AdMob, closeEvents: string[], show: () => Promise<unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const subs: Listener[] = [];
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      showing = false;
      window.clearTimeout(timer);
      subs.forEach((s) => s.remove());
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), 120_000);
    showing = true;
    void (async () => {
      try {
        for (const e of closeEvents) subs.push(await ad.addListener(e, () => finish(true)));
        await show();
      } catch {
        finish(false);
      }
    })();
  });
}

let gamesDone = 0;
let lastInterstitial = 0;

/** 插頁式廣告 when leaving a finished game; resolves once it is closed, so the next screen can follow. */
export async function afterGameAd(): Promise<void> {
  gamesDone += 1;
  const ad = nativeAds();
  if (!ad || showing || gamesDone < 2 || Date.now() - lastInterstitial < INTERSTITIAL_GAP_MS) return;
  if (!(await start(ad))) return;
  try {
    await ad.prepareInterstitial({ adId: TESTING ? SAMPLE_INTERSTITIAL : INTERSTITIAL, isTesting: TESTING });
  } catch {
    return;
  }
  lastInterstitial = Date.now();
  await fullScreen(ad, ["interstitialAdDismissed", "interstitialAdFailedToShow"], () => ad.showInterstitial());
}

let appOpenStarted = false;

/** 開啟應用程式廣告: once when the app starts, and again when coming back after being away a while. */
export function startAppOpenAds(): void {
  const ad = nativeAds();
  if (!ad || appOpenStarted) return;
  appOpenStarted = true;
  const adId = TESTING ? SAMPLE_APP_OPEN : APP_OPEN;
  const load = async () => {
    if (!(await start(ad))) return false;
    try {
      await ad.loadAppOpen({ adId, isTesting: TESTING });
      return (await ad.isAppOpenLoaded({ adId })).value;
    } catch {
      return false;
    }
  };
  const show = async () => {
    if (showing || !(await load()) || showing) return;
    await fullScreen(ad, ["appOpenAdClosed", "appOpenAdFailedToShow"], () => ad.showAppOpen({ adId }));
    void load(); // ready for next time
  };
  // On start: only if it is ready within a few seconds, so nobody waits on a slow network.
  void Promise.race([load(), new Promise<boolean>((r) => window.setTimeout(() => r(false), 4000))]).then((ok) => {
    if (ok) void show();
  });
  let away = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") away = Date.now();
    else if (away && Date.now() - away >= AWAY_MS && !showing) void show();
  });
}

/** Play a rewarded ad: "rewarded" when watched to the end, "closed" when skipped, "failed" when none could play. */
export async function showRewarded(): Promise<"rewarded" | "closed" | "failed"> {
  const ad = nativeAds();
  if (!ad || !(await start(ad))) return "failed";
  showing = true;
  return new Promise((resolve) => {
    let rewarded = false;
    let done = false;
    const subs: Listener[] = [];
    const finish = (r: "rewarded" | "closed" | "failed") => {
      if (done) return;
      done = true;
      showing = false;
      subs.forEach((s) => s.remove());
      resolve(r);
    };
    const timer = window.setTimeout(() => finish(rewarded ? "rewarded" : "failed"), 180_000);
    void (async () => {
      try {
        subs.push(await ad.addListener("onRewardedVideoAdReward", () => (rewarded = true)));
        subs.push(
          await ad.addListener("onRewardedVideoAdDismissed", () => {
            window.clearTimeout(timer);
            // The reward event can land a moment after the dismissal.
            window.setTimeout(() => finish(rewarded ? "rewarded" : "closed"), 300);
          }),
        );
        subs.push(await ad.addListener("onRewardedVideoAdFailedToShow", () => finish("failed")));
        await ad.prepareRewardVideoAd({ adId: TESTING ? SAMPLE_REWARDED : REWARDED, isTesting: TESTING });
        const item = await ad.showRewardVideoAd();
        if (item) rewarded = true;
      } catch {
        window.clearTimeout(timer);
        finish("failed");
      }
    })();
  });
}

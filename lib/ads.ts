/**
 * 獎勵廣告 (Sky 2026-10-22): in the iPhone app, real AdMob rewarded ads (app Boolionaire, unit "Rewarded - Energy");
 * in a browser there is no AdMob, and the test card (components/fake-ad.tsx) stands in.
 * While testing, Google's own sample ad unit is used: tapping your own live ads can get an AdMob account banned.
 */
import { TESTING } from "@/lib/shop";

const SAMPLE_REWARDED = "ca-app-pub-3940256099942544/1712485313";
const REWARDED = "ca-app-pub-8275164530713085/1844135448";

type Listener = { remove(): void };
type AdMob = {
  initialize(o: object): Promise<void>;
  prepareRewardVideoAd(o: object): Promise<unknown>;
  showRewardVideoAd(): Promise<{ type?: string; amount?: number } | undefined>;
  addListener(event: string, fn: () => void): Promise<Listener>;
};

/** The AdMob plugin when running inside the app. */
export function nativeAds(): AdMob | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { AdMob?: AdMob } } }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.AdMob ?? null) : null;
}

let ready: Promise<void> | null = null;

/** Play a rewarded ad: "rewarded" when watched to the end, "closed" when skipped, "failed" when none could play. */
export async function showRewarded(): Promise<"rewarded" | "closed" | "failed"> {
  const ad = nativeAds();
  if (!ad) return "failed";
  try {
    ready ??= ad.initialize({ initializeForTesting: TESTING });
    await ready;
  } catch {
    ready = null;
    return "failed";
  }
  return new Promise((resolve) => {
    let rewarded = false;
    let done = false;
    const subs: Listener[] = [];
    const finish = (r: "rewarded" | "closed" | "failed") => {
      if (done) return;
      done = true;
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

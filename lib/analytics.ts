/**
 * 用戶數據 (Sky 2026-10-22): Firebase Analytics in the iPhone / Android app (project "Boolionaire").
 * Opens, sessions and screen time are collected by Firebase itself; this adds a few game events on top.
 * In a browser there is no Firebase, so these do nothing.
 */
type FirebaseAnalytics = { logEvent(o: { name: string; params?: Record<string, string | number> }): Promise<void> };

function native(): FirebaseAnalytics | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { FirebaseAnalytics?: FirebaseAnalytics } } }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.FirebaseAnalytics ?? null) : null;
}

/** Record one game event; never throws. */
export function track(name: string, params?: Record<string, string | number>): void {
  void native()
    ?.logEvent({ name, params })
    .catch(() => {});
}

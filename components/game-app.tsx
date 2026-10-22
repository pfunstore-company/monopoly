"use client";

import { JuiceLayer } from "@/components/juice";
import { DailyGame } from "@/components/daily-game";
import { StoryVideo, storySeen } from "@/components/story-video";
import { TitleScreen } from "@/components/title-screen";
import { PartnerPick } from "@/components/hero-sheet";
import { AccountGate } from "@/components/account-screen";
import { isGuest, session, startAutoSync } from "@/lib/account";
import { loadCollection, saveCollection } from "@/components/wallet-store";
import { choosePartner } from "@/lib/shop";
import { initMusic } from "@/lib/music";
import { startAppOpenAds } from "@/lib/ads";
import { savePick } from "@/lib/characters";
import { useEffect, useState } from "react";

export function GameApp() {
  const [started, setStarted] = useState(false);
  const [story, setStory] = useState(false);
  // 夥伴 (Sky 2026-10-21): the first time in, after the story, pick an R character to keep.
  const [partner, setPartner] = useState(true);
  // 帳號 (Sky 2026-10-22): on the way in, sign in / make an account, or play as a guest.
  const [account, setAccount] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setPartner(!!loadCollection().partner);
      setAccount(!!session() || isGuest());
      if (session()) startAutoSync();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => initMusic(), []);
  useEffect(() => startAppOpenAds(), []);
  // Portrait only (Sky 2026-10-02): where the browser allows it (an installed app on Android), lock it upright.
  useEffect(() => {
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o.lock?.("portrait").catch(() => {});
    } catch {
      // Not allowed here; the sideways cover in the layout does the job.
    }
  }, []);
  return (
    <>
      {started ? (
        <DailyGame />
      ) : (
        <TitleScreen
          onStart={() => {
            // The story plays once, the first time this device presses START.
            if (!storySeen()) setStory(true);
            setStarted(true);
          }}
        />
      )}
      {story ? <StoryVideo onDone={() => setStory(false)} /> : null}
      {started && !story && !account ? (
        <AccountGate
          onDone={(reload) => {
            if (reload) return window.location.reload();
            startAutoSync();
            setAccount(true);
            setPartner(!!loadCollection().partner);
          }}
          onGuest={() => setAccount(true)}
        />
      ) : null}
      {started && !story && account && !partner ? (
        <PartnerPick
          onPick={(id) => {
            saveCollection(choosePartner(loadCollection(), id, Date.now()));
            // The board's character follows the pick (lib/characters order).
            const index = ["vampire", "jiangshi", "mummy", "zombie"].indexOf(id);
            if (index >= 0) savePick(index);
            setPartner(true);
          }}
        />
      ) : null}
      <JuiceLayer />
    </>
  );
}

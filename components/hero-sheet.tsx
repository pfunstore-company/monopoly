"use client";

/**
 * 夥伴 and 角色升級 (Sky 2026-10-21): the first-time 揀你嘅夥伴 screen, and the sheet that levels a character up
 * with 碎片 and holds the one 重選夥伴.
 */
import { useState } from "react";
import { juice } from "@/components/juice";
import { HERO_LEVELS, levelCost, MAX_HERO_LEVEL, type HeroId } from "@/lib/heroes";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { HEROES, STARTERS, TESTING, heroLevel, levelUp, owns, repick, repickAt, repickChoices, type Collection } from "@/lib/shop";
import { cn } from "cn";

const heroOf = (id: string) => HEROES.find((h) => h.id === id)!;

/** A character's face, with a gold ring at Lv5. */
export function HeroFace({ id, level = 1, className }: { id: string; level?: number; className?: string }) {
  const h = heroOf(id);
  return (
    <img
      src={h.avatar}
      alt=""
      draggable={false}
      className={cn("rounded-full border-[3px] object-cover", level >= MAX_HERO_LEVEL ? "border-[#FBD000] shadow-[0_0_14px_4px_rgba(251,208,0,0.7)]" : "border-white", className)}
    />
  );
}

export function LevelBadge({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn("rounded-full px-1.5 text-[10px] font-black leading-4 text-white", level >= MAX_HERO_LEVEL ? "bg-gradient-to-r from-[#F59E0B] to-[#FBD000] text-[#5B3A00]" : "bg-[#3B5BA9]", className)}>
      Lv{level}
    </span>
  );
}

/** Lv1–Lv5 list, the one you're at highlighted. */
function LevelList({ id, level }: { id: HeroId; level: number }) {
  const { t } = useLang();
  return (
    <ol className="space-y-1">
      {HERO_LEVELS[id].map((line, i) => {
        const at = i + 1;
        return (
          <li key={i} className={cn("flex items-start gap-2 rounded-xl px-2 py-1 text-xs font-bold", at <= level ? "bg-[#FFF4C2] text-[#5B3A00]" : "bg-[#F1F5F9] text-[#94A3B8]")}>
            <span className="w-8 shrink-0 font-black">Lv{at}</span>
            <span className="flex-1">{t(line)}</span>
            {at <= level ? <span>✓</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** First time in: pick one of the four R characters to keep. */
export function PartnerPick({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useLang();
  const [id, setId] = useState<string>(STARTERS[0]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0B1030]/80" data-testid="partner-pick">
      <div className="max-h-[92dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-[32px] bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <p className="text-center text-xl font-black">{t("揀你嘅夥伴")}</p>
        <p className="-mt-2 text-center text-xs font-bold text-[#475569]">{t("揀一隻陪你開始，其餘三隻可以喺角色卡池抽")}</p>
        <div className="grid grid-cols-4 gap-2">
          {STARTERS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setId(h)}
              aria-pressed={id === h}
              className={cn("flex cursor-pointer flex-col items-center rounded-2xl p-1.5 transition", id === h ? "scale-105 bg-[#FFF8D6] ring-2 ring-[#FBD000]" : "opacity-60")}
              data-testid={`partner-${h}`}
            >
              <HeroFace id={h} className="size-14" />
              <span className="mt-1 text-xs font-black">{t(heroOf(h).name)}</span>
            </button>
          ))}
        </div>
        <LevelList id={id as HeroId} level={1} />
        <p className="text-center text-[11px] font-bold text-[#475569]">
          {TESTING ? t("（測試期：全部角色照送，可以隨時重選）") : t("24 小時後可以重選一次；重選之後舊角色同佢嘅等級會冇咗")}
        </p>
        <button
          type="button"
          onClick={() => {
            play("lucky");
            juice("large");
            onPick(id);
          }}
          className="h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#22A447] to-[#167A33] text-xl font-black text-white shadow-[0_5px_0_#0F5A25]"
          data-testid="partner-go"
        >
          {t("就係佢！")}
        </button>
      </div>
    </div>
  );
}

/** One character: levels, 升級 with 碎片, and 重選夥伴 on the partner. */
export function HeroSheet({ col, id, onChange, onClose }: { col: Collection; id: string; onChange: (c: Collection) => void; onClose: () => void }) {
  const { t } = useLang();
  const [swap, setSwap] = useState<string | null>(null);
  const level = heroLevel(col, id);
  const cost = levelCost(level);
  const mine = owns(col, id);
  const partner = col.partner === id;
  const at = partner ? repickAt(col) : null;
  const now = Date.now();
  const hours = at !== null && at > now ? Math.ceil((at - now) / 3600000) : 0;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0B1030]/60" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-[32px] bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
        onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        data-testid="hero-sheet"
      >
        <div className="flex items-center gap-3">
          <HeroFace id={id} level={level} className="size-16" />
          <div className="flex-1">
            <p className="text-lg font-black">
              {t(heroOf(id).name)} <LevelBadge level={level} />
              {partner ? <span className="ml-1 rounded-full bg-[#FBD000] px-1.5 text-[10px] font-black">{t("夥伴")}</span> : null}
            </p>
            <p className="text-xs font-black text-[#3B5BA9]">{t("碎片 {n}", { n: col.shards })}</p>
          </div>
        </div>
        <LevelList id={id as HeroId} level={level} />
        {!mine ? (
          <p className="text-center text-sm font-black text-[#94A3B8]">{t("未擁有：喺角色卡池抽")}</p>
        ) : cost === null ? (
          <p className="text-center text-sm font-black text-[#B45309]">{t("已經升到最高級")}</p>
        ) : (
          <button
            type="button"
            disabled={col.shards < cost}
            onClick={() => {
              const next = levelUp(col, id);
              if (!next) return;
              play("lucky");
              juice("large");
              onChange(next);
            }}
            className="h-12 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#22A447] to-[#167A33] font-black text-white shadow-[0_4px_0_#0F5A25] disabled:cursor-default disabled:from-[#9CA3AF] disabled:to-[#9CA3AF] disabled:shadow-none"
            data-testid="level-up"
          >
            {t("升到 Lv{n}（{c} 碎片）", { n: level + 1, c: cost })}
          </button>
        )}
        {partner && at !== null ? (
          <div className="rounded-2xl bg-[#F1F5F9] p-2">
            <p className="text-center text-xs font-black">{t("重選夥伴")}</p>
            {hours > 0 ? (
              <p className="text-center text-[11px] font-bold text-[#475569]">{t("{n} 個鐘之後先可以重選", { n: hours })}</p>
            ) : (
              <div className="mt-1 flex justify-center gap-3">
                {repickChoices(col).map((h) => (
                  <button key={h} type="button" onClick={() => setSwap(h)} className="flex cursor-pointer flex-col items-center" data-testid={`repick-${h}`}>
                    <HeroFace id={h} className="size-10" />
                    <span className="text-[10px] font-black">{t(heroOf(h).name)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {swap ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-6" onClick={() => setSwap(null)}>
            <div className="w-full max-w-xs space-y-3 rounded-3xl border-4 border-[#E52521] bg-white p-4 text-center" onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}>
              <p className="font-black">{t("確定轉做{to}？", { to: t(heroOf(swap).name) })}</p>
              <p className="text-sm font-bold text-[#B91C1C]">
                {TESTING
                  ? t("（測試期：唔會冇咗任何嘢）")
                  : t("{from} Lv{n} 會冇咗，碎片唔退，只可以重選一次", { from: t(heroOf(id).name), n: level })}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSwap(null)} className="flex-1 cursor-pointer rounded-full bg-[#E5E7EB] py-2 font-black">
                  {t("唔換住")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = repick(col, swap, Date.now());
                    setSwap(null);
                    if (next) {
                      onChange(next);
                      onClose();
                    }
                  }}
                  className="flex-1 cursor-pointer rounded-full bg-[#E52521] py-2 font-black text-white"
                  data-testid="repick-confirm"
                >
                  {t("確定轉")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

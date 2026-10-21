"use client";

import { useEffect, useRef, useState } from "react";

import { GrowIntro, HATCH_MS } from "@/components/hatch-intro";
import { juice } from "@/components/juice";
import { PetView } from "@/components/pet-view";

import { type GameState } from "@/lib/game";
import { useLang } from "@/lib/i18n";
import { ELEMENTS, HATCH_ROLLS, HUNGRY_DROP, STAGE_NAMES, UPKEEP, feedOne, fedToday, growNeed, grownSoFar, mealLeft, petAttack, petName, rollElement, wants } from "@/lib/pet";
import { play } from "@/lib/sfx";
import { cn } from "cn";

/** Grade colours: N grey-blue, R blue, SR purple, SSR gold. */
const GRADE_COLOUR = ["#94A3B8", "#64748B", "#2563EB", "#9333EA", "#D97706"];

/** Your dragon: take a dragon egg (its attribute is random), then feed it 🍖 and 💎 to grow it from 龍蛋 to SSR. */
export function PetScreen({
  state,
  onPick,
  onFeed,
  onClose,
}: {
  state: GameState;
  onPick: (element: number) => void;
  /** 餵食 (Sky 2026-10-21): one 🍖 (0) or 💎 (1) from the store, by hand. */
  onFeed: (kind: 0 | 1) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const legend = false;
  const pet = state.pet;
  const need = pet ? growNeed(pet) : null;
  // 升級 show (Sky 2026-10-01): the stage really changes at the white flash, so the picture behind swaps then.
  const [growing, setGrowing] = useState<{ element: number; from: number; to: number } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  // Bites in the air: a 🍖 or 💎 flies from its button into the dragon's mouth, then it chomps.
  const [feeds, setFeeds] = useState(0);
  const [flyers, setFlyers] = useState<{ id: number; kind: 0 | 1; x: number; y: number }[]>([]);
  const view = useRef<HTMLDivElement>(null);
  const hold = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tired = !!pet && pet.stage > 0 && !fedToday(pet);
  const feed = (kind: 0 | 1, from: HTMLElement | null): boolean => {
    const now = stateRef.current;
    const p = now.pet;
    if (!p || growing || (kind === 0 ? now.meat : now.juice) <= 0 || !wants(p, kind)) return false;
    const out = feedOne(p, kind);
    if (!out) return false;
    play(kind === 0 ? "coin" : "lucky");
    const r = from?.getBoundingClientRect();
    const id = Date.now() + Math.random();
    if (r) setFlyers((f) => [...f.slice(-12), { id, kind, x: r.left + r.width / 2, y: r.top + r.height / 2 }]);
    timers.current.push(
      window.setTimeout(() => {
        setFlyers((f) => f.filter((x) => x.id !== id));
        setFeeds((n) => n + 1);
      }, 420),
    );
    if (out.grew) {
      // The last bite: the grow show, and the stage really changes at its white flash.
      play("chest");
      setGrowing({ element: p.element, from: p.stage, to: p.stage + 1 });
      timers.current.push(
        window.setTimeout(() => {
          juice("large", undefined, undefined, ELEMENTS[p.element].colour);
          onFeed(kind);
        }, HATCH_MS * 0.57),
        window.setTimeout(() => setGrowing(null), HATCH_MS + 100),
      );
      return false;
    }
    onFeed(kind);
    return true;
  };
  // Hold a feed button to keep feeding, quicker and quicker.
  const startHold = (kind: 0 | 1, el: HTMLElement) => {
    stopHold();
    if (!feed(kind, el)) return;
    let gap = 320;
    const again = () => {
      hold.current = window.setTimeout(() => {
        if (!feed(kind, el)) return stopHold();
        gap = Math.max(70, gap * 0.8);
        again();
      }, gap);
    };
    again();
  };
  const stopHold = () => {
    if (hold.current !== null) window.clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(() => stopHold, []);

  const Bar = (label: string, icon: string, have: number, want: number, colour: string, key: string) => {
    const done = have >= want;
    return (
      <div key={key} className="flex items-center gap-2">
        <img src={icon} alt="" className="size-6 object-contain drop-shadow" />
        <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-[#E3E9F3]">
          <span className={cn("block h-full rounded-full bg-gradient-to-r transition-[width] duration-200", done ? "from-[#22C55E] to-[#16A34A]" : colour)} style={{ width: `${want ? Math.min(100, (have / want) * 100) : 100}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black tabular-nums text-[#1E293B] [text-shadow:0_1px_0_rgba(255,255,255,0.8)]">
            {label} {Math.min(have, want)}／{want}
            {done ? " ✓" : ""}
          </span>
        </div>
      </div>
    );
  };

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#3d6fb0] via-[#1d3560] to-[#0b1428] text-white" data-testid="pet-screen">
      <header className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-2xl font-black text-white shadow-md"
          aria-label={t("返回棋盤")}
          data-testid="pet-back"
        >
          ←
        </button>
        <div className="flex items-center gap-2 text-base font-black tabular-nums" data-testid="pet-store">
          <span className="flex items-center gap-1 rounded-full border-2 border-[#FBD000] bg-white px-2.5 py-0.5 text-[#1E3A8A]">
            <img src="/art/icons/meat.webp" alt="" className="-my-1 size-6 object-contain" /> {state.meat}
          </span>
          <span className="flex items-center gap-1 rounded-full border-2 border-[#FBD000] bg-white px-2.5 py-0.5 text-[#1E3A8A]">
            <img src="/art/ui/crystal.webp" alt="" className="-my-1 size-6 object-contain" /> {state.juice}
          </span>
        </div>
      </header>

      {pet ? (
        <>
          <div ref={view} className="relative min-h-0 flex-1">
            {/* Sky (2026-10-08): always the 3D model dragon, bigger each grade, with its grade effect. */}
            <PetView key={`${pet.element}-${pet.stage}-${legend}`} element={pet.element} stage={pet.stage} legend={legend} hungry={pet.hungry > 0} tired={tired} feeds={feeds} onPet={() => play("lucky")} />
            {/* Hungry: a thought bubble with what it wants today. */}
            {tired ? (
              <div className="pointer-events-none absolute right-4 top-12 animate-[nudge_1.6s_ease-in-out_infinite] rounded-3xl border-2 border-white bg-white/95 px-3 py-1.5 text-[#1E3A8A] shadow-lg" data-testid="pet-wants">
                <p className="text-[11px] font-black">{t("肚餓…想食：")}</p>
                <p className="flex items-center gap-1.5 text-sm font-black tabular-nums">
                  {mealLeft(pet)[0] > 0 ? (
                    <span className="flex items-center gap-0.5">
                      <img src="/art/icons/meat.webp" alt="" className="size-5 object-contain" />×{mealLeft(pet)[0]}
                    </span>
                  ) : null}
                  {mealLeft(pet)[1] > 0 ? (
                    <span className="flex items-center gap-0.5">
                      <img src="/art/ui/crystal.webp" alt="" className="size-5 object-contain" />×{mealLeft(pet)[1]}
                    </span>
                  ) : null}
                </p>
                <span className="absolute -bottom-2 left-5 size-3 rounded-full border-2 border-white bg-white/95" />
                <span className="absolute -bottom-4 left-3 size-1.5 rounded-full bg-white/95" />
              </div>
            ) : null}
            {pet.stage > 0 ? (
              <span
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border-2 border-white/70 px-3 py-0.5 text-sm font-black text-white shadow"
                style={{ background: ELEMENTS[pet.element].colour }}
                data-testid="pet-element"
              >
                {t("{e}屬性", { e: t(ELEMENTS[pet.element].name) })}
              </span>
            ) : (
              <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/40 px-3 py-0.5 text-sm font-black text-white" data-testid="pet-element">
                {t("屬性：？孵出嚟先知")}
              </span>
            )}
          </div>
          {/* Sky 2026-10-21: a tidier card — name and grade, mood, the road N → SSR, what it eats, and what's still missing. */}
          <section className="space-y-3 rounded-t-[32px] bg-gradient-to-b from-white to-[#EEF3FB] px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 text-[#1E3A8A] shadow-[0_-6px_24px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black" data-testid="pet-name">
                {pet.stage === 0 ? t("龍蛋") : t(petName(pet, legend))}
              </h1>
              {pet.stage > 0 ? (
                <span className="rounded-lg px-2 py-0.5 text-sm font-black text-white shadow" style={{ background: GRADE_COLOUR[pet.stage] }}>
                  {STAGE_NAMES[pet.stage]}
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-1 rounded-full bg-[#1E3A8A] px-3 py-1 text-sm font-black text-white tabular-nums">
                ⚔️ {petAttack(pet, legend)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn("rounded-full px-3 py-1 text-sm font-black", pet.stage === 0 ? "bg-[#FEF3C7] text-[#92400E]" : tired ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#DCFCE7] text-[#166534]")}
                data-testid="pet-mood"
              >
                {pet.stage === 0
                  ? t("🥚 龍蛋唔使食嘢。")
                  : tired
                    ? pet.hungry > 0
                      ? t("😩 餓咗 {n} 日，好冇精神！再餓會跌階段", { n: pet.hungry, m: HUNGRY_DROP })
                      : t("😴 未食今日餐，冇乜精神")
                    : t("😊 食飽飽，精神好")}
              </span>
            </div>
            {pet.stage > 0 ? (
              // The road from N to SSR, where it is now lit.
              <div className="flex items-center" data-testid="pet-road">
                {STAGE_NAMES.slice(1).map((name, k) => {
                  const at = k + 1;
                  return (
                    <div key={name} className="flex flex-1 items-center last:flex-none">
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-full text-xs font-black",
                          at < pet.stage ? "bg-[#16A34A] text-white" : at === pet.stage ? "scale-110 text-white ring-4 ring-[#FBD000]/60" : "bg-[#E3E9F3] text-[#94A3B8]",
                        )}
                        style={at === pet.stage ? { background: GRADE_COLOUR[at] } : undefined}
                      >
                        {at < pet.stage ? "✓" : name}
                      </span>
                      {at < STAGE_NAMES.length - 1 ? <span className={cn("mx-1 h-1 flex-1 rounded-full", at < pet.stage ? "bg-[#16A34A]" : "bg-[#E3E9F3]")} /> : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {pet.stage === 0 ? (
              <div className="space-y-1.5 rounded-2xl bg-white p-3 ring-1 ring-[#DCE4F2]" data-testid="hatch-progress">
                <p className="text-sm font-black">{t("喺棋盤擲夠 {n} 次骰就會自己孵出嚟：", { n: HATCH_ROLLS })}</p>
                <div className="relative h-6 overflow-hidden rounded-full bg-[#E3E9F3]">
                  <span className="block h-full rounded-full bg-gradient-to-r from-[#FBBF24] to-[#F59E0B]" style={{ width: `${Math.min(100, (pet.rolls / HATCH_ROLLS) * 100)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums">
                    🥚 {pet.rolls}／{HATCH_ROLLS}
                  </span>
                </div>
                <p className="text-center text-xs font-bold text-[#3B5BA9]">{t("公開桌擲骰唔計。")}</p>
              </div>
            ) : (
              <>
                {/* Today's meal, then what's fed toward the next stage. */}
                <div className="space-y-1.5 rounded-2xl bg-white p-3 ring-1 ring-[#DCE4F2]" data-testid="pet-meal">
                  <p className="text-sm font-black">{fedToday(pet) ? t("今日餐 ✓ 食飽咗") : t("今日餐（每日要餵）")}</p>
                  {Bar("", "/art/icons/meat.webp", UPKEEP[pet.stage][0] - mealLeft(pet)[0], UPKEEP[pet.stage][0], "from-[#F97316] to-[#EA580C]", "m0")}
                  {UPKEEP[pet.stage][1] ? Bar("", "/art/ui/crystal.webp", UPKEEP[pet.stage][1] - mealLeft(pet)[1], UPKEEP[pet.stage][1], "from-[#A78BFA] to-[#7C3AED]", "m1") : null}
                  {need ? (
                    <>
                      <p className="pt-1 text-sm font-black">{t("長大做「{s}」：", { s: t(STAGE_NAMES[pet.stage + 1]) })}</p>
                      {Bar("", "/art/icons/meat.webp", grownSoFar(pet)[0], need[0], "from-[#F97316] to-[#EA580C]", "g0")}
                      {Bar("", "/art/ui/crystal.webp", grownSoFar(pet)[1], need[1], "from-[#A78BFA] to-[#7C3AED]", "g1")}
                    </>
                  ) : (
                    <p className="pt-1 text-center text-sm font-black text-[#D97706]">{t("👑 已經係 SSR！")}</p>
                  )}
                </div>
                {/* Feed by hand: tap for one, hold to keep going. */}
                <div className="grid grid-cols-2 gap-2" data-testid="pet-feed">
                  {([0, 1] as const).map((kind) => {
                    const have = kind === 0 ? state.meat : state.juice;
                    const ok = have > 0 && wants(pet, kind) && !growing;
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={!ok}
                        onPointerDown={(e: { currentTarget: HTMLElement }) => startHold(kind, e.currentTarget)}
                        onPointerUp={stopHold}
                        onPointerLeave={stopHold}
                        onPointerCancel={stopHold}
                        onContextMenu={(e: { preventDefault: () => void }) => e.preventDefault()}
                        className={cn(
                          "flex h-16 cursor-pointer touch-none select-none items-center justify-center gap-2 rounded-3xl border-4 font-black active:scale-95 disabled:cursor-default",
                          ok
                            ? kind === 0
                              ? "border-[#FBD000] bg-[#F97316] text-white shadow-[0_5px_0_#9A3412]"
                              : "border-[#FBD000] bg-[#8B5CF6] text-white shadow-[0_5px_0_#4C1D95]"
                            : "border-[#CBD5E1] bg-[#F1F5F9] text-[#94A3B8]",
                          ok && tired && "animate-[nudge_1.6s_ease-in-out_infinite]",
                        )}
                        data-testid={kind === 0 ? "feed-meat" : "feed-gem"}
                      >
                        <img src={kind === 0 ? "/art/icons/meat.webp" : "/art/ui/crystal.webp"} alt="" draggable={false} className="size-9 object-contain drop-shadow" />
                        <span className="flex flex-col items-start leading-tight">
                          <span className="text-lg">{kind === 0 ? t("餵肉") : t("餵水晶")}</span>
                          <span className="text-[11px] opacity-90 tabular-nums">{t("倉庫 {n}", { n: have })}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-center text-[11px] font-bold text-[#3B5BA9]">{t("撳一下餵一粒，㩒住會一路餵。🍖 喺棋盤肉格攞，💎 去偷嘢格偷返嚟。")}</p>
              </>
            )}
          </section>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-center text-2xl font-black drop-shadow">{t("領取你嘅龍蛋")}</h1>
          <div className="relative min-h-0 flex-1">
            <PetView key="new-egg" element={0} stage={0} />
          </div>
          <section className="space-y-3 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 text-[#1E3A8A]">
            <div className="grid grid-cols-3 gap-2" data-testid="odds">
              {ELEMENTS.map((element) => (
                <div key={element.id} className="flex flex-col items-center rounded-2xl bg-[#F1F4F9] py-1.5">
                  <span className="text-xl font-black" style={{ color: element.colour }}>
                    {t(element.name)}
                  </span>
                  <span className="text-xs font-black tabular-nums">{Math.round(element.chance * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="text-center text-xs font-bold text-[#3B5BA9]">
              {t("屬性隨機，孵出嚟先知。領咗之後喺棋盤擲 60 次骰就孵化，一出世就識飛。")}
            </p>
            <button
              type="button"
              onClick={() => {
                play("chest");
                onPick(rollElement(Math.random()));
              }}
              className="h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] text-xl font-black text-white shadow-[0_5px_0_#8E1210]"
              data-testid="pick-pet"
            >
              {t("🥚 領取龍蛋！")}
            </button>
          </section>
        </>
      )}
      {flyers.map((f) => (
        <img
          key={f.id}
          src={f.kind === 0 ? "/art/icons/meat.webp" : "/art/ui/crystal.webp"}
          alt=""
          className="pointer-events-none fixed z-50 size-10 object-contain drop-shadow-lg"
          style={{ left: f.x - 20, top: f.y - 20 }}
          ref={(el: HTMLImageElement | null) => {
            if (!el || el.dataset.flying) return;
            el.dataset.flying = "1";
            const box = view.current?.getBoundingClientRect();
            const tx = box ? box.left + box.width / 2 - f.x : 0;
            const ty = box ? box.top + box.height * 0.45 - f.y : -200;
            el.animate(
              [
                { transform: "translate(0,0) scale(1)", opacity: 1 },
                { transform: `translate(${tx * 0.5}px, ${ty * 0.5 - 60}px) scale(1.2)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${tx}px, ${ty}px) scale(0.4)`, opacity: 0 },
              ],
              { duration: 420, easing: "ease-in" },
            );
          }}
        />
      ))}
      {growing ? <GrowIntro element={growing.element} from={growing.from} to={growing.to} /> : null}
    </main>
  );
}

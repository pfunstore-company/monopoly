"use client";

import { useLang } from "@/lib/i18n";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { NestDragon } from "@/components/nest-dragon";
import { loadPet } from "@/components/wallet-store";
import { DECOR_DIR as D, type At, type DecorKind, type IslandArt, ISLANDS } from "@/lib/islands";

const SHOW_SPOTS = false;
/** The board stones float 0.8 world units up (39 picture pixels seen from the camera) and are 84 pixels across. */
const STONE_LIFT_PX = 39;
const STONE_W_PX = 84;
const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/** One decoration, its foot on `at`, `w` wide (both in island pixels). */
function Decor({ kind, at, w, island }: { kind: DecorKind; at: At; w: number; island: IslandArt }) {
  const box = { left: pct(at.x, island.w), top: pct(at.y, island.h), width: pct(w, island.w) };
  const img = (src: string, className = "", style?: Record<string, string | number>) => (
    <img src={D + src} alt="" draggable={false} className={cn("pointer-events-none block w-full select-none", className)} style={style} />
  );
  if (kind === "airship") {
    // Sails across the sky behind-to-front, right to left, bobbing; then round again.
    return (
      <div className="pointer-events-none absolute animate-[airship-fly_34s_linear_infinite]" style={{ top: pct(at.y, island.h), width: box.width }}>
        <div className="animate-[ship-bob_4s_ease-in-out_infinite]">{img("airship.webp", "drop-shadow-[0_10px_10px_rgba(0,0,0,0.35)]")}</div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full" style={box} data-testid={`decor-${kind}`}>
      {kind === "windmill" ? (
        <div className="relative">
          {img("windmill.webp", "drop-shadow-[0_4px_4px_rgba(0,0,0,0.4)]")}
          {/* The sails turn on the axle (82.8%, 56% of the tower picture). */}
          <div className="absolute aspect-[520/502] w-[174%] [transform:translate(-50%,-50%)_scaleX(0.5)_skewY(-12deg)]" style={{ left: "88%", top: "55%" }}>
            {img("blades.webp", "animate-[blade-spin_7s_linear_infinite] drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]", { transformOrigin: "50.4% 50.2%" })}
          </div>
        </div>
      ) : kind === "tower" ? (
        <div className="relative">
          {img("tower.webp", "drop-shadow-[0_4px_4px_rgba(0,0,0,0.4)]")}
          {/* The flag on the pole top (49.6% across, 7% down), waving from its hoist. */}
          <div className="absolute w-[41%]" style={{ left: "47.5%", top: "6%" }}>
            {img("flag.webp", "animate-[flag-wave_1.6s_ease-in-out_infinite]", { transformOrigin: "4% 50%" })}
          </div>
        </div>
      ) : kind === "dragon" ? (
        img("dragon.webp", "animate-[dragon-breathe_3.2s_ease-in-out_infinite] drop-shadow-[0_5px_5px_rgba(0,0,0,0.4)]", { transformOrigin: "50% 100%" })
      ) : (
        <div className="animate-[balloon-bob_6s_ease-in-out_infinite]">{img("balloon.webp", "drop-shadow-[0_12px_10px_rgba(0,0,0,0.3)]")}</div>
      )}
    </div>
  );
}

/** One island, fitted inside its box without cropping, floating gently. */
function Island({ island, editing }: { island: IslandArt; editing: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pet, setPet] = useState<{ element: number; stage: number } | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setPet(loadPet());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const scale = Math.min(width / island.w, height / island.h);
      setSize({ w: island.w * scale, h: island.h * scale });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [island]);
  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <div className="relative animate-[isle-float_6s_ease-in-out_infinite]" style={{ width: size.w, height: size.h }} data-testid={`island-${island.id}`}>
        <img src={island.art} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
        {island.falls.map((f, i) => (
          <div
            key={i}
            className="absolute overflow-hidden rounded-[45%/12%]"
            style={{ left: pct(f.x, island.w), top: pct(f.y, island.h), width: pct(f.w, island.w), height: pct(f.h, island.h) }}
          >
            <div className="absolute inset-0 animate-[water-flow_1.1s_linear_infinite] bg-[length:100%_96px] opacity-90 [mask-image:linear-gradient(90deg,transparent,#000_25%,#000_75%,transparent)]" style={{ backgroundImage: `url(/art/islands/${island.flow === "lava" ? "lava" : "water"}.webp)` }} />
            <div className="absolute inset-x-0 bottom-0 h-[10%] animate-[foam_1.2s_ease-in-out_infinite] rounded-full bg-white/80 blur-[2px]" />
          </div>
        ))}
        {/* 溫泉 (Sky 2026-10-18): water in the basins with steam off it, chimney smoke, firelight — code, not paint. */}
        {(island.pools ?? []).map((pool, i) => (
          <div
            key={`pool${i}`}
            className="pointer-events-none absolute overflow-hidden rounded-[50%] opacity-90"
            style={{ left: pct(pool.x - pool.rx, island.w), top: pct(pool.y - pool.ry, island.h), width: pct(pool.rx * 2, island.w), height: pct(pool.ry * 2, island.h) }}
          >
            <div className="absolute inset-0 animate-[water-flow_6s_linear_infinite] bg-[#7fd6e2] bg-[length:60px_60px] bg-blend-multiply [background-image:url(/art/islands/water.webp)]" />
          </div>
        ))}
        {[
          ...(island.pools ?? []).flatMap((pool, i) => {
            const n = Math.max(3, Math.round(pool.rx / 18));
            return Array.from({ length: n }, (_, k) => ({ key: `st${i}-${k}`, x: pool.x + (k / (n - 1) - 0.5) * pool.rx * 1.3, y: pool.y, w: Math.max(14, pool.rx * 0.35), grey: false, delay: (k * 4.2) / n, dur: 4.2 }));
          }),
          ...(island.smoke ?? []).flatMap((c, i) => Array.from({ length: 5 }, (_, k) => ({ key: `sm${i}-${k}`, x: c.x, y: c.y, w: 22, grey: true, delay: k * 1.04, dur: 5.2 }))),
        ].map((p) => (
          <span
            key={p.key}
            className={cn("pointer-events-none absolute aspect-square rounded-full blur-[3px] animate-[steam-rise_linear_infinite]", p.grey ? "bg-[#5d5d63]" : "bg-white")}
            style={{ left: pct(p.x, island.w), top: pct(p.y - p.w / 2, island.h), width: pct(p.w, island.w), animationDuration: `${p.dur}s`, animationDelay: `-${p.delay}s`, ["--dx" as string]: p.grey ? "12px" : "4px", ["--puff" as string]: p.grey ? "0.6" : "0.45" }}
          />
        ))}
        {(island.glows ?? []).map((g, i) => (
          <span
            key={`gl${i}`}
            className="pointer-events-none absolute aspect-square animate-[glow-pulse_1.3s_ease-in-out_infinite] rounded-full mix-blend-screen blur-[4px]"
            style={{ left: pct(g.x, island.w), top: pct(g.y, island.h), width: pct(g.r * 2.4, island.w), background: `radial-gradient(circle, ${g.colour} 0%, ${g.colour}99 35%, transparent 70%)` }}
          />
        ))}
        {/* The 18 squares: floating stones like the game board's, a little above their spot, each bobbing. */}
        {island.tiles === "stones" && island.squares.slice(1).map((sq, i) => (
          <img
            key={i}
            src="/art/islands/stone.webp"
            alt=""
            draggable={false}
            className="pointer-events-none absolute select-none drop-shadow-[0_10px_6px_rgba(0,0,0,0.35)]"
            style={{
              left: pct(sq.x, island.w),
              top: pct(sq.y - STONE_LIFT_PX, island.h),
              width: pct(STONE_W_PX, island.w),
              transform: "translate(-49.4%, -26.1%)",
              animation: `stone-bob ${3.4 + (i % 4) * 0.35}s ease-in-out ${-(i * 0.45)}s infinite`,
            }}
          />
        ))}
        {/* 龍仔 (Sky 2026-10-17): no nest; the player's dragon wanders the plaza and now and then flies up to look at us. */}
        <span
          className="pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2"
          style={{ left: pct(island.nest.x, island.w), top: pct(island.nest.y, island.h), width: pct(island.nest.w * 1.2, island.w) }}
        >
          <NestDragon element={pet?.element ?? 0} stage={pet?.stage ?? 0} span={(island.nest.w * 1.2) / 75} plaza={island.nest.w} />
        </span>
        {/* The start: a bigger stone in front of the 龍巢, as high as the others. */}
        {island.tiles === "stones" ? <img
          src="/art/islands/stone.webp"
          alt=""
          draggable={false}
          className="pointer-events-none absolute select-none drop-shadow-[0_10px_6px_rgba(0,0,0,0.35)]"
          style={{
            left: pct(island.squares[0].x, island.w),
            top: pct(island.squares[0].y - STONE_LIFT_PX, island.h),
            width: pct(STONE_W_PX * 1.6, island.w),
            transform: "translate(-49.4%, -26.1%)",
            animation: "stone-bob 3.8s ease-in-out infinite",
          }}
        /> : null}
        {island.decor.map((d) => (
          <Decor key={d.kind} kind={d.kind} at={island.spots[d.spot]} w={d.w} island={island} />
        ))}
        {editing
          ? island.spots.map((s, i) => island.decor.some((d) => d.spot === i) ? null : (
              <span
                key={i}
                className={cn(
                  "absolute flex aspect-[1.4] -translate-x-1/2 -translate-y-1/2 animate-[breathe_2.4s_ease-in-out_infinite] items-center justify-center rounded-full border-2 border-dashed border-white font-black text-white shadow-[0_0_12px_rgba(255,255,255,0.6)]",
                  s.kind === "big" ? "w-[13%] bg-[#7C3AED]/55 text-xl" : s.kind === "sky" ? "w-[10%] bg-[#0EA5A5]/55 text-lg" : "w-[8%] bg-[#2563EB]/55 text-base",
                )}
                style={{ left: pct(s.x, island.w), top: pct(s.y, island.h) }}
                data-testid={`deco-spot-${i}`}
              >
                +
              </span>
            ))
          : null}
      </div>
    </div>
  );
}

/**
 * 我嘅島 (Sky 2026-10-09): just space and your islands; swipe left and right between them. The last page is
 * the next island to buy.
 */
export function IslandHome() {
  const { t } = useLang();
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const pages = ISLANDS.length + 1;
  const go = (n: number) => strip.current?.scrollTo({ left: n * strip.current.clientWidth, behavior: "smooth" });

  return (
    <div className="absolute inset-0 flex flex-col" data-testid="island-home">
      <div
        ref={strip}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e: { currentTarget: HTMLDivElement }) => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        {ISLANDS.map((island) => (
          <section key={island.id} className="relative flex h-full w-full shrink-0 snap-center flex-col overflow-hidden px-2 pb-1">
            <p className="mx-auto mt-1 rounded-full border-2 border-[#FBD000] bg-[#1E3A8A]/80 px-4 py-0.5 text-sm font-black text-white shadow">{t(island.name)}</p>
            <div className="min-h-0 flex-1">
              <Island island={island} editing={editing} />
            </div>
          </section>
        ))}
        <section className="flex h-full w-full shrink-0 snap-center flex-col items-center justify-center gap-3 px-6 text-center text-white" data-testid="island-next">
          <img src="/art/islands/forest.webp" alt="" draggable={false} className="max-h-[55%] opacity-30 brightness-0 invert-[0.35]" />
          <p className="text-lg font-black">{t("下一個島")}</p>
          <p className="rounded-full bg-white/20 px-3 py-0.5 text-sm font-bold">{t("即將推出")}</p>
        </section>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3 pb-1">
        {Array.from({ length: pages }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => go(n)}
            className={cn("size-2.5 cursor-pointer rounded-full", n === page ? "bg-[#FBD000]" : "bg-white/40")}
            aria-label={t("第 {n} 頁", { n: n + 1 })}
          />
        ))}
        {/* 裝飾位 not settled yet (Sky 2026-10-09): the button comes back when the spots are decided. */}
        {SHOW_SPOTS && page < ISLANDS.length ? (
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            className={cn(
              "ml-2 cursor-pointer rounded-full border-2 px-3 py-0.5 text-xs font-black shadow",
              editing ? "border-[#FBD000] bg-[#7C3AED] text-white" : "border-white/60 bg-white/85 text-[#1E3A8A]",
            )}
            data-testid="deco-toggle"
          >
            {editing ? t("完成") : t("裝飾位")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

import { cn } from "cn";
import type { ReactNode } from "react";

/** 水晶 (Sky 2026-10-18): always the drawn gem, never the 💎 emoji. */
export const GEM_ICON = "/art/ui/crystal.webp";

export function Gem({ className }: { className?: string }) {
  return <img src={GEM_ICON} alt="水晶" draggable={false} className={cn("inline-block size-[1.2em] object-contain align-[-0.25em]", className)} />;
}

/** Text with every 💎 swapped for the drawn gem. */
export function withGems(text: string): ReactNode {
  const parts = text.split("💎");
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<Gem key={i} />, part]));
}

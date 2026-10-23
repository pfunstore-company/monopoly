/**
 * 玩家等級 (Sky 2026-10-23). Experience comes from what you already do — every roll on the daily board, every
 * level a city building goes up, every table game played to the end, every bite fed to the dragon — so it is
 * worked out from those counts (nothing new to keep in step). Each new level gives 能量 and dice, and some
 * levels open a part of the game (while testing everything stays open).
 *
 * Pace (a normal player, 經濟方案 2026-10-23): about 60 rolls, 5 city levels, 20 bites and one table game in
 * two days ≈ 60 + 75 + 20 + 20 ≈ 175 a day, so Lv5 on day 2–3, Lv10 in about a week, Lv15 in about two weeks.
 */
export const XP = { roll: 1, city: 15, table: 40, feed: 1 } as const;
export const MAX_LEVEL = 99;

/** Where experience comes from. */
export type XpFrom = { rolls: number; city: number; tables: number; feeds: number };

export function xpOf(p: XpFrom): number {
  const n = (x: number) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  return n(p.rolls) * XP.roll + n(p.city) * XP.city + n(p.tables) * XP.table + n(p.feeds) * XP.feed;
}

/** Experience needed in all to reach `level` (Lv1 = 0). */
export function xpFor(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) - 1;
  return 10 * l * l + 60 * l;
}

/** Your level, and how far into it you are. */
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpFor(level + 1)) level += 1;
  const base = xpFor(level);
  return level >= MAX_LEVEL ? { level, into: 0, need: 0 } : { level, into: xp - base, need: xpFor(level + 1) - base };
}

/** What reaching `level` gives: 能量 in coins (1 coin = 1,000 能量; 5,000 × level) and dice. */
export function levelReward(level: number): { coins: number; dice: number } {
  return { coins: 5 * level, dice: level % 5 === 0 ? 10 : 5 };
}

/** Parts of the game that open at a level (Sky 2026-10-23: 等級解鎖玩法). */
export const UNLOCKS = { table: 5, realm: 10 } as const;
export type Unlock = keyof typeof UNLOCKS;
export function isOpen(what: Unlock, level: number, testing: boolean): boolean {
  return testing || level >= UNLOCKS[what];
}

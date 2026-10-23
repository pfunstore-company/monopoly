/**
 * 領地嘅島 (Sky 2026-10-23): the first island is free but earned — finish its 成就 and claim it; from the second
 * island on, each is bought with 能量 (the game's only money; it can never be turned back into real money).
 * The second island is priced at about a month of a normal player's earnings (see ISLE_PRICES), so the keen can
 * get there sooner with 能量包.
 *
 * Normal player (經濟方案 2026-10-23, from simulating the daily board's own rules): three visits a day (60 dice,
 * ~1 coin = 1,000 能量 per die with the dice that come back) and 3 shop ads at 15,000 — about 113,000 能量 a day,
 * so about 31 days. A keen player (6 visits, 5 ads) ≈ 211,000 a day, 17 days; no ads ≈ 51 days.
 */
export type QuestId = "rolls" | "city" | "tables" | "feeds";
export type Quest = { id: QuestId; text: string; goal: number };

/** What earns the first island. */
export const FIRST_ISLE_QUESTS: readonly Quest[] = [
  { id: "rolls", text: "每日棋盤擲骰 {n} 次", goal: 100 },
  { id: "city", text: "城市建築合共升 {n} 級", goal: 15 },
  { id: "tables", text: "玩完 {n} 局對局", goal: 3 },
  { id: "feeds", text: "餵龍 {n} 次", goal: 10 },
];

/** 能量 for the 2nd, 3rd, 4th … island: 3,500,000, then half as much again each time. */
export function islePrice(index: number): number {
  if (index <= 0) return 0;
  return Math.round(3_500_000 * 1.5 ** (index - 1));
}

export type Progress = Record<QuestId, number>;
export type Isles = { owned: string[]; tables: number; feeds: number };
export const ISLES_KEY = "boolionaire-isles-v1";
export const NO_ISLES: Isles = { owned: [], tables: 0, feeds: 0 };

export function parseIsles(raw: unknown): Isles {
  const v = (raw ?? {}) as Partial<Isles>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(1e7, Math.floor(x)) : 0);
  return {
    owned: Array.isArray(v.owned) ? v.owned.filter((id): id is string => typeof id === "string").slice(0, 50) : [],
    tables: n(v.tables),
    feeds: n(v.feeds),
  };
}

export function questsDone(progress: Progress): boolean {
  return FIRST_ISLE_QUESTS.every((q) => progress[q.id] >= q.goal);
}

/** Claim the first island once its 成就 are done. */
export function claimFirst(isles: Isles, firstId: string, progress: Progress): Isles {
  if (isles.owned.includes(firstId) || !questsDone(progress)) return isles;
  return { ...isles, owned: [...isles.owned, firstId] };
}

/** Buy island number `index` (0 = the first, which can't be bought) with 能量; needs the island before it. */
export function buyIsle(isles: Isles, ids: readonly string[], index: number, energy: number): { isles: Isles; energy: number } {
  const id = ids[index];
  const price = islePrice(index);
  if (!id || index <= 0 || isles.owned.includes(id) || !isles.owned.includes(ids[index - 1]) || energy < price) return { isles, energy };
  return { isles: { ...isles, owned: [...isles.owned, id] }, energy: energy - price };
}

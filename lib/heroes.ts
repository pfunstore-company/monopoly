/**
 * 角色升級 (Sky 2026-10-21): every character goes from Lv1 to Lv5 with 碎片. Each level adds a little; Lv3 opens a
 * second ability; Lv5 is looks only (gold frame, gold steps, gold win). The R characters have nothing at Lv1.
 * The game rules read the numbers here (lib/eight.ts); the screens read the words.
 */
export type HeroId = "vampire" | "jiangshi" | "mummy" | "zombie" | "pumpkin" | "franken" | "reaper";
export const HERO_IDS: readonly HeroId[] = ["vampire", "jiangshi", "mummy", "zombie", "pumpkin", "franken", "reaper"];
export const MAX_HERO_LEVEL = 5;
/** 碎片 to go up to Lv2, Lv3, Lv4, Lv5. */
export const LEVEL_COST: Record<number, number> = { 2: 20, 3: 40, 4: 80, 5: 150 };
export function levelCost(level: number): number | null {
  return LEVEL_COST[level + 1] ?? null;
}
export function clampLevel(level: unknown): number {
  return typeof level === "number" && Number.isFinite(level) ? Math.max(1, Math.min(MAX_HERO_LEVEL, Math.floor(level))) : 1;
}

/** How many times a game the first ability works, by level (index 0 = Lv1). */
const FIRST_USES: Record<HeroId, readonly number[]> = {
  vampire: [0, 1, 1, 2, 2], // the first rent(s) collected +50%
  jiangshi: [0, 1, 1, 1, 1], // bail halved (Lv4: the first jail is free)
  mummy: [0, 1, 1, 2, 2], // the first tax(es) halved
  zombie: [0, 1, 1, 2, 2], // the first upgrade(s) half price
  pumpkin: [1, 1, 1, 1, 1], // passing start pays more (see PUMPKIN_START)
  franken: [1, 2, 2, 3, 3], // the first rent(s) paid halved
  reaper: [1, 2, 2, 2, 2], // a 6 means another roll (three at Lv4 won 45% of bot games: too strong)
};
export function firstUses(hero: HeroId, level: number): number {
  return FIRST_USES[hero][clampLevel(level) - 1];
}
/** 阿瓜: passing start pays this many times START_PAY. */
export function pumpkinStart(level: number): number {
  return [1.2, 1.25, 1.25, 1.3, 1.3][clampLevel(level) - 1];
}
/** Lv3 and up: the second ability. */
export function hasSecond(level: number): boolean {
  return clampLevel(level) >= 3;
}
/** 伯爵: rent collected with his ability gets this much on top, from the bank. */
export const VAMPIRE_BONUS = 0.5;

/** The words for the screens: index 0 = Lv1 … 4 = Lv5 (empty: nothing at that level). */
export const HERO_LEVELS: Record<HeroId, readonly string[]> = {
  vampire: ["（Lv2 先有能力）", "第一次收租多 50%", "第二能力：每局一次，抽到扣錢機會卡可以重抽", "頭兩次收租都多 50%", "金色外觀"],
  jiangshi: ["（Lv2 先有能力）", "入獄保釋金減半", "第二能力：每局一次，擲骰後可以揀多行或者少行 1 格", "每局第一次入獄免保釋金", "金色外觀"],
  mummy: ["（Lv2 先有能力）", "每局第一次交稅減半", "第二能力：開局手上有一張護盾", "頭兩次交稅都減半", "金色外觀"],
  zombie: ["（Lv2 先有能力）", "每局第一次升級半價", "第二能力：每局一次，自己啲樓唔會被拆樓卡或者隕石降級", "頭兩次升級都半價", "金色外觀"],
  pumpkin: ["過起點多 20%", "過起點多 25%", "第二能力：每局一次，抽機會卡時兩張揀一張", "過起點多 30%", "金色外觀"],
  franken: ["第一次交租半價", "頭兩次交租都半價", "第二能力：怪獸卡打佢，只會打退，唔會搶到錢", "頭三次交租都半價", "金色外觀"],
  reaper: ["擲到 6 再擲一次（每局一次）", "擲到 6 再擲一次（每局兩次）", "第二能力：對手破產時，你收佢一塊地", "收返嚟嗰塊地再升一級", "金色外觀"],
};
/** One line for the character pickers: the first ability as it stands at this level. */
export function perkLine(hero: HeroId, level: number): string {
  const l = clampLevel(level);
  if (l === 1) return hero === "pumpkin" || hero === "franken" || hero === "reaper" ? HERO_LEVELS[hero][0] : "";
  return HERO_LEVELS[hero][l >= 4 && hero !== "reaper" ? 3 : 1];
}

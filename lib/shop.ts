/**
 * 商店 (Sky 2026-10-08): 抽卡 (3D characters and 領地 houses), 能量 packs (real money later; test buttons now),
 * materials and a daily 精選, all paid in the 領地 wallet's 能量 (table units, shown ×10,000). Rewarded ads: at most
 * ADS_PER_DAY a day, shared by the shop's free claims and the single-player 雙倍 offers.
 *
 * 抽卡 odds are published on screen (App Store / Google Play rule for paid random items).
 */
import type { Stock } from "@/lib/realm";

/** UR is only for 特別卡 (Sky 2026-10-18); the character pool tops out at SSR. */
export type Rarity = "N" | "R" | "SR" | "SSR" | "UR";
export const RARITIES: readonly Rarity[] = ["SSR", "SR", "R", "N"];
/** Chance of each rarity per draw, in percent (shown on the 機率 page). */
export const ODDS: Record<Rarity, number> = { UR: 0, SSR: 1, SR: 9, R: 30, N: 60 };
/** The 50th draw without an SSR is an SSR. */
export const PITY = 50;
/** Prices in 能量 (table units). Ten at once costs nine and holds at least one SR or better. */
export const PULL_PRICE = 10;
export const TEN_PRICE = 90;

export const ADS_PER_DAY = 14;
/** What one free ad in the shop gives. */
export const AD_ENERGY = 20;

/**
 * 特別卡 (Sky 2026-10-17): five SSR-strength cards, played only on 領地 tables; take up to three into a game, each
 * used once and then gone. They replace the old 房屋券 and materials.
 */
export type SpecialId = "dragon" | "meteor" | "blackhole" | "goldroad" | "iceage" | "takeover" | "tornado" | "rewind";
export const SPECIALS: { id: SpecialId; name: string; emoji: string; what: string; ur?: true }[] = [
  { id: "dragon", name: "龍息", emoji: "🐉", what: "龍飛出嚟燒走對手一塊地，變返冇人擁有" },
  { id: "meteor", name: "天降隕石", emoji: "☄️", what: "揀一個區，對手喺嗰區嘅地全部降一級" },
  { id: "blackhole", name: "黑洞", emoji: "🌀", what: "全部對手被吸走，送返起點" },
  { id: "goldroad", name: "黃金之路", emoji: "✨", what: "下一次擲骰，行過嘅冇人地全部變你嘅" },
  { id: "iceage", name: "冰河時代", emoji: "❄️", what: "全部對手結冰，停一轉" },
  // UR (Sky 2026-10-18): stronger than SSR, 3% of the special pool, one per game at most.
  { id: "takeover", name: "霸王收購", emoji: "👑", what: "搶走最有錢對手最值錢嘅三塊地（佢有護盾就擋到）", ur: true },
  { id: "tornado", name: "末日龍捲風", emoji: "🌪️", what: "對手全部樓降一級，你自己全部樓升一級", ur: true },
  { id: "rewind", name: "時光倒流", emoji: "⏳", what: "今轉再擲多兩次，行過嘅冇人地全部變你嘅", ur: true },
];
export const SPECIAL_IDS = SPECIALS.map((c) => c.id);
export const UR_IDS = SPECIALS.filter((c) => c.ur).map((c) => c.id);
export const SSR_IDS = SPECIALS.filter((c) => !c.ur).map((c) => c.id);
/** Chance (percent) a 特別卡 draw is a UR card, shared equally among the UR cards. */
export const UR_ODDS = 3;
/** Percent chance of each 特別卡 in a draw (for the 機率 page). */
export const specialOdds = (id: SpecialId): number =>
  Math.round(((UR_IDS.includes(id) ? UR_ODDS / UR_IDS.length : (100 - UR_ODDS) / SSR_IDS.length) * 100)) / 100;
export const isUrCard = (id: SpecialId) => UR_IDS.includes(id);
/** At most this many 特別卡 go into one game. */
export const MAX_SPECIALS = 3;
/** Old materials turn into 特別卡: one card for every this many pieces. */
export const MATERIALS_PER_CARD = 30;

export type PoolId = "hero" | "special";
/** A thing a draw can give. */
export type Prize = { kind: "hero"; id: string } | { kind: "special"; id: SpecialId } | { kind: "shards"; n: number };

/** Characters: the four you start with are R; 阿瓜 (pumpkin) and 阿科 (Frankenstein) are SR, 阿神 (grim reaper) SSR. */
export const HEROES: { id: string; name: string; rarity: Rarity; avatar?: string; emoji?: string }[] = [
  { id: "vampire", name: "伯爵", rarity: "R", avatar: "/art/avatars/vampire.jpg" },
  { id: "jiangshi", name: "阿殭", rarity: "R", avatar: "/art/avatars/jiangshi.jpg" },
  { id: "mummy", name: "阿木", rarity: "R", avatar: "/art/avatars/mummy.jpg" },
  { id: "zombie", name: "阿強", rarity: "R", avatar: "/art/avatars/zombie.jpg" },
  { id: "pumpkin", name: "阿瓜", rarity: "SR", avatar: "/art/avatars/pumpkin.jpg" },
  { id: "franken", name: "阿科", rarity: "SR", avatar: "/art/avatars/franken.jpg" },
  { id: "reaper", name: "阿神", rarity: "SSR", avatar: "/art/avatars/reaper.jpg" },
];
/** N character draws give one 碎片. */
const N_SHARDS = 1;
/** A character you already have turns into this many 碎片. */
export const DUPLICATE_SHARDS = 5;

export type Collection = {
  heroes: Record<string, number>;
  shards: number;
  /** 特別卡 held, by card. */
  specials: Partial<Record<SpecialId, number>>;
  /** The old 領地 materials have been turned into 特別卡. */
  converted: boolean;
  /** Draws since the last SSR, per pool. */
  sinceSSR: Record<PoolId, number>;
  /** 新手禮包 bought; 月卡 runs until this day (YYYY-MM-DD) and was last claimed on `monthClaimed`. */
  starter: boolean;
  monthUntil: string | null;
  monthClaimed: string | null;
  /** 精選 bought today (day key → item ids). */
  deals: { day: string; bought: string[] };
  /** Rewarded ads watched today. */
  ads: { day: string; watched: number };
  /** 測試期 (Sky: nothing locked while testing): one of each UR card given once. */
  urGift?: boolean;
};

export function newCollection(): Collection {
  return {
    heroes: { vampire: 1, jiangshi: 1, mummy: 1, zombie: 1 },
    shards: 0,
    // 測試期 (Sky: nothing locked while testing): a new player gets one of each UR card too.
    specials: Object.fromEntries(UR_IDS.map((id) => [id, 1])),
    urGift: true,
    converted: false,
    sinceSSR: { hero: 0, special: 0 },
    starter: false,
    monthUntil: null,
    monthClaimed: null,
    deals: { day: "", bought: [] },
    ads: { day: "", watched: 0 },
  };
}

export function adsLeft(c: Collection, day: string): number {
  return ADS_PER_DAY - (c.ads.day === day ? c.ads.watched : 0);
}
export function watchAd(c: Collection, day: string): Collection | null {
  if (adsLeft(c, day) <= 0) return null;
  return { ...c, ads: { day, watched: (c.ads.day === day ? c.ads.watched : 0) + 1 } };
}

/** Pick a rarity from a random number in [0, 1), with the pity counter. */
export function rollRarity(r: number, sinceSSR: number): Rarity {
  if (sinceSSR + 1 >= PITY) return "SSR";
  let at = r * 100;
  for (const rarity of RARITIES) {
    if (at < ODDS[rarity]) return rarity;
    at -= ODDS[rarity];
  }
  return "N";
}

function prizeOf(rarity: Rarity, r: number): Prize {
  if (rarity === "N") return { kind: "shards", n: N_SHARDS };
  const list = HEROES.filter((h) => h.rarity === rarity);
  return { kind: "hero", id: list[Math.floor(r * list.length) % list.length].id };
}

/** A 特別卡 from the pool: UR_ODDS% a UR card, otherwise one of the SSR ones. */
export function randomSpecial(r: number): SpecialId {
  const ur = UR_ODDS / 100;
  if (r < ur) return UR_IDS[Math.floor((r / ur) * UR_IDS.length) % UR_IDS.length];
  const k = (r - ur) / (1 - ur);
  return SSR_IDS[Math.floor(k * SSR_IDS.length) % SSR_IDS.length];
}

export function addSpecial(c: Collection, id: SpecialId, n = 1): Collection {
  return { ...c, specials: { ...c.specials, [id]: (c.specials[id] ?? 0) + n } };
}

export type Pull = { rarity: Rarity; prize: Prize; duplicate: boolean };

/**
 * Draw `times` (1 or 10) from a pool. `random` gives numbers in [0, 1).
 * 角色卡池: rarity by the odds, pity at PITY, a ten-draw holds an SR or better; N gives a 碎片.
 * 特別卡池: every draw is a 特別卡, each of the five equally likely.
 */
export function draw(c: Collection, pool: PoolId, times: 1 | 10, random: () => number): { pulls: Pull[]; collection: Collection } {
  if (pool === "special") {
    let next = c;
    const pulls = Array.from({ length: times }, () => {
      const id = randomSpecial(random());
      next = addSpecial(next, id);
      return { rarity: (isUrCard(id) ? "UR" : "SSR") as Rarity, prize: { kind: "special" as const, id }, duplicate: false };
    });
    return { pulls, collection: next };
  }
  let since = c.sinceSSR.hero;
  const rarities: Rarity[] = [];
  for (let k = 0; k < times; k++) {
    const rarity = rollRarity(random(), since);
    since = rarity === "SSR" ? 0 : since + 1;
    rarities.push(rarity);
  }
  if (times === 10 && !rarities.some((r) => r === "SR" || r === "SSR")) rarities[9] = "SR";
  let next: Collection = { ...c, heroes: { ...c.heroes }, sinceSSR: { ...c.sinceSSR, hero: since } };
  const pulls = rarities.map((rarity) => {
    const prize = prizeOf(rarity, random());
    let duplicate = false;
    if (prize.kind === "hero") {
      duplicate = (next.heroes[prize.id] ?? 0) > 0;
      if (duplicate) next = { ...next, shards: next.shards + DUPLICATE_SHARDS };
      next.heroes[prize.id] = (next.heroes[prize.id] ?? 0) + 1;
    } else if (prize.kind === "shards") {
      next = { ...next, shards: next.shards + prize.n };
    }
    return { rarity, prize, duplicate };
  });
  return { pulls, collection: next };
}

/** Once: the old materials become 特別卡 (about one per MATERIALS_PER_CARD pieces, at least one if there are any). */
export function convertMaterials(c: Collection, stock: Stock, random: () => number): { collection: Collection; cards: number } {
  if (c.converted) return { collection: c, cards: 0 };
  const pieces = stock.wood + stock.stone + stock.gold;
  const cards = pieces > 0 ? Math.max(1, Math.round(pieces / MATERIALS_PER_CARD)) : 0;
  let next: Collection = { ...c, converted: true };
  for (let k = 0; k < cards; k++) next = addSpecial(next, randomSpecial(random()));
  return { collection: next, cards };
}

/** 能量 packs. Real money through App Store / Google Play later; for now test buttons add the 能量 straight away. */
export const PACKS = [
  { id: "starter", name: "新手禮包", price: "HK$8", energy: 300, specials: 1, once: true },
  { id: "small", name: "細能量包", price: "HK$8", energy: 100, specials: 0, once: false },
  { id: "mid", name: "中能量包", price: "HK$38", energy: 550, specials: 0, once: false },
  { id: "big", name: "大能量包", price: "HK$78", energy: 1200, specials: 0, once: false },
] as const;
/** 月卡: 30 days, claim this much 能量 each day. */
export const MONTH_CARD = { price: "HK$38", days: 30, daily: 30 } as const;

/** 精選: two offers a day, chosen from the day — a house voucher or a character at a discount. */
export type Deal = { id: string; prize: Prize; price: number; was: number };
export function dealsOf(day: string): Deal[] {
  let h = 2166136261;
  for (let k = 0; k < day.length; k++) h = Math.imul(h ^ day.charCodeAt(k), 16777619) >>> 0;
  const special = SSR_IDS[h % SSR_IDS.length];
  const hero = HEROES.filter((x) => x.rarity === "SR")[(h >>> 3) % 2];
  return [
    { id: `special-${special}`, prize: { kind: "special", id: special }, price: 150, was: 250 },
    { id: `hero-${hero.id}`, prize: { kind: "hero", id: hero.id }, price: 120, was: 200 },
  ];
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseCollection(value: unknown): Collection {
  const base = newCollection();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<Collection>;
  const num = (n: unknown) => (typeof n === "number" && n >= 0 ? Math.floor(n) : 0);
  const heroes: Record<string, number> = { ...base.heroes };
  for (const h of HEROES) if (raw.heroes && num(raw.heroes[h.id]) > 0) heroes[h.id] = num(raw.heroes[h.id]);
  const specials: Collection["specials"] = {};
  for (const id of SPECIAL_IDS) if (raw.specials && num(raw.specials[id]) > 0) specials[id] = num(raw.specials[id]);
  // 測試期: everyone gets one of each UR card once, to try them.
  if (raw.urGift !== true) for (const id of UR_IDS) specials[id] = (specials[id] ?? 0) + 1;
  const str = (s: unknown) => (typeof s === "string" ? s : null);
  return {
    heroes,
    shards: num(raw.shards),
    specials,
    converted: raw.converted === true,
    sinceSSR: { hero: num(raw.sinceSSR?.hero), special: 0 },
    starter: raw.starter === true,
    monthUntil: str(raw.monthUntil),
    monthClaimed: str(raw.monthClaimed),
    deals: { day: str(raw.deals?.day) ?? "", bought: Array.isArray(raw.deals?.bought) ? raw.deals!.bought.filter((x) => typeof x === "string") : [] },
    ads: { day: str(raw.ads?.day) ?? "", watched: num(raw.ads?.watched) },
    urGift: true,
  };
}
export const COLLECTION_KEY = "boolionaire-collection-v1";

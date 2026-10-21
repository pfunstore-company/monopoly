/**
 * Your dragon: it lives in the middle of your town and flies out to attack other players' land.
 * Everyone gets a dragon egg; its attribute is random — 光 35%, 暗 35%, 混濁 30%. It grows through
 * five grades (龍蛋 → N → R → SR → SSR) on 🍖 肉 (from the board) and 💎 水晶 (only stolen from
 * rivals' stores). Each day it eats; go hungry two days running and it drops back a grade. NFT
 * holders' dragons are the legendary series.
 */
export type Pet = {
  /** Index into ELEMENTS (the dragon's attribute). */
  element: number;
  /** 0 龍蛋, 1 N, 2 R, 3 SR, 4 SSR. */
  stage: number;
  /** Days in a row it went without its daily food (two drops a stage). */
  hungry: number;
  /** Board rolls since the egg was taken (it hatches by itself at HATCH_ROLLS). */
  rolls: number;
  /** 餵食 (Sky 2026-10-21): 🍖 and 💎 fed by hand today (its daily meal, UPKEEP), and fed toward the next stage. */
  meal?: readonly [number, number];
  grown?: readonly [number, number];
};

/** A dragon egg hatches after this many rolls on the daily board (the public table doesn't count). */
export const HATCH_ROLLS = 60;

export const ELEMENTS = [
  { id: "light", name: "光", beast: "光龍", legend: "聖光龍", colour: "#E8B420", chance: 0.35 },
  { id: "dark", name: "暗", beast: "暗龍", legend: "深淵龍", colour: "#6D3FC0", chance: 0.35 },
  { id: "chaos", name: "混濁", beast: "混濁龍", legend: "混沌龍", colour: "#C0392B", chance: 0.3 },
] as const;

/** 光 beats 暗, 暗 beats 混濁, 混濁 beats 光: the attribute each one beats. */
export function beats(element: number): number {
  return (element + 1) % ELEMENTS.length;
}
/** Hit chance (percentage points) gained against the attribute you beat, and lost against the one that beats you. */
export const TYPE_EDGE = 10;
/** +1 when the attacker's attribute beats the defender's, −1 the other way round, 0 otherwise. */
export function typeEdge(attacker: number, defender: number): -1 | 0 | 1 {
  if (beats(attacker) === defender) return 1;
  if (beats(defender) === attacker) return -1;
  return 0;
}

/** The attribute a new egg gets, from a random number in [0, 1): 光 35%, 暗 35%, 混濁 30%. */
export function rollElement(random: number): number {
  let edge = 0;
  for (let i = 0; i < ELEMENTS.length; i++) {
    edge += ELEMENTS[i].chance;
    if (random < edge) return i;
  }
  return ELEMENTS.length - 1;
}

export const STAGE_NAMES = ["龍蛋", "N", "R", "SR", "SSR"] as const;
export const TOP_STAGE = STAGE_NAMES.length - 1;
/** 🍖 and 💎 to grow from each stage to the next (the last stage has nowhere to go). The egg needs no
 * food: it hatches by itself after HATCH_ROLLS rolls. */
export const STAGE_NEED: readonly (readonly [number, number] | null)[] = [
  null,
  [100, 12],
  [260, 40],
  [600, 100],
];
/** Attack at each stage. */
export const STAGE_ATTACK = [10, 16, 24, 34, 46] as const;
/** What it eats each day at each stage (🍖, 💎). An egg eats nothing. */
export const UPKEEP: readonly (readonly [number, number])[] = [
  [0, 0],
  [3, 0],
  [6, 1],
  [8, 2],
  [10, 2],
];
/** Hungry days in a row before it drops a stage. */
export const HUNGRY_DROP = 2;
/** Legendary (NFT) monsters hit a tenth harder. */
export const LEGEND_BONUS = 1.1;

export function petAttack(pet: Pet | null, legend = false): number {
  if (!pet) return STAGE_ATTACK[0];
  const base = STAGE_ATTACK[Math.max(0, Math.min(TOP_STAGE, pet.stage))];
  return legend ? Math.round(base * LEGEND_BONUS) : base;
}

export function petName(pet: Pet, legend = false): string {
  const element = ELEMENTS[pet.element] ?? ELEMENTS[0];
  if (pet.stage === 0) return "龍蛋";
  return legend ? element.legend : element.beast;
}

/** What it takes to grow to the next stage, or null at the top. */
export function growNeed(pet: Pet): readonly [number, number] | null {
  return STAGE_NEED[pet.stage] ?? null;
}

/** Today's meal still to give (🍖, 💎). */
export function mealLeft(pet: Pet): [number, number] {
  const [m, j] = UPKEEP[pet.stage] ?? [0, 0];
  const [fm, fj] = pet.meal ?? [0, 0];
  return [Math.max(0, m - fm), Math.max(0, j - fj)];
}
/** Has had today's meal (an egg never needs one). */
export function fedToday(pet: Pet): boolean {
  const [m, j] = mealLeft(pet);
  return pet.stage === 0 || (m === 0 && j === 0);
}
/** Fed toward the next stage so far. */
export function grownSoFar(pet: Pet): [number, number] {
  return [pet.grown?.[0] ?? 0, pet.grown?.[1] ?? 0];
}
/** Whether this one would still take some of `kind` (for today's meal or for growing). */
export function wants(pet: Pet, kind: 0 | 1): boolean {
  if (pet.stage === 0) return false;
  if (mealLeft(pet)[kind] > 0) return true;
  const need = growNeed(pet);
  return !!need && grownSoFar(pet)[kind] < need[kind];
}

/**
 * Feed one 🍖 (kind 0) or 💎 (kind 1) by hand: it goes to today's meal first, then toward the next stage.
 * When both amounts for the next stage are in, it grows (and starts the new stage from nothing).
 */
export function feedOne(pet: Pet, kind: 0 | 1): { pet: Pet; grew: boolean } | null {
  if (!wants(pet, kind)) return null;
  const meal: [number, number] = [pet.meal?.[0] ?? 0, pet.meal?.[1] ?? 0];
  if (mealLeft(pet)[kind] > 0) {
    meal[kind] += 1;
    return { pet: { ...pet, meal, hungry: fedToday({ ...pet, meal }) ? 0 : pet.hungry }, grew: false };
  }
  const grown = grownSoFar(pet);
  grown[kind] += 1;
  const need = growNeed(pet)!;
  if (grown[0] >= need[0] && grown[1] >= need[1]) {
    // A new stage eats more: what was already fed today still counts toward its meal.
    return { pet: { ...pet, stage: pet.stage + 1, grown: [0, 0], hungry: 0 }, grew: true };
  }
  return { pet: { ...pet, grown }, grew: false };
}

/**
 * A day goes by. Fed by hand that day: all well. Not fed: it goes hungry, and a second hungry day in a row
 * knocks it back a grade (never below N). `firstDay` false means a day nobody was here at all.
 */
export function dayPasses(pet: Pet): { pet: Pet; ate: boolean; dropped: boolean } {
  const ate = fedToday(pet);
  const next: Pet = { ...pet, meal: [0, 0] };
  if (ate) return { pet: { ...next, hungry: 0 }, ate: true, dropped: false };
  const hungry = pet.hungry + 1;
  if (hungry >= HUNGRY_DROP && pet.stage > 1) return { pet: { ...next, stage: pet.stage - 1, hungry: 0, grown: [0, 0] }, ate: false, dropped: true };
  return { pet: { ...next, hungry: Math.min(hungry, HUNGRY_DROP) }, ate: false, dropped: false };
}

/** Whole days from one day key (YYYY-MM-DD) to another, 0 when the same or going backwards. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

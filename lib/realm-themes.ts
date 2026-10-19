/**
 * 領地主題 (Sky 2026-10-18, see the project doc 「動態島嶼喚醒系統」): every 3D realm board shares one "awakening"
 * system — 0 沉睡 (grey, dusky, foggy) → 1 擁有 (the land round a bought lot wakes into colour) → 2 成套 (one owner
 * holds a whole area: its marvel appears and rent doubles). A theme is only data: colours, what grows where, which
 * marvel each area gets and how the middle landmark grows. The game rules (lib/eight) never read this file, and the
 * 3D code (components/awaken-world) never decides who owns what.
 */

/** Things that already stand on the sleeping land and colour back in when it wakes. */
export type PropKind = "pine" | "round" | "rock" | "crystal" | "gold" | "reed";
/** 成套奇觀: what one owner's whole area turns into. */
export type MarvelKind = "worldTree" | "goldMine" | "waterfall";
/** 中間地標: how the middle grows with the whole board's levels. */
export type LandmarkKind = "fountain" | "bigFountain" | "clockTower" | "ferrisWheel";

export type ThemeZone = {
  name: string;
  /** Ground colours (sRGB hex) once awake; sleeping, they show drained of colour. */
  ground: number[];
  /** What already stands here, with weights. */
  props: [PropKind, number][];
  marvel: MarvelKind;
  marvelName: string;
};

export type Theme = {
  id: string;
  name: string;
  /** The three areas, in walking order (o1–o6, o7–o12, o13–o18). */
  zones: [ThemeZone, ThemeZone, ThemeZone];
  /** The middle of the board and the plaza. */
  middle: { ground: number[]; props: [PropKind, number][] };
  /** The rock hanging under the island. */
  rock: number;
  /** The glowing road joining the squares. */
  road: number;
  /** The fog over sleeping land. */
  fog: { colour: number; opacity: number };
  /** Light (×) while everything sleeps and once everything is awake: the island warms up as it wakes. */
  light: { asleep: number; awake: number };
  /** Total levels on the board at which the middle landmark grows. */
  landmark: { at: number; kind: LandmarkKind; name: string }[];
  /** 3D models (Meshy, Sky 2026-10-18) for props and marvels; anything missing is drawn in code. */
  models?: Record<string, string>;
  /** 皮膚位 (reserved for the shop, Sky 2026-10-18: no shop UI yet): which skin each slot uses. */
  slots: { landmark: string; tile: string; dice: string; building: string };
};

/** Theme #1 深空奇幻島: a floating island in deep space — lake and crystals (left), forest (back), gold mine (right). */
export const SPACE_ISLE: Theme = {
  id: "space",
  name: "深空奇幻島",
  zones: [
    {
      name: "水晶湖",
      ground: [0x3f9c86, 0x378f7a, 0x4aa892, 0x5bb59a],
      props: [["rock", 3], ["crystal", 3], ["reed", 2], ["round", 1]],
      marvel: "waterfall",
      marvelName: "大瀑布",
    },
    {
      name: "森林",
      ground: [0x4fa83c, 0x449534, 0x5cb846, 0x3e8f3a],
      props: [["pine", 4], ["round", 3], ["rock", 1]],
      marvel: "worldTree",
      marvelName: "世界樹",
    },
    {
      name: "金礦山",
      ground: [0xb8925c, 0xa9844f, 0xc49d63, 0x9a7646],
      props: [["rock", 4], ["gold", 2], ["pine", 1]],
      marvel: "goldMine",
      marvelName: "金礦山",
    },
  ],
  middle: { ground: [0x8fcf6a, 0x86c463, 0x9ad674, 0xa5dc7e], props: [["round", 2], ["pine", 1]] },
  rock: 0x4a3f63,
  road: 0x9fd8ff,
  fog: { colour: 0xd8d0ff, opacity: 0.32 },
  light: { asleep: 0.62, awake: 1 },
  landmark: [
    { at: 3, kind: "fountain", name: "細噴水池" },
    { at: 9, kind: "bigFountain", name: "大噴水池" },
    { at: 18, kind: "clockTower", name: "鐘樓" },
    { at: 30, kind: "ferrisWheel", name: "摩天輪" },
  ],
  slots: { landmark: "basic", tile: "basic", dice: "basic", building: "tower" },
  models: {
    pine: "/models/realm/pine.glb",
    round: "/models/realm/round.glb",
    crystal: "/models/realm/crystal.glb",
    gold: "/models/realm/gold.glb",
    worldTree: "/models/realm/worldTree.glb",
    goldMine: "/models/realm/goldMine.glb",
    waterfall: "/models/realm/waterfall.glb",
    // Sky's drawings (2026-10-20): the owner's towers (magenta parts take the owner's colour) and the middle landmark
    tower1: "/models/realm/tower1.glb",
    tower2: "/models/realm/tower2.glb",
    tower3: "/models/realm/tower3.glb",
    tower4: "/models/realm/tower4.glb",
    fountain: "/models/realm/fountain.glb",
    bigFountain: "/models/realm/bigFountain.glb",
    clockTower: "/models/realm/clockTower.glb",
    wheelStand: "/models/realm/wheelStand.glb",
    wheel: "/models/realm/wheel.glb",
  },
};

export const THEMES: Record<string, Theme> = { space: SPACE_ISLE };
export const themeOf = (id?: string): Theme | undefined => (id ? THEMES[id] : undefined);

/** Which landmark stage a board with this many levels has reached (0 = none yet). */
export function landmarkStage(theme: Theme, levels: number): number {
  let stage = 0;
  theme.landmark.forEach((s, i) => {
    if (levels >= s.at) stage = i + 1;
  });
  return stage;
}

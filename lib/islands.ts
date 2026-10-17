/**
 * 領地 painted islands (Sky 2026-10-09): picture, squares, dragon nest, waterfalls and decoration spots — shared by
 * the 我嘅領地 page and the game board. All positions are in the picture's own pixels.
 */
export type At = { x: number; y: number };
export type Fall = At & { w: number; h: number };
/** 裝飾位 sizes (Sky 2026-10-09: fixed spots, no free placing): big things, small things, things in the sky. */
export type SpotKind = "big" | "small" | "sky";
export type IslandArt = {
  id: string;
  name: string;
  art: string;
  w: number;
  h: number;
  /** Where this picture was cut from Sky's original (the board's world maths uses the original's pixels). */
  top: number;
  /** Moves the picture across so its board sits where the forest island's does (board maths only). */
  left?: number;
  /** What runs in the dry channels: water (default) or lava. */
  flow?: "water" | "lava";
  /** Squares painted into the picture (players stand on them), or floating stones laid over it. */
  tiles: "painted" | "stones";
  /** Where players stand on each square: the plaza first, then o1…o18 in walking order. */
  squares: At[];
  /** 龍巢 on the plaza: the foot of the nest picture and its width; the player's own dragon lies in it. */
  nest: At & { w: number };
  /** Sky's dry cliff channels, where code runs the water. */
  falls: Fall[];
  /** 裝飾位, fixed. */
  spots: (At & { kind: SpotKind })[];
  /** What stands on the spots (empty until decorations are bought). */
  decor: { kind: DecorKind; spot: number; w: number }[];
};

/** 裝飾 (Sky's drawings 2026-10-09); code moves them — the flag waves, the balloon floats, the airship sails. */
export type DecorKind = "windmill" | "tower" | "dragon" | "balloon" | "airship";
export const DECOR_DIR = "/art/islands/decor/";

/**
 * 森林礦島 (Sky 2026-10-09: back to the drawing with painted squares, stairs and bridge — 6 squares in each of the
 * quarry, forest and mine). Plaza at the front → quarry (left) → forest (back) → mine (right).
 */
export const islandOf = (id?: string): IslandArt => ISLANDS.find((i) => i.id === id) ?? ISLANDS[0];

export const ISLANDS: IslandArt[] = [
  {
    id: "forest",
    name: "森林礦島",
    art: "/art/islands/forest.webp",
    w: 941,
    h: 1360,
    top: 120,
    tiles: "painted",
    squares: [
      { x: 472, y: 965 },
      // 石場 (bottom up), 森林 (left to right), 礦場 (top down) — Sky's painted squares
      { x: 297, y: 768 }, { x: 366, y: 709 }, { x: 384, y: 630 }, { x: 350, y: 557 }, { x: 296, y: 501 }, { x: 212, y: 469 },
      { x: 280, y: 304 }, { x: 322, y: 243 }, { x: 405, y: 202 }, { x: 513, y: 201 }, { x: 596, y: 239 }, { x: 639, y: 303 },
      { x: 735, y: 468 }, { x: 653, y: 524 }, { x: 599, y: 588 }, { x: 585, y: 665 }, { x: 625, y: 736 }, { x: 712, y: 770 },
    ],
    nest: { x: 472, y: 940, w: 200 },
    falls: [
      { x: 451, y: 62, w: 40, h: 86 },
      { x: 60, y: 560, w: 38, h: 175 },
      { x: 866, y: 555, w: 30, h: 175 },
    ],
    spots: [
      { x: 470, y: 165, kind: "big" },
      { x: 470, y: 430, kind: "big" },
      { x: 300, y: 445, kind: "big" },
      { x: 765, y: 470, kind: "big" },
      { x: 410, y: 340, kind: "small" },
      { x: 545, y: 340, kind: "small" },
      { x: 400, y: 580, kind: "small" },
      { x: 545, y: 580, kind: "small" },
      { x: 225, y: 735, kind: "small" },
      { x: 715, y: 735, kind: "small" },
      { x: 395, y: 210, kind: "small" },
      { x: 555, y: 210, kind: "small" },
      { x: 110, y: 110, kind: "sky" },
      { x: 830, y: 110, kind: "sky" },
    ],
    decor: [],
  },
  // 火山島 (Sky 2026-10-17): 燒焦森林 (left), 火山口 (back, across the chain bridge), 鐵匠鋪 (right). Sky's
  // picture shrunk to 76% so its squares are the forest island's size; the lava in the channels is code.
  {
    id: "volcano",
    name: "火山島",
    art: "/art/islands/volcano.webp",
    w: 778,
    h: 1167,
    top: 215,
    left: 86,
    flow: "lava",
    tiles: "painted",
    squares: [
      { x: 388, y: 730 },
      { x: 235, y: 644 }, { x: 193, y: 587 }, { x: 206, y: 524 }, { x: 240, y: 452 }, { x: 239, y: 391 }, { x: 209, y: 332 },
      { x: 216, y: 246 }, { x: 282, y: 255 }, { x: 351, y: 261 }, { x: 424, y: 262 }, { x: 494, y: 257 }, { x: 561, y: 246 },
      { x: 560, y: 332 }, { x: 533, y: 391 }, { x: 533, y: 452 }, { x: 569, y: 525 }, { x: 584, y: 587 }, { x: 541, y: 644 },
    ],
    nest: { x: 388, y: 711, w: 170 },
    falls: [
      { x: 72, y: 618, w: 20, h: 166 },
      { x: 688, y: 618, w: 20, h: 166 },
    ],
    spots: [],
    decor: [],
  },
];

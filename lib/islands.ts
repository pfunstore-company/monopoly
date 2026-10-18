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
  /** Hot-spring water lying in dry basins (ellipses), each steaming. */
  pools?: (At & { rx: number; ry: number })[];
  /** Chimney tops that smoke. */
  smoke?: At[];
  /** Firelight and glowing runes, pulsing: centre, radius, colour. */
  glows?: (At & { r: number; colour: string })[];
  /** What grows beside the squares of each area once bought (left, back, right; Sky 2026-10-18). */
  zones?: [BuildKind, BuildKind, BuildKind];
  /** How wide a painted square is in this picture (pixels), so a building's stone covers it. */
  squareW?: number;
  /** 3D 喚醒主題 (lib/themes, Sky 2026-10-18): no picture — the island is built in 3D and wakes as land is bought. */
  awaken?: string;
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

/** 領地 buildings (Sky's drawings 2026-10-18): 樹林 wood, 石屋 stone, 礦場 mine — four levels each, in /art/islands/build3: Sky 2026-10-18 went to 高樓大廈, one set for every island. */
export type BuildKind = "wood" | "stone" | "mine";
/**
 * Each building picture (Sky 2026-10-18: the building sits on its own round stone, which covers the painted square):
 * height ÷ width, the stone's width as a share of the picture, and the stone's middle (0–1 across, 0–1 down).
 */
export const BUILD_ART: Record<string, { aspect: number; plat: number; cx: number; cy: number }> = {
  tower1: { aspect: 0.8267, plat: 0.9627, cx: 0.4973, cy: 0.6281 },
  tower2: { aspect: 1.3253, plat: 0.9627, cx: 0.5, cy: 0.768 },
  tower3: { aspect: 1.8191, plat: 0.9628, cx: 0.4973, cy: 0.831 },
  tower4: { aspect: 2.2098, plat: 0.9611, cx: 0.4987, cy: 0.8613 },
};

/** 裝飾 (Sky's drawings 2026-10-09); code moves them — the flag waves, the balloon floats, the airship sails. */
export type DecorKind = "windmill" | "tower" | "dragon" | "balloon" | "airship";
export const DECOR_DIR = "/art/islands/decor/";

/**
 * 森林礦島 (Sky 2026-10-09: back to the drawing with painted squares, stairs and bridge — 6 squares in each of the
 * quarry, forest and mine). Plaza at the front → quarry (left) → forest (back) → mine (right).
 */
export const islandOf = (id?: string): IslandArt => ISLANDS.find((i) => i.id === id) ?? ISLANDS[0];
/** The painted islands (the 我嘅領地 page shows these pictures). */
export const PAINTED_ISLANDS = (): IslandArt[] => ISLANDS.filter((i) => !i.awaken);

export const ISLANDS: IslandArt[] = [
  // Theme #1 深空奇幻島 (Sky 2026-10-18): the 3D awakening island, laid out like the forest island's squares.
  {
    id: "space",
    name: "深空奇幻島",
    art: "",
    w: 941,
    h: 1360,
    top: 120,
    squareW: 60,
    awaken: "space",
    tiles: "painted",
    squares: [
      { x: 472, y: 860 },
      { x: 297, y: 768 }, { x: 366, y: 709 }, { x: 384, y: 630 }, { x: 350, y: 557 }, { x: 296, y: 501 }, { x: 212, y: 469 },
      { x: 280, y: 304 }, { x: 322, y: 243 }, { x: 405, y: 202 }, { x: 513, y: 201 }, { x: 596, y: 239 }, { x: 639, y: 303 },
      { x: 735, y: 468 }, { x: 653, y: 524 }, { x: 599, y: 588 }, { x: 585, y: 665 }, { x: 625, y: 736 }, { x: 712, y: 770 },
    ],
    nest: { x: 472, y: 855, w: 110 },
    falls: [],
    spots: [],
    decor: [],
  },
  {
    id: "forest",
    name: "森林礦島",
    art: "/art/islands/forest.webp",
    w: 941,
    h: 1360,
    top: 120,
    zones: ["stone", "wood", "mine"],
    squareW: 60,
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
    zones: ["wood", "stone", "mine"],
    squareW: 58,
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
  // 溫泉島 (Sky 2026-10-18): 森林 (left), 溫泉火山口 (back), 鐵匠鋪 (right). Picture at 82% so its board matches the volcano's; the hot-spring
  // water, steam, chimney smoke, forge fire and rune glow are all code.
  {
    id: "spring",
    name: "溫泉島",
    art: "/art/islands/spring.webp",
    w: 775,
    h: 1378,
    top: 128,
    left: 88,
    zones: ["wood", "stone", "mine"],
    squareW: 66,
    tiles: "painted",
    squares: [
      { x: 387, y: 865 },
      { x: 234, y: 752 }, { x: 191, y: 686 }, { x: 204, y: 613 }, { x: 237, y: 527 }, { x: 236, y: 456 }, { x: 208, y: 387 },
      { x: 215, y: 286 }, { x: 280, y: 298 }, { x: 349, y: 305 }, { x: 421, y: 306 }, { x: 489, y: 299 }, { x: 556, y: 287 },
      { x: 558, y: 388 }, { x: 530, y: 456 }, { x: 530, y: 528 }, { x: 568, y: 613 }, { x: 581, y: 686 }, { x: 538, y: 752 },
    ],
    nest: { x: 387, y: 853, w: 184 },
    falls: [
      { x: 74, y: 725, w: 22, h: 239 },
      { x: 687, y: 725, w: 22, h: 239 },
    ],
    pools: [
      { x: 394, y: 194, rx: 121, ry: 50 },
      { x: 293, y: 488, rx: 28, ry: 16 },
    ],
    smoke: [{ x: 651, y: 268 }],
    glows: [
      { x: 707, y: 504, r: 25, colour: "#FF8A1F" },
      { x: 385, y: 762, r: 18, colour: "#FF6A2A" },
    ],
    spots: [],
    decor: [],
  },
  // 雪嶺島 (Sky 2026-10-18): 草原 (left), 草地後排 (back, over two stone bridges), 雪坡 (right). Picture at 66% (a little bigger than the others: its board fills more of the picture).
  {
    id: "snow",
    name: "雪嶺島",
    art: "/art/islands/snow.webp",
    w: 676,
    h: 1014,
    top: 297,
    left: 135,
    zones: ["wood", "stone", "mine"],
    squareW: 80,
    tiles: "painted",
    squares: [
      { x: 336, y: 723 },
      { x: 163, y: 614 }, { x: 142, y: 539 }, { x: 135, y: 459 }, { x: 129, y: 385 }, { x: 170, y: 313 }, { x: 134, y: 249 },
      { x: 113, y: 178 }, { x: 187, y: 119 }, { x: 281, y: 89 }, { x: 390, y: 89 }, { x: 487, y: 119 }, { x: 561, y: 178 },
      { x: 539, y: 251 }, { x: 511, y: 316 }, { x: 552, y: 385 }, { x: 538, y: 459 }, { x: 533, y: 539 }, { x: 513, y: 613 },
    ],
    nest: { x: 336, y: 716, w: 158 },
    falls: [],
    spots: [],
    decor: [],
  },
];

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
/**
 * 深空奇幻島's road (in the forest picture's pixels, which the board maths uses): 19 squares evenly round a rounded
 * rectangle — start at the front middle, then up the left, across the back and down the right.
 */
function ringSquares(): At[] {
  // 圓形 (Sky 2026-10-19): an oval, a little longer front to back so it fills a phone held upright.
  const halfW = 3.7, halfD = 4.7, cz = 0.2; // world units
  const N = 720, pts: [number, number][] = [];
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * Math.PI * 2; // 0 = the front middle, going round by the left
    pts.push([-halfW * Math.sin(a), halfD * Math.cos(a)]);
  }
  const lens = [0];
  for (let k = 1; k <= N; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = lens[N], out: At[] = [];
  for (let i = 0, k = 0; i < 19; i++) {
    const want = (i / 19) * total;
    while (lens[k + 1] < want) k++;
    const [x, z] = pts[k];
    // world → the picture's pixels (see cloverAt in components/eight-scene)
    out.push({ x: Math.round(x * 75 + 476), y: Math.round((z + cz) * 75 * Math.sin((50 * Math.PI) / 180) + 680 - 120) });
  }
  return out;
}

export const islandOf = (id?: string): IslandArt => ISLANDS.find((i) => i.id === id) ?? ISLANDS[0];

export const ISLANDS: IslandArt[] = [
  // Theme #1 深空奇幻島 (Sky 2026-10-18): the 3D awakening island, laid out like the forest island's squares.
  {
    id: "space",
    name: "深空奇幻島",
    // a picture of the island awake, for the 我嘅領地 page and the picker (the board itself is 3D)
    art: "/art/islands/space.webp",
    w: 508,
    h: 487,
    top: 120,
    squareW: 60,
    awaken: "space",
    tiles: "painted",
    // 大富翁 ring (Sky 2026-10-19): the start at the front, 18 lots evenly round an oval.
    squares: ringSquares(),
    nest: { x: 476, y: 836, w: 110 },
    falls: [],
    spots: [],
    decor: [],
  },
];

/**
 * 動態島嶼喚醒 (Sky 2026-10-18, project doc 「動態島嶼喚醒系統」): the 3D 領地 board built from a theme (lib/realm-themes).
 *
 * The whole island is there from the start but asleep — grey, dusky, under fog — with its trees and rocks already
 * standing. Buying a lot wakes the land round it into colour (the fog lifts, the trees colour back in, flowers pop
 * up) and puts the owner's tower beside it. Two neighbouring lots of one owner join up with a little garden; one
 * owner holding a whole area of six brings up that area's marvel; the middle landmark grows with the whole board's
 * levels, and the light warms as more of the island wakes.
 *
 * This file only draws: the scene tells it who owns what (own / clear) and it never decides anything about the game.
 */
import { landmarkStage, type MarvelKind, type PropKind, type Theme } from "@/lib/realm-themes";
import { ARCH_PREVIEW } from "@/lib/islands";

export type AwakenWorld = {
  /** A lot now belongs to `seat` at `level` (first time: its land wakes). */
  own(key: string, seat: number, colour: string, level: number): Promise<void>;
  /** A lot belongs to nobody again: its building goes and its land falls back asleep. */
  clear(key: string): void;
  /** Per-frame idle motion (fog drifting, wheel turning…). */
  tick(now: number, dt: number): void;
  /** Everything this world drew (for ?debug pictures of the island). */
  root: any;
};

type Opts = {
  /** Where each square is (world x, z): the plaza key plus every lot. */
  points: Record<string, [number, number]>;
  plaza: string;
  /** The lots in walking order, six to an area. */
  lots: string[];
  /** Where players stand (the pads' tops). */
  top: number;
  /** The scene's own tween (follows its speed setting). */
  tween: (ms: number, step: (k: number) => void) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  /** Lights to dim while the island sleeps, with their full strength. */
  lights: { light: any; full: number }[];
  glowTex: any;
  /** Loads a 3D model (resolves null if it can't); without it everything is drawn in code. */
  loadModel?: (url: string) => Promise<any | null>;
};

const easeBack = (k: number) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

/** A steady random number for a spot, so the island looks the same every game. */
const hash = (x: number, z: number, n = 0) => {
  const s = Math.sin(x * 127.1 + z * 311.7 + n * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export function createAwakenWorld(T: any, scene: any, theme: Theme, o: Opts): AwakenWorld {
  const { points, plaza, lots, top: TOP, tween, wait } = o;
  /** 群島浮橋: where the islands' flat tops sit (everything stands on them). */
  const ARCH_TOP = 0.03;
  const P = (key: string) => new T.Vector3(points[key][0], 0, points[key][1]);
  const lin = (hex: number) => new T.Color(hex).convertSRGBToLinear();
  /** The sleeping look: the same colour drained and dusky. */
  const greyOf = (c: any) => {
    const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    return new T.Color(l * 0.3 + 0.01, l * 0.3 + 0.012, l * 0.36 + 0.03);
  };
  const root = new T.Group();
  scene.add(root);
  const pads = lots.map((k) => P(k));
  const plazaAt = P(plaza);
  const centre = pads.reduce((s, p) => s.add(p), new T.Vector3()).multiplyScalar(1 / pads.length);
  /** The road: plaza → every lot → plaza. */
  const loop = [plazaAt, ...pads, plazaAt];
  const segDist = (x: number, z: number) => {
    let best = 1e9;
    for (let i = 0; i < loop.length - 1; i++) {
      const a = loop[i], b = loop[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
    return best;
  };
  const inside = (x: number, z: number) => {
    let hit = false;
    for (let i = 0, j = loop.length - 2; i < loop.length - 1; j = i++) {
      const a = loop[i], b = loop[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  };
  // Where things stand: each lot's building beside it (away from the middle), each area's marvel, the landmark.
  // Never toward the camera (the front): a tall tower in front of a lot would hide it and its players.
  const outward = (p: any) => {
    const d = new T.Vector3(p.x - centre.x, 0, Math.min(0, (p.z - centre.z) * 0.8));
    return d.lengthSq() > 0.01 ? d.normalize() : new T.Vector3(0, 0, -1);
  };
  // Every building stands outside the ring, a little apart from its lot (Sky 2026-10-19: none in the middle).
  const plots = pads.map((p) => {
    const d = new T.Vector3(p.x - centre.x, 0, p.z - centre.z).normalize();
    return p.clone().addScaledVector(d, 1.3);
  });
  /** Along the front the buildings stand between the camera and their lot, so they stay lower there. */
  const plotScale = pads.map((p) => (p.z - centre.z > 2.6 ? 0.6 : p.z - centre.z > 1.5 ? 0.8 : 1));
  const marvelAt = [0, 1, 2].map((z) => {
    const six = pads.slice(z * 6, z * 6 + 6);
    const c = six.reduce((s, p) => s.add(p), new T.Vector3()).multiplyScalar(1 / 6);
    return c.addScaledVector(outward(c), ARCH_PREVIEW && theme.archipelago ? 2.3 : 3.1);
  });
  const middleAt = new T.Vector3(centre.x, 0, centre.z + 0.6);

  // ---------- The land: hex cells round the road and over the middle ----------
  const HEX = 0.36;
  type Cell = { x: number; z: number; top: number; deep: number; pad: number; woke: number; colour: any; grey: any };
  const cells: Cell[] = [];
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of loop) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pick = <V,>(list: V[], r: number) => list[Math.floor(r * list.length) % list.length];
  for (let q = Math.floor((minX - 4) / (HEX * 1.5)); q <= Math.ceil((maxX + 4) / (HEX * 1.5)); q++)
    for (let r = Math.floor((minZ - 4) / (HEX * Math.sqrt(3))); r <= Math.ceil((maxZ + 4) / (HEX * Math.sqrt(3))); r++) {
      const x = q * HEX * 1.5, z = (r + (q & 1) * 0.5) * HEX * Math.sqrt(3);
      const d = segDist(x, z), inner = inside(x, z);
      // A wobbly shore 1.9–2.6 out from the road.
      const reach = 2.05 + 0.55 * (0.5 + 0.5 * Math.sin(Math.atan2(z - centre.z, x - centre.x) * 5 + 1.3)) * hash(Math.round(x * 2), Math.round(z * 2));
      // …and the land bulges out under each area's marvel spot.
      if (!inner && d > reach && !marvelAt.some((m: any) => Math.hypot(m.x - x, m.z - z) < 2.4)) continue;
      let best = 0, bd = 1e9;
      pads.forEach((p, i) => {
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      });
      const nearPlaza = Math.hypot(x - plazaAt.x, z - plazaAt.z) < 1.2;
      const pad = nearPlaza || (inner && Math.sqrt(bd) > 1.35) ? -1 : best;
      const pal = pad >= 0 ? theme.zones[Math.floor(pad / 6)].ground : theme.middle.ground;
      const edge = inner ? 1 : Math.max(0, Math.min(1, (reach - d) / 1.6));
      const colour = lin(pick(pal, hash(x, z, 1)));
      cells.push({ x, z, top: 0.1 + 0.12 * edge + hash(x, z, 2) * 0.07, deep: 0.5 + edge * (2.6 + hash(x, z, 3) * 2.2), pad, woke: 0, colour, grey: greyOf(colour) });
    }
  const cellGeo = new T.CylinderGeometry(HEX * 0.99, HEX * 0.99, 1, 6);
  cellGeo.translate(0, -0.5, 0);
  const land = new T.InstancedMesh(cellGeo, new T.MeshStandardMaterial({ roughness: 0.92, flatShading: true }), cells.length);
  land.receiveShadow = true;
  const rockGeo = new T.CylinderGeometry(HEX * 0.97, HEX * 0.35, 1, 6);
  rockGeo.translate(0, -0.5, 0);
  const under = new T.InstancedMesh(rockGeo, new T.MeshStandardMaterial({ roughness: 1, flatShading: true }), cells.length);
  const dummy = new T.Object3D(), tmp = new T.Color(), rockC = lin(theme.rock);
  const setCell = (i: number) => {
    const c = cells[i];
    dummy.position.set(c.x, c.top + c.woke * 0.05, c.z);
    dummy.rotation.set(0, Math.PI / 6, 0);
    dummy.scale.set(1, 0.32, 1);
    dummy.updateMatrix();
    land.setMatrixAt(i, dummy.matrix);
    land.setColorAt(i, tmp.copy(c.grey).lerp(c.colour, Math.min(1, c.woke)));
  };
  cells.forEach((c, i) => {
    setCell(i);
    dummy.position.set(c.x, c.top - 0.3, c.z);
    dummy.scale.set(1, c.deep, 1);
    dummy.updateMatrix();
    under.setMatrixAt(i, dummy.matrix);
    under.setColorAt(i, tmp.copy(rockC).multiplyScalar(0.75 + hash(c.x, c.z, 4) * 0.5));
  });
  const touched = () => {
    land.instanceMatrix.needsUpdate = true;
    if (land.instanceColor) land.instanceColor.needsUpdate = true;
  };
  root.add(land, under);
  /** 群島浮橋: the islands are models; the hex land stays (for heights and waking) but isn't drawn. */
  const arch = ARCH_PREVIEW ? theme.archipelago : undefined;
  if (arch) land.visible = under.visible = false;

  // Little rocks floating round the island, each with a glowing crystal.
  const crystalMat = new T.MeshStandardMaterial({ color: lin(0x8fe3ff), emissive: lin(0x3fa9ff), emissiveIntensity: 0.6, roughness: 0.2, flatShading: true });
  const islets: { g: any; y: number; phase: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, r = 1 + hash(i, 9);
    const g = new T.Group();
    const x = centre.x + Math.cos(a) * ((maxX - minX) / 2 + 3 + r), z = centre.z + Math.sin(a) * ((maxZ - minZ) / 2 + 2.5 + r);
    const y = -0.8 - hash(i, 3) * 2;
    g.position.set(x, y, z);
    const rock = new T.Mesh(new T.DodecahedronGeometry(0.35 + hash(i, 5) * 0.35, 0), new T.MeshStandardMaterial({ color: rockC, roughness: 1, flatShading: true }));
    rock.scale.y = 0.7;
    const gem = new T.Mesh(new T.OctahedronGeometry(0.16), crystalMat);
    gem.position.y = 0.35;
    g.add(rock);
    if (theme.sky !== "clouds") g.add(gem);
    root.add(g);
    islets.push({ g, y, phase: hash(i, 7) * 6 });
  }

  // ---------- 巨龍天空城: a sea of clouds drifting under the island ----------
  const puffTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const cloudSea: { s: any; x: number; z: number; speed: number; phase: number }[] = [];
  if (theme.sky === "clouds") {
    for (let i = 0; i < 46; i++) {
      const a = hash(i, 21) * Math.PI * 2, r = 2 + hash(i, 22) * 14;
      const s = new T.Sprite(new T.SpriteMaterial({ map: puffTex, color: i % 3 ? 0xffffff : 0xe8eefc, transparent: true, opacity: 0.85, depthWrite: false }));
      const size = 3 + hash(i, 23) * 5;
      s.scale.set(size, size * 0.55, 1);
      const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r;
      s.position.set(x, -4.2 - hash(i, 24) * 2.5, z);
      root.add(s);
      cloudSea.push({ s, x, z, speed: 0.15 + hash(i, 25) * 0.25, phase: hash(i, 26) * 40 });
    }
  }

  // ---------- Pads (players stand on them), the plaza and the glowing road ----------
  const stoneMat = new T.MeshStandardMaterial({ color: lin(0xece2cc), roughness: 0.7 });
  const goldMat = new T.MeshStandardMaterial({ color: lin(0xf5b82e), roughness: 0.35, metalness: 0.6 });
  const padRims: any[] = [];
  const makePad = (at: any, r: number) => {
    const g = new T.Group();
    g.position.copy(at);
    const body = new T.Mesh(new T.CylinderGeometry(r, r * 0.92, TOP, 36), stoneMat);
    body.position.y = TOP / 2;
    body.castShadow = body.receiveShadow = true;
    const rim = new T.Mesh(new T.TorusGeometry(r * 0.97, 0.05, 8, 48), goldMat.clone());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = TOP;
    g.add(body, rim);
    root.add(g);
    return rim;
  };
  // 起點 (Sky 2026-10-19: the big round plaza looked out of place): a pad a little bigger than the rest, with a gold star.
  const startRim = makePad(plazaAt, 0.62);
  startRim.material.color.copy(lin(0xffd23f));
  startRim.material.emissive = lin(0xffb000);
  startRim.material.emissiveIntensity = 0.6;
  {
    const star = new T.Shape();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.16 : 0.38, a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      if (k) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const m = new T.Mesh(new T.ShapeGeometry(star), new T.MeshStandardMaterial({ color: lin(0xffd23f), emissive: lin(0xffb000), emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.4 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(plazaAt.x, TOP + 0.006, plazaAt.z);
    root.add(m);
  }
  // 地格 (Sky 2026-10-19): curved stone slabs that together make one round road — each a piece of the ring between
  // its neighbours, a little tinted by its area; the frame round the top takes the owner's colour.
  const ringCurve = new T.CatmullRomCurve3([plazaAt, ...pads].map((p: any) => new T.Vector3(p.x, 0, p.z)), true);
  const N = pads.length + 1;
  /** The outline of a piece of road from u0 to u1 (0…1 round the ring), `half` either side of its middle line. */
  const piece = (u0: number, u1: number, half: number) => {
    const steps = 10, left: [number, number][] = [], right: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const u = (u0 + ((u1 - u0) * k) / steps + 1) % 1;
      const at = ringCurve.getPointAt(u), t = ringCurve.getTangentAt(u);
      const nx = -t.z, nz = t.x, l = Math.hypot(nx, nz) || 1;
      left.push([at.x + (nx / l) * half, at.z + (nz / l) * half]);
      right.push([at.x - (nx / l) * half, at.z - (nz / l) * half]);
    }
    return [...left, ...right.reverse()];
  };
  const shapeOf = (pts: [number, number][]) => {
    const sh = new T.Shape();
    pts.forEach(([x, z], k) => (k ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
    sh.closePath();
    return sh;
  };
  const slabMats = [0xd9efe8, 0xe2f1d2, 0xf3e3c8].map((c) => new T.MeshStandardMaterial({ color: lin(c), roughness: 0.7 }));
  // where each square sits along the ring (the points are evenly spaced, so close to j / N)
  const uOf = [plazaAt, ...pads].map((p: any) => {
    let best = 0, bd = 1e9;
    for (let k = 0; k < 400; k++) {
      const q = ringCurve.getPointAt(k / 400), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) { bd = d; best = k / 400; }
    }
    return best;
  });
  const gapsU = uOf.map((u, j) => ((uOf[(j + 1) % N] - u + 1) % 1)).sort((a, b) => a - b);
  /** 群島浮橋: a slab never reaches further than half the usual step (the bridges fill the gaps). */
  const halfCap = arch ? gapsU[Math.floor(N / 2)] / 2 : 1;
  const span = (j: number) => {
    const u = uOf[j], prev = uOf[(j + N - 1) % N], next = uOf[(j + 1) % N];
    const back = Math.min(halfCap, ((u - prev + 1) % 1) / 2), fwd = Math.min(halfCap, ((next - u + 1) % 1) / 2);
    return [u - back, u + fwd] as const;
  };
  pads.forEach((_p, i) => {
    const [u0, u1] = span(i + 1);
    const outline = piece(u0 + 0.0015, u1 - 0.0015, 0.6); // a thin seam between neighbours
    const body = new T.Mesh(new T.ExtrudeGeometry(shapeOf(outline), { depth: TOP, bevelEnabled: false }), slabMats[Math.floor(i / 6)]);
    body.geometry.rotateX(-Math.PI / 2);
    body.castShadow = body.receiveShadow = true;
    // the frame: the slab's top outline with the middle cut out
    const frame = shapeOf(outline);
    const inner = piece(u0 + 0.004, u1 - 0.004, 0.52);
    const hole = new T.Path();
    inner.forEach(([x, z], k) => (k ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
    hole.closePath();
    frame.holes.push(hole);
    const rim = new T.Mesh(new T.ExtrudeGeometry(frame, { depth: 0.04, bevelEnabled: false }), goldMat.clone());
    rim.geometry.rotateX(-Math.PI / 2);
    rim.position.y = TOP - 0.035;
    root.add(body, rim);
    padRims.push(rim);
  });
  const roadMat = new T.MeshBasicMaterial({ color: lin(theme.road), transparent: true, opacity: 0.55, depthWrite: false });
  {
    const curve = new T.CatmullRomCurve3(loop.map((p: any) => new T.Vector3(p.x, TOP * 0.55, p.z)));
    root.add(new T.Mesh(new T.TubeGeometry(curve, 300, 0.05, 6, false), roadMat));
  }

  // ---------- What already stands on the sleeping land ----------
  const leaf = [0x3fa34d, 0x58b947, 0x2f8f5b].map((c) => new T.MeshStandardMaterial({ color: lin(c), roughness: 0.8, flatShading: true }));
  const trunkM = new T.MeshStandardMaterial({ color: lin(0x7a4b2a), roughness: 0.9 });
  const rockM = new T.MeshStandardMaterial({ color: lin(0x8b7d6b), roughness: 0.95, flatShading: true });
  const goldOre = new T.MeshStandardMaterial({ color: lin(0xffd23f), roughness: 0.25, metalness: 0.8, emissive: lin(0x6a4a00), emissiveIntensity: 0.4 });
  const reedM = new T.MeshStandardMaterial({ color: lin(0x9ccf5a), roughness: 0.8 });
  const flowerM = [0xff6fae, 0xffd84d, 0xffffff, 0x8fd3ff].map((c) => new T.MeshStandardMaterial({ color: lin(c), roughness: 0.6 }));
  const prop = (kind: PropKind, s: number, r: number) => {
    const g = new T.Group();
    const mesh = (geo: any, m: any, y: number) => {
      const x = new T.Mesh(geo, m);
      x.position.y = y;
      x.castShadow = true;
      g.add(x);
      return x;
    };
    if (kind === "pine") {
      mesh(new T.CylinderGeometry(0.05 * s, 0.07 * s, 0.3 * s, 6), trunkM, 0.15 * s);
      mesh(new T.ConeGeometry(0.26 * s, 0.5 * s, 7), leaf[0], 0.5 * s);
      mesh(new T.ConeGeometry(0.19 * s, 0.38 * s, 7), leaf[2], 0.78 * s);
    } else if (kind === "round") {
      mesh(new T.CylinderGeometry(0.05 * s, 0.07 * s, 0.32 * s, 6), trunkM, 0.16 * s);
      mesh(new T.IcosahedronGeometry(0.26 * s, 0), leaf[r < 0.5 ? 1 : 2], 0.52 * s);
    } else if (kind === "rock") {
      const m = mesh(new T.DodecahedronGeometry(0.2 * s, 0), rockM, 0.1 * s);
      m.scale.set(1, 0.7 + r * 0.4, 1);
    } else if (kind === "crystal") {
      for (let i = 0; i < 3; i++) {
        const c = mesh(new T.OctahedronGeometry(0.1 * s * (1 - i * 0.2)), crystalMat, 0.14 * s);
        c.scale.y = 2;
        c.position.x = (i - 1) * 0.1 * s;
        c.rotation.z = (i - 1) * 0.35;
      }
    } else if (kind === "gold") {
      mesh(new T.DodecahedronGeometry(0.18 * s, 0), rockM, 0.1 * s);
      const n = mesh(new T.OctahedronGeometry(0.09 * s), goldOre, 0.24 * s);
      n.position.x = 0.06 * s;
    } else if (kind === "lavaRock") {
      const m = mesh(new T.DodecahedronGeometry(0.22 * s, 0), new T.MeshStandardMaterial({ color: lin(0x3a3236), roughness: 0.95, flatShading: true, emissive: lin(0x7a2a08), emissiveIntensity: 0.35 }), 0.12 * s);
      m.scale.set(1, 0.8 + r * 0.6, 1);
    } else if (kind === "pillar") {
      mesh(new T.CylinderGeometry(0.1 * s, 0.12 * s, 0.55 * s, 8), new T.MeshStandardMaterial({ color: lin(0xeee3cc), roughness: 0.6 }), 0.28 * s);
    } else if (kind === "cloudStone") {
      mesh(new T.DodecahedronGeometry(0.2 * s, 0), rockM, 0.2 * s);
      const c = mesh(new T.IcosahedronGeometry(0.22 * s, 1), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 0.16 * s);
      c.scale.set(1.4, 0.6, 1.2);
    } else {
      for (let i = 0; i < 4; i++) {
        const b = mesh(new T.CylinderGeometry(0.012, 0.018, 0.35 * s, 4), reedM, 0.17 * s);
        b.position.set((i - 1.5) * 0.06, 0.17 * s, (i % 2) * 0.05);
        b.rotation.z = (i - 1.5) * 0.15;
      }
    }
    return g;
  };
  /** Things drawn grey until their land wakes; each mesh keeps its own colour to come back to. */
  type Sleeper = { obj: any; pad: number; mats: { m: any; colour: any }[]; woke: boolean; kind: PropKind; size: number; wake?: { value: number }[] };
  const sleepers: Sleeper[] = [];
  const drain = (obj: any) => {
    const mats: Sleeper["mats"] = [];
    obj.traverse((x: any) => {
      if (!x.isMesh) return;
      x.material = x.material.clone();
      mats.push({ m: x.material, colour: x.material.color.clone() });
      x.material.color.copy(greyOf(x.material.color));
      if (x.material.emissive) x.material.userData.glow = x.material.emissiveIntensity, (x.material.emissiveIntensity = 0);
    });
    return mats;
  };
  const weighted = (list: [PropKind, number][], r: number): PropKind => {
    const total = list.reduce((s, [, w]) => s + w, 0);
    let at = r * total;
    for (const [k, w] of list) if ((at -= w) <= 0) return k;
    return list[0][0];
  };
  const keepClear = (x: number, z: number) =>
    segDist(x, z) < 0.62 ||
    plots.some((p: any) => Math.hypot(p.x - x, p.z - z) < 0.55) ||
    marvelAt.some((p: any) => Math.hypot(p.x - x, p.z - z) < 1.4) ||
    Math.hypot(middleAt.x - x, middleAt.z - z) < 1.7 ||
    Math.hypot(plazaAt.x - x, plazaAt.z - z) < 1.1;
  cells.forEach((c) => {
    if (arch) return;
    const r = hash(c.x, c.z, 5);
    if (r > (c.pad === -1 ? 0.1 : 0.36) || keepClear(c.x, c.z)) return;
    const kinds = c.pad >= 0 ? theme.zones[Math.floor(c.pad / 6)].props : theme.middle.props;
    const p = prop(weighted(kinds, hash(c.x, c.z, 6)), 0.75 + hash(c.x, c.z, 7) * 0.55, hash(c.x, c.z, 8));
    p.userData.r = hash(c.x, c.z, 8);
    p.position.set(c.x + (hash(c.x, c.z, 9) - 0.5) * 0.18, c.top, c.z + (hash(c.x, c.z, 10) - 0.5) * 0.18);
    p.rotation.y = hash(c.x, c.z, 11) * 6.28;
    root.add(p);
    const kind = weighted(kinds, hash(c.x, c.z, 6)), size = 0.75 + hash(c.x, c.z, 7) * 0.55;
    sleepers.push({ obj: p, pad: c.pad, mats: drain(p), woke: false, kind, size });
  });
  const colourIn = (s: Sleeper, back = false) => {
    s.woke = !back;
    return tween(700, (k) => {
      s.wake?.forEach((u) => (u.value = back ? 1 - k : k));
      s.mats.forEach(({ m, colour }) => {
        const g = greyOf(colour);
        if (back) m.color.copy(colour).lerp(g, k);
        else m.color.copy(g).lerp(colour, k);
        if (m.userData.glow !== undefined) m.emissiveIntensity = m.userData.glow * (back ? 1 - k : k);
      });
    });
  };

  // ---------- 3D models (lib/realm-themes `models`): swapped in for the drawn-in-code shapes once loaded ----------
  const models: Record<string, any> = {};
  /** A textured model's material that can be drained of colour: uWake 0 = asleep (grey), 1 = awake. */
  const wakeable = (m: any) => {
    const mm = m.clone();
    const u = { value: 0 };
    mm.onBeforeCompile = (sh: any) => {
      sh.uniforms.uWake = u;
      sh.fragmentShader =
        "uniform float uWake;\n" +
        sh.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\nfloat wl = dot(diffuseColor.rgb, vec3(.3, .59, .11));\ndiffuseColor.rgb = mix(vec3(wl * .42, wl * .42, wl * .52), diffuseColor.rgb, uWake);",
        );
    };
    mm.customProgramCacheKey = () => "wake";
    return { mm, u };
  };
  /** A copy of a loaded model standing on y = 0, centred, `height` tall. */
  const placed = (name: string, height: number, width = Infinity) => {
    const src = models[name];
    if (!src) return null;
    const m = src.clone(true);
    const box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3()), mid = box.getCenter(new T.Vector3());
    // As tall as asked, but never wider than `width` (the wide marvels of 巨龍天空城).
    const k = Math.min(height / Math.max(0.001, size.y), width / Math.max(0.001, size.x, size.z));
    m.scale.setScalar(k);
    m.position.set(-mid.x * k, -box.min.y * k, -mid.z * k);
    const g = new T.Group();
    g.add(m);
    m.traverse((x: any) => {
      if (x.isMesh) x.castShadow = x.receiveShadow = true;
    });
    return g;
  };
  /** How tall each model stands (world units) at prop size 1. */
  const PROP_TALL: Partial<Record<PropKind, number>> = { pine: 1.1, round: 1.0, crystal: 0.5, gold: 0.45, rock: 0.3, lavaRock: 0.45, pillar: 0.62, cloudStone: 0.5 };
  const useModels = () => {
    // Towers put up before the models arrived become the drawn ones.
    towers.forEach((old, i) => {
      if (!old || !level[i]) return;
      const t = towerModel(Math.max(1, Math.min(4, level[i])), new T.Color(colourOf[i]).convertSRGBToLinear());
      if (!t) return;
      t.position.copy(old.position);
      t.rotation.copy(old.rotation);
      t.scale.copy(old.scale);
      root.remove(old);
      root.add(t);
      towers[i] = t;
    });
    for (const s of sleepers) {
      const tall = PROP_TALL[s.kind];
      const g = tall && models[s.kind] ? placed(s.kind, tall * s.size) : null;
      if (!g) continue;
      s.obj.clear();
      s.obj.add(g);
      s.mats = [];
      s.wake = [];
      g.traverse((x: any) => {
        if (!x.isMesh) return;
        const { mm, u } = wakeable(x.material);
        u.value = s.woke ? 1 : 0;
        x.material = mm;
        s.wake!.push(u);
      });
    }
  };
  if (o.loadModel && theme.models) {
    const entries = Object.entries(theme.models);
    void Promise.all(entries.map(([name, url]) => o.loadModel!(url).then((m) => m && (models[name] = m)))).then(() => {
      useModels();
      placeIslands();
    });
  }

  // ---------- 群島浮橋: the floating islands, the king's island, the start islet and the bridges ----------
  /** Each outer island's wake (0 asleep … 1) and the king's island's, for the grey-to-colour shader. */
  const isleWake: { value: number }[][] = [[], [], [], []];
  /** A model laid flat: its long side along `along` (x, z), its top at ARCH_TOP, `length` long. */
  const layIsland = (name: string, at: any, along: [number, number] | null, length: number, wake: { value: number }[] | null) => {
    const src = models[name];
    if (!src || !arch) return null;
    const m = src.clone(true);
    const box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3()), mid = box.getCenter(new T.Vector3());
    const k = length / Math.max(0.001, size.x);
    const g = new T.Group();
    m.position.set(-mid.x * k, ARCH_TOP - (arch.top[name] ?? box.max.y) * k, -mid.z * k);
    m.scale.setScalar(k);
    g.add(m);
    g.position.set(at.x, 0, at.z);
    if (along) g.rotation.y = -Math.atan2(along[1], along[0]);
    m.traverse((x: any) => {
      if (!x.isMesh) return;
      x.receiveShadow = true;
      x.castShadow = true;
      if (wake) {
        const { mm, u } = wakeable(x.material);
        x.material = mm;
        wake.push(u);
      }
    });
    root.add(g);
    return g;
  };
  const placeIslands = () => {
    if (!arch) return;
    for (let z = 0; z < 3; z++) {
      const six = pads.slice(z * 6, z * 6 + 6);
      const c = six.reduce((s: any, p: any) => s.add(p), new T.Vector3()).multiplyScalar(1 / 6);
      const a = six[0], b = six[5];
      const out = new T.Vector3(c.x - centre.x, 0, c.z - centre.z).normalize();
      const at = c.clone().addScaledVector(out, 1.15);
      layIsland(arch.zones[z], at, [b.x - a.x, b.z - a.z], a.distanceTo(b) + 3.2, isleWake[z]);
      isleWake[z].forEach((u) => (u.value = zoneWake(z)));
    }
    layIsland(arch.king, middleAt.clone().setZ(centre.z), null, 5.0, isleWake[3]);
    isleWake[3].forEach((u) => (u.value = stage > 0 ? 1 : 0));
    layIsland(arch.start, plazaAt, null, 1.9, null);
    // A bridge over every gap: start → first lot, between the areas, last lot → start.
    const ends: [any, any][] = [
      [plazaAt, pads[0]],
      [pads[5], pads[6]],
      [pads[11], pads[12]],
      [pads[17], plazaAt],
    ];
    for (const [p, q] of ends) {
      const mid = p.clone().add(q).multiplyScalar(0.5);
      layIsland(arch.bridge, mid, [q.x - p.x, q.z - p.z], Math.max(1, p.distanceTo(q) - 1.1), null);
    }
  };
  /** How awake an outer island is: half at its first lot bought, fully when all six are. */
  const zoneWake = (z: number) => {
    const n = [0, 1, 2, 3, 4, 5].filter((k) => owner[z * 6 + k] !== null).length;
    return n ? 0.55 + 0.45 * ((n - 1) / 5) : 0;
  };
  const wakeIsland = (z: number) => {
    const want = z === 3 ? (stage > 0 ? 1 : 0) : zoneWake(z);
    const us = isleWake[z];
    if (!us.length || Math.abs(us[0].value - want) < 0.01) return;
    const from = us[0].value;
    void tween(900, (k) => us.forEach((u) => (u.value = from + (want - from) * k)));
  };

  // ---------- Fog over the sleeping land ----------
  type Puff = { s: any; pad: number; y: number; phase: number; alive: boolean };
  const fog: Puff[] = [];
  if (arch)
    pads.forEach((p: any, i: number) => {
      const out = new T.Vector3(p.x - centre.x, 0, p.z - centre.z).normalize();
      for (let layer = 0; layer < 2; layer++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: o.glowTex, color: lin(theme.fog.colour), transparent: true, opacity: theme.fog.opacity, depthWrite: false }));
        const size = 1.6 + hash(i, layer, 12) * 1.2, y = 0.35 + layer * 0.45;
        s.position.set(p.x + out.x * (0.8 + layer), y, p.z + out.z * (0.8 + layer));
        s.scale.set(size, size * 0.55, 1);
        root.add(s);
        fog.push({ s, pad: i, y, phase: hash(i, layer, 17) * 6, alive: true });
      }
    });
  cells.forEach((c, n) => {
    if (arch || n % 3 || segDist(c.x, c.z) < 0.7) return;
    for (let layer = 0; layer < 2; layer++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: o.glowTex, color: lin(theme.fog.colour), transparent: true, opacity: theme.fog.opacity, depthWrite: false }));
      const size = 1.4 + hash(c.x, c.z, 12 + layer) * 1.2;
      const y = 0.35 + layer * 0.4 + hash(c.x, c.z, 14) * 0.2;
      s.position.set(c.x + (hash(c.x, c.z, 15) - 0.5), y, c.z + (hash(c.x, c.z, 16) - 0.5));
      s.scale.set(size, size * 0.55, 1);
      root.add(s);
      fog.push({ s, pad: c.pad, y, phase: hash(c.x, c.z, 17) * 6, alive: true });
    }
  });
  const clearFog = (pad: number) =>
    fog
      .filter((f) => f.pad === pad && f.alive)
      .forEach((f, n) => {
        f.alive = false;
        const from = f.s.material.opacity, y = f.s.position.y;
        void wait(n * 20).then(() =>
          tween(1100, (k) => {
            f.s.material.opacity = from * (1 - k);
            f.s.position.y = y + k * 1.4;
            if (k >= 1) root.remove(f.s);
          }),
        );
      });

  // ---------- Effects ----------
  const sparkles = (at: any, colour: number, n = 30, spread = 1.6) => {
    for (let k = 0; k < n; k++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: o.glowTex, color: colour, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      const a = Math.random() * 6.283, sp = 0.4 + Math.random() * spread, up = 1 + Math.random() * 2.6;
      root.add(s);
      void tween(900 + Math.random() * 600, (kk) => {
        s.position.set(at.x + Math.cos(a) * sp * kk, at.y + up * kk - 2 * kk * kk, at.z + Math.sin(a) * sp * kk);
        const size = 0.25 * (1 - kk) + 0.05;
        s.scale.set(size, size, 1);
        s.material.opacity = 1 - kk;
        if (kk >= 1) root.remove(s);
      });
    }
  };
  const beam = (at: any, colour: number, h = 10, r = 0.45) => {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 24, 1, true), new T.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.position.set(at.x, h / 2, at.z);
    root.add(m);
    return tween(900, (k) => {
      m.material.opacity = Math.sin(k * Math.PI) * 0.4;
      m.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
      if (k >= 1) root.remove(m);
    });
  };
  const wave = (at: any, colour: number, size = 3.5) => {
    const m = new T.Mesh(new T.RingGeometry(0.5, 0.62, 48), new T.MeshBasicMaterial({ color: colour, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, TOP + 0.03, at.z);
    root.add(m);
    return tween(800, (k) => {
      const s = 1 + k * size;
      m.scale.set(s, s, s);
      m.material.opacity = 1 - k;
      if (k >= 1) root.remove(m);
    });
  };
  const pop = (obj: any, ms = 500) => {
    obj.scale.set(0.001, 0.001, 0.001);
    return tween(ms, (k) => {
      const s = easeBack(k), w = 0.25 * Math.sin(k * 9) * (1 - k);
      obj.scale.set(s * (1 + w), Math.max(0.001, s * (1 - w)), s * (1 + w));
    });
  };

  // ---------- Who owns what (only to draw it) ----------
  const owner: (number | null)[] = lots.map(() => null);
  const level: number[] = lots.map(() => 0);
  const colourOf: string[] = lots.map(() => "#ffffff");
  const towers: (any | null)[] = lots.map(() => null);
  const blooms: any[][] = lots.map(() => []);
  const awakeShare = () => cells.reduce((s, c) => s + Math.min(1, c.woke), 0) / Math.max(1, cells.length);

  const wakeLand = async (i: number) => {
    const p = pads[i];
    const mine = cells.map((c, k) => [c, k] as const).filter(([c]) => c.pad === i && c.woke < 1);
    mine.sort((a, b) => (a[0].x - p.x) ** 2 + (a[0].z - p.z) ** 2 - ((b[0].x - p.x) ** 2 + (b[0].z - p.z) ** 2));
    void wave(p, 0xffffff, 4);
    clearFog(i);
    mine.forEach(([c, k], n) =>
      void wait(n * 30).then(() =>
        tween(380, (kk) => {
          c.woke = easeBack(kk);
          setCell(k);
          touched();
        }),
      ),
    );
    sleepers.filter((s) => s.pad === i && !s.woke).forEach((s, n) => {
      void wait(200 + n * 80).then(() => {
        void colourIn(s);
        const y = s.obj.position.y;
        return tween(500, (k) => (s.obj.position.y = y + Math.sin(k * Math.PI) * 0.22));
      });
    });
    await wait(Math.min(800, mine.length * 30));
    sparkles(p.clone().setY(TOP + 0.1), lin(0xc9ffb0).getHex(), 26, 2.2);
    // A few flowers and bushes spring up on the woken land.
    const spots = arch ? [] : mine.filter(([c], n) => n > 1 && n % 4 === 1 && !keepClear(c.x, c.z)).slice(0, 3);
    for (const [[c], n] of spots.map((s, n) => [s, n] as const)) {
      const b = new T.Group();
      b.position.set(c.x, c.top + 0.05, c.z);
      for (let f = 0; f < 5; f++) {
        const fl = new T.Mesh(new T.SphereGeometry(0.045 + Math.random() * 0.03, 6, 4), flowerM[(f + n) % 4]);
        fl.position.set((Math.random() - 0.5) * 0.4, 0.02, (Math.random() - 0.5) * 0.4);
        b.add(fl);
      }
      const bush = new T.Mesh(new T.IcosahedronGeometry(0.12, 0), leaf[(n + 1) % 3]);
      bush.position.y = 0.05;
      bush.castShadow = true;
      b.add(bush);
      root.add(b);
      blooms[i].push(b);
      void wait(200 + n * 120).then(() => pop(b));
    }
  };
  const sleepLand = (i: number) => {
    cells.forEach((c, k) => {
      if (c.pad !== i || c.woke <= 0) return;
      const from = c.woke;
      void tween(600, (kk) => {
        c.woke = from * (1 - kk);
        setCell(k);
        touched();
      });
    });
    sleepers.filter((s) => s.pad === i && s.woke).forEach((s) => void colourIn(s, true));
    for (const b of blooms[i]) root.remove(b);
    blooms[i] = [];
  };

  // ---------- The owner's tower beside the lot ----------
  const wallM = new T.MeshStandardMaterial({ color: lin(0xf3ead8), roughness: 0.6 });
  const glassM = new T.MeshStandardMaterial({ color: lin(0x7fd6ff), roughness: 0.1, metalness: 0.3, emissive: lin(0x1a4a66), emissiveIntensity: 0.35 });
  const towerOf = (lv: number, colour: any) => {
    const g = new T.Group();
    const own = new T.MeshStandardMaterial({ color: colour, roughness: 0.45 });
    const floors = [0, 2, 4, 7, 10][lv], w = lv >= 3 ? 0.44 : 0.52, FH = 0.19;
    const box = (sx: number, sy: number, sz: number, m: any, y: number) => {
      const b = new T.Mesh(new T.BoxGeometry(sx, sy, sz), m);
      b.position.y = y;
      b.castShadow = true;
      g.add(b);
      return b;
    };
    box(w * 1.2, 0.06, w * 1.2, own, 0.03); // its footing, in the owner's colour
    for (let f = 0; f < floors; f++) {
      const s = lv === 4 ? 1 - (f / floors) * 0.4 : 1, y = 0.06 + FH / 2 + f * FH;
      box(w * s, FH, w * s, wallM, y).receiveShadow = true;
      box(w * s * 1.01, FH * 0.5, w * s * 0.62, glassM, y);
      box(w * s * 0.62, FH * 0.5, w * s * 1.01, glassM, y);
      if (f % 3 === 2 || f === floors - 1) box(w * s * 1.08, 0.045, w * s * 1.08, own, y + FH / 2);
    }
    const h = 0.06 + floors * FH;
    if (lv === 4) {
      const cone = new T.Mesh(new T.ConeGeometry(0.1, 0.6, 8), goldMat);
      cone.position.y = h + 0.3;
      cone.castShadow = true;
      g.add(cone);
    } else box(w * 1.12, 0.09, w * 1.12, own, h + 0.045);
    if (lv === 1) {
      const awning = box(w * 1.1, 0.04, 0.18, own, 0.24);
      awning.position.z = w / 2 + 0.07;
      awning.rotation.x = 0.4;
    }
    return g;
  };
  const build = async (i: number, lv: number, colour: any) => {
    const old = towers[i], at = plots[i];
    void wave(pads[i], colour.getHex());
    void beam(at, colour.getHex());
    sparkles(at.clone().setY(TOP), colour.getHex(), 36);
    if (old) {
      await tween(180, (k) => old.scale.set(1, Math.max(0.01, 1 - k), 1));
      root.remove(old);
    }
    const t = towerModel(lv, colour) ?? towerOf(lv, colour);
    t.position.set(at.x, cellTop(at.x, at.z), at.z);
    t.lookAt(pads[i].x, t.position.y, pads[i].z); // its front faces the road
    root.add(t);
    towers[i] = t;
    await tween(560 + lv * 110, (k) => {
      const s = easeBack(k), squeeze = 0.15 * Math.sin(k * Math.PI) * (1 - k);
      const m = plotScale[i];
      t.scale.set(m * (1 + squeeze), m * Math.max(0.01, s), m * (1 + squeeze));
    });
  };
  /** A textured model's material whose pure magenta parts take the owner's colour (Sky's drawings, 2026-10-20). */
  const ownerTinted = (m: any, colour: any) => {
    const mm = m.clone();
    const u = { value: colour.clone() };
    mm.onBeforeCompile = (sh: any) => {
      sh.uniforms.uOwner = u;
      sh.fragmentShader =
        "uniform vec3 uOwner;\n" +
        sh.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\nfloat mg = smoothstep(0.06, 0.22, min(diffuseColor.r, diffuseColor.b) - diffuseColor.g);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uOwner * (0.45 + 0.75 * max(diffuseColor.r, diffuseColor.b)), mg);",
        );
    };
    mm.customProgramCacheKey = () => "owner";
    return mm;
  };
  /** The owner's tower from Sky's drawings (shop, flats, office, skyscraper), if loaded. */
  const TOWER_TALL = theme.towerTall ?? [0, 0.62, 0.95, 1.3, 1.95];
  const towerModel = (lv: number, colour: any) => {
    const g = placed(`tower${lv}`, TOWER_TALL[lv]);
    if (!g) return null;
    g.traverse((x: any) => {
      if (x.isMesh) x.material = ownerTinted(x.material, colour);
    });
    return g;
  };
  const cellTop = (x: number, z: number) => {
    if (arch) return ARCH_TOP;
    let best = 0.2, bd = 1e9;
    for (const c of cells) {
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) { bd = d; best = c.top; }
    }
    return best + 0.05;
  };

  // ---------- Neighbours of one owner join up with a little garden ----------
  const links = new Map<string, any>();
  const linkKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const unlink = (i: number) => {
    for (const [k, g] of links) {
      const [a, b] = k.split("-").map(Number);
      if (a === i || b === i) {
        root.remove(g);
        links.delete(k);
      }
    }
  };
  const joinNeighbours = async (i: number) => {
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= lots.length || Math.floor(j / 6) !== Math.floor(i / 6) || owner[j] !== owner[i]) continue;
      const k = linkKey(i, j);
      if (links.has(k)) continue;
      const a = plots[i], b = plots[j], mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b) - 0.55;
      if (len <= 0.1) continue;
      const g = new T.Group();
      g.position.set(mid.x, cellTop(mid.x, mid.z), mid.z);
      g.lookAt(b.x, g.position.y, b.z);
      const deck = new T.Mesh(new T.BoxGeometry(0.34, 0.06, len), new T.MeshStandardMaterial({ color: lin(0xd9c19a), roughness: 0.8 }));
      deck.position.y = 0.04;
      deck.castShadow = deck.receiveShadow = true;
      const railM = new T.MeshStandardMaterial({ color: new T.Color(colourOf[i]).convertSRGBToLinear(), roughness: 0.5 });
      const r1 = new T.Mesh(new T.BoxGeometry(0.04, 0.1, len), railM);
      r1.position.set(0.17, 0.11, 0);
      const r2 = r1.clone();
      r2.position.x = -0.17;
      g.add(deck, r1, r2);
      for (let f = 0; f < 6; f++) {
        const fl = new T.Mesh(new T.SphereGeometry(0.05, 6, 4), flowerM[f % 4]);
        fl.position.set(f % 2 ? 0.26 : -0.26, 0.06, (f / 5 - 0.5) * len * 0.9);
        g.add(fl);
      }
      root.add(g);
      links.set(k, g);
      sparkles(g.position.clone().setY(TOP), railM.color.getHex(), 22);
      await pop(g, 600);
    }
  };

  // ---------- A whole area for one owner: its marvel ----------
  const marvels: (any | null)[] = [null, null, null];
  const marvelOwner: (number | null)[] = [null, null, null];
  const waterTex = (() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "#6fd3ff";
    x.fillRect(0, 0, 32, 128);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
      x.fillRect(Math.random() * 32, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 24);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  })();
  const waterM = new T.MeshStandardMaterial({ map: waterTex, color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.9, emissive: lin(0x1d6f9a), emissiveIntensity: 0.35 });
  const marvelOf = (kind: MarvelKind, colour: any) => {
    const g = new T.Group();
    const add = (m: any, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const SIZE: Record<MarvelKind, [number, number?]> = {
      worldTree: [3.4], goldMine: [1.9], waterfall: [1.8],
      volcanoNest: [2.4, 3.1], goldTemple: [2.2, 3.0], stormBridge: [2.6, 3.1],
    };
    const model = placed(kind, SIZE[kind][0], SIZE[kind][1]);
    if (model) g.add(model);
    const topOf = model ? new T.Box3().setFromObject(model).max.y : 2;
    /** A glowing dot (fire, sparks, gold dust), moved in tick by its role. */
    const dot = (colour: number, role: string, k: number, add = true) => {
      const f = new T.Sprite(new T.SpriteMaterial({ map: add ? o.glowTex : puffTex, color: colour, blending: add ? T.AdditiveBlending : T.NormalBlending, depthWrite: false, transparent: true }));
      f.userData[role] = k;
      f.userData.top = topOf;
      g.add(f);
      return f;
    };
    if (kind === "worldTree") {
      if (!model) add(new T.Mesh(new T.CylinderGeometry(0.2, 0.36, 1.8, 8), trunkM), 0, 0.9, 0);
      const crownM = new T.MeshStandardMaterial({ color: lin(0x4fd36a), roughness: 0.7, flatShading: true, emissive: lin(0x1d6b2a), emissiveIntensity: 0.4 });
      if (!model) {
        add(new T.Mesh(new T.IcosahedronGeometry(1.05, 1), crownM), 0, 2.3, 0);
        add(new T.Mesh(new T.IcosahedronGeometry(0.6, 1), crownM), 0.75, 1.9, 0.2);
        add(new T.Mesh(new T.IcosahedronGeometry(0.55, 1), crownM), -0.7, 2, -0.1);
      }
      for (let k = 0; k < 10; k++) {
        const f = new T.Sprite(new T.SpriteMaterial({ map: o.glowTex, color: 0xfff6a0, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
        f.scale.set(0.16, 0.16, 1);
        f.userData.firefly = k;
        g.add(f);
      }
    } else if (kind === "volcanoNest") {
      // 火山龍巢: embers and smoke out of the nest, a hot glow pulsing in it.
      if (!model) add(new T.Mesh(new T.ConeGeometry(1.4, 2.2, 8), new T.MeshStandardMaterial({ color: lin(0x3a3236), roughness: 0.95, flatShading: true })), 0, 1.1, 0);
      for (let k = 0; k < 22; k++) dot(k % 3 ? 0xff7a1a : 0xffd04a, "ember", k);
      for (let k = 0; k < 8; k++) dot(0x6b6470, "smoke", k, false).material.opacity = 0.5;
      const heat = dot(0xff5a10, "heat", 0);
      heat.position.set(0, topOf * 0.82, 0);
    } else if (kind === "goldTemple") {
      // 黃金神殿: a warm golden glow breathing over it, gold dust circling.
      if (!model) add(new T.Mesh(new T.BoxGeometry(2, 1.4, 1.4), new T.MeshStandardMaterial({ color: lin(0xf3e6c8), roughness: 0.5 })), 0, 0.7, 0);
      const halo = dot(0xffc83a, "heat", 1);
      halo.position.set(0, topOf * 0.6, 0);
      for (let k = 0; k < 14; k++) dot(0xffe27a, "dust", k);
    } else if (kind === "stormBridge") {
      // 雷雲浮橋: a storm cloud over it, lightning striking the towers now and then.
      if (!model) {
        add(new T.Mesh(new T.BoxGeometry(0.6, 2, 0.6), stoneMat), -1, 1, 0);
        add(new T.Mesh(new T.BoxGeometry(0.6, 2, 0.6), stoneMat), 1, 1, 0);
        add(new T.Mesh(new T.BoxGeometry(2, 0.15, 0.4), stoneMat), 0, 1.3, 0);
      }
      for (let k = 0; k < 7; k++) {
        const c = dot(k % 2 ? 0x5a5f78 : 0x737a96, "storm", k, false);
        c.material.opacity = 0.85;
        c.scale.set(1.6, 0.8, 1);
      }
      const boltGeo = new T.BufferGeometry();
      boltGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(10 * 3), 3));
      const bolt = new T.Line(boltGeo, new T.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      bolt.userData.bolt = { next: 0, until: 0 };
      g.userData.boltTop = topOf;
      g.add(bolt);
      const flash = dot(0xbfdcff, "flash", 0);
      flash.material.opacity = 0;
    } else if (kind === "goldMine") {
      if (!model) {
        add(new T.Mesh(new T.ConeGeometry(1.3, 2.1, 7), new T.MeshStandardMaterial({ color: lin(0x9a7b55), roughness: 0.95, flatShading: true })), 0, 1.05, 0);
        add(new T.Mesh(new T.ConeGeometry(0.55, 0.85, 7), goldOre), 0, 1.75, 0);
        const door = add(new T.Mesh(new T.CircleGeometry(0.28, 16, 0, Math.PI), new T.MeshBasicMaterial({ color: 0x1a1208 })), 0, 0.02, 1.02);
        door.castShadow = false;
        for (let k = 0; k < 7; k++) add(new T.Mesh(new T.OctahedronGeometry(0.13 + (k % 3) * 0.04), goldOre), Math.cos(k * 0.9 + 0.3) * 1.25, 0.12, Math.sin(k * 0.9 + 0.3) * 1.05 + 0.2);
      }
    } else {
      const cliffM = new T.MeshStandardMaterial({ color: lin(0x6f6a7c), roughness: 0.95, flatShading: true });
      if (!model) {
        add(new T.Mesh(new T.BoxGeometry(1.5, 1.7, 0.9), cliffM), 0, 0.85, -0.2);
        add(new T.Mesh(new T.DodecahedronGeometry(0.5, 0), cliffM), -0.75, 1.5, -0.1);
      }
      add(new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 0.08, 24), waterM), 0, 0.06, model ? 1.05 : 0.65);
      add(new T.Mesh(new T.BoxGeometry(0.72, 1.7, 0.05), waterM), 0, 0.85, model ? 0.62 : 0.27);
    }
    const crown = new T.Mesh(new T.TorusGeometry(0.3, 0.06, 8, 24), new T.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.5, roughness: 0.3 }));
    crown.position.y = kind === "worldTree" ? 3.6 : kind === "goldMine" ? 2.6 : kind === "waterfall" ? 2.2 : topOf + 0.45;
    crown.rotation.x = Math.PI / 2;
    g.add(crown);
    g.userData.spin = crown;
    return g;
  };
  const checkZone = async (z: number) => {
    const six = [0, 1, 2, 3, 4, 5].map((k) => z * 6 + k);
    const who = owner[six[0]];
    const whole = who !== null && six.every((i) => owner[i] === who) ? who : null;
    if (whole === marvelOwner[z]) return;
    if (marvels[z]) {
      const old = marvels[z];
      marvels[z] = null;
      void tween(300, (k) => old.scale.setScalar(Math.max(0.01, 1 - k))).then(() => root.remove(old));
    }
    marvelOwner[z] = whole;
    if (whole === null) return;
    const at = marvelAt[z], colour = new T.Color(colourOf[six[0]]).convertSRGBToLinear();
    void beam(at, 0xffe066, 14, 1.3);
    void wave(at, 0xffe066, 8);
    sparkles(at.clone().setY(1), 0xffe066, 80, 3.2);
    await wait(450);
    const g = marvelOf(theme.zones[z].marvel, colour);
    g.position.set(at.x, cellTop(at.x, at.z) - 0.05, at.z);
    root.add(g);
    marvels[z] = g;
    await pop(g, 900);
  };

  // ---------- The middle landmark grows with the whole board ----------
  let stage = 0;
  const middle = new T.Group();
  middle.position.set(middleAt.x, cellTop(middleAt.x, middleAt.z) - 0.05, middleAt.z);
  root.add(middle);
  const growMiddle = async () => {
    const want = landmarkStage(theme, level.reduce((s, l) => s + l, 0));
    if (want <= stage) return;
    const first = stage === 0;
    stage = want;
    if (arch) wakeIsland(3);
    if (first) {
      clearFog(-1);
      cells.forEach((c, k) => {
        if (c.pad !== -1 || c.woke >= 1) return;
        void wait(Math.hypot(c.x - middleAt.x, c.z - middleAt.z) * 90).then(() =>
          tween(420, (kk) => {
            c.woke = easeBack(kk);
            setCell(k);
            touched();
          }),
        );
      });
      sleepers.filter((s) => s.pad === -1 && !s.woke).forEach((s, n) => void wait(n * 60).then(() => colourIn(s)));
    }
    void beam(middle.position, 0x9fd8ff, 12, 1.5);
    sparkles(middle.position.clone().setY(1), 0x9fd8ff, 50, 2.6);
    middle.clear();
    const kind = theme.landmark[want - 1].kind;
    const g = new T.Group();
    const stone = new T.MeshStandardMaterial({ color: lin(0xe7dcc6), roughness: 0.6 });
    const add = (m: any, y: number) => {
      m.position.y = y;
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const drops = (s: number) => {
      for (let k = 0; k < 12; k++) {
        const d = new T.Sprite(new T.SpriteMaterial({ map: o.glowTex, color: 0xbfeaff, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
        d.scale.set(0.12, 0.12, 1);
        d.userData.drop = k;
        d.userData.size = s;
        g.add(d);
      }
    };
    // Sky's drawings made 3D (2026-10-20); the shapes below are the fallback while they load.
    const LANDMARK_MODEL: Record<string, [string, number]> = {
      fountain: ["fountain", 0.95], bigFountain: ["bigFountain", 1.35], clockTower: ["clockTower", 2.9],
      // 巨龍天空城 (Sky 2026-10-23): egg statue → dragon statue → dragon tower; at the top a real dragon flies round.
      eggStatue: ["eggStatue", 1.3], dragonStatue: ["dragonStatue", 1.8], dragonTower: ["dragonTower", 3.0], skyDragon: ["dragonTower", 3.0],
    };
    const dragonKind = kind === "eggStatue" || kind === "dragonStatue" || kind === "dragonTower" || kind === "skyDragon";
    const lm = (LANDMARK_MODEL[kind] && placed(LANDMARK_MODEL[kind][0], LANDMARK_MODEL[kind][1])) || (dragonKind ? (() => {
      const s = new T.Group();
      const h = kind === "eggStatue" ? 1.1 : kind === "dragonStatue" ? 1.6 : 2.8;
      const body = new T.Mesh(new T.CylinderGeometry(0.35, 0.6, h, 10), stone);
      body.position.y = h / 2;
      s.add(body);
      return s;
    })() : null);
    const stand = kind === "ferrisWheel" ? placed("wheelStand", 2.5) : null;
    const wheelModel = stand ? placed("wheel", 2.4) : null;
    if (lm) {
      g.add(lm);
      if (dragonKind) {
        // A glow in the statue's eyes / round its top, and at the last stage the dragon itself, circling the island.
        const glow = new T.Sprite(new T.SpriteMaterial({ map: o.glowTex, color: 0xffc83a, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
        const top = new T.Box3().setFromObject(lm).max.y;
        glow.position.y = top * 0.85;
        glow.scale.set(1.4, 1.4, 1);
        glow.userData.halo = true;
        g.add(glow);
        if (kind === "skyDragon") {
          const fly = placed("skyDragon", 9, 2.8);
          if (fly) {
            const holder = new T.Group();
            holder.add(fly);
            g.add(holder);
            g.userData.flyer = holder;
          }
        }
      } else if (kind !== "clockTower") drops(kind === "fountain" ? 1.05 : 1.5);
      else {
        // The clock face is painted on the model (front, about halfway up); real hands go over it so they turn.
        const H = 2.9, k = H / 1.9;
        const face = new T.Group();
        face.position.set(0, 0.52 * H, 0.35 * k + 0.012);
        const dial = new T.Mesh(new T.CircleGeometry(0.21 * k * 0.78, 32), new T.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.6 }));
        const handM = new T.MeshStandardMaterial({ color: lin(0xc9961f), metalness: 0.6, roughness: 0.3 });
        const handOf = (len: number, wide: number) => {
          const geo = new T.BoxGeometry(wide, len, 0.015);
          geo.translate(0, len / 2 - 0.02, 0);
          const h = new T.Mesh(geo, handM);
          h.position.z = 0.01;
          return h;
        };
        const minute = handOf(0.24, 0.035), hour = handOf(0.15, 0.05);
        const pin = new T.Mesh(new T.CircleGeometry(0.03, 12), handM);
        pin.position.z = 0.025;
        face.add(dial, hour, minute, pin);
        g.add(face);
        g.userData.hand = minute;
        g.userData.hourHand = hour;
      }
    } else if (stand && wheelModel) {
      g.add(stand);
      const pivot = new T.Group();
      pivot.position.set(0, 2.5 * 0.82, 0.3);
      wheelModel.position.y = -1.2;
      pivot.add(wheelModel);
      g.add(pivot);
      g.userData.wheel = pivot;
      g.rotation.y = 0.25;
    } else if (kind === "fountain" || kind === "bigFountain") {
      const s = kind === "fountain" ? 0.65 : 1;
      add(new T.Mesh(new T.CylinderGeometry(s, s * 1.05, 0.28, 24), stone), 0.14);
      add(new T.Mesh(new T.CylinderGeometry(s * 0.88, s * 0.88, 0.05, 24), waterM), 0.28);
      add(new T.Mesh(new T.CylinderGeometry(0.09, 0.13, 0.75 * s, 10), stone), 0.55 * s);
      if (kind === "bigFountain") add(new T.Mesh(new T.CylinderGeometry(0.38, 0.42, 0.1, 16), goldMat), 0.95);
      for (let k = 0; k < 12; k++) {
        const d = new T.Sprite(new T.SpriteMaterial({ map: o.glowTex, color: 0xbfeaff, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
        d.scale.set(0.12, 0.12, 1);
        d.userData.drop = k;
        d.userData.size = s;
        g.add(d);
      }
    } else if (kind === "clockTower") {
      add(new T.Mesh(new T.BoxGeometry(0.85, 2.4, 0.85), stone), 1.2);
      const face = add(new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.04, 24), new T.MeshStandardMaterial({ color: 0xffffff })), 1.95);
      face.rotation.x = Math.PI / 2;
      face.position.z = 0.44;
      const hand = add(new T.Mesh(new T.BoxGeometry(0.03, 0.2, 0.02), new T.MeshStandardMaterial({ color: 0x222222 })), 2.02);
      hand.position.z = 0.47;
      g.userData.hand = hand;
      const roof = add(new T.Mesh(new T.ConeGeometry(0.7, 0.85, 4), new T.MeshStandardMaterial({ color: lin(0x7c3aed) })), 2.82);
      roof.rotation.y = Math.PI / 4;
    } else {
      const legM = new T.MeshStandardMaterial({ color: lin(0xf3ead8) });
      const l1 = add(new T.Mesh(new T.BoxGeometry(0.11, 2.2, 0.11), legM), 1.1);
      l1.position.x = -0.45;
      l1.rotation.z = -0.2;
      const l2 = add(new T.Mesh(new T.BoxGeometry(0.11, 2.2, 0.11), legM), 1.1);
      l2.position.x = 0.45;
      l2.rotation.z = 0.2;
      const wheel = new T.Group();
      wheel.position.y = 2.2;
      wheel.add(new T.Mesh(new T.TorusGeometry(1.25, 0.055, 8, 48), new T.MeshStandardMaterial({ color: lin(0xff6fae), emissive: lin(0x6a1a40), emissiveIntensity: 0.4 })));
      const cabs = [0x7c3aed, 0x2563eb, 0xeab308, 0x16a34a, 0xf97316, 0xec4899, 0xdc2626];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const spoke = new T.Mesh(new T.BoxGeometry(0.03, 1.25, 0.03), legM);
        spoke.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
        spoke.rotation.z = a - Math.PI / 2;
        wheel.add(spoke);
        const cab = new T.Mesh(new T.BoxGeometry(0.22, 0.18, 0.18), new T.MeshStandardMaterial({ color: lin(cabs[k % cabs.length]) }));
        cab.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25 - 0.11, 0);
        cab.userData.cab = true;
        wheel.add(cab);
      }
      g.add(wheel);
      g.userData.wheel = wheel;
    }
    middle.add(g);
    await pop(g, 800);
  };

  // ---------- Light: dusky while asleep, warm once awake ----------
  const shine = () => {
    const k = awakeShare(), f = theme.light.asleep + (theme.light.awake - theme.light.asleep) * Math.min(1, k * 1.4);
    for (const l of o.lights) l.light.intensity = l.full * f;
  };
  shine();

  return {
    root,
    async own(key, seat, colour, lv) {
      const i = lots.indexOf(key);
      if (i < 0) return;
      const first = owner[i] === null, changed = owner[i] !== seat;
      if (changed && !first) unlink(i);
      owner[i] = seat;
      colourOf[i] = colour;
      const c = new T.Color(colour).convertSRGBToLinear();
      const rim = padRims[i];
      rim.material.color.copy(c);
      rim.material.emissive = c.clone();
      rim.material.emissiveIntensity = 0.5;
      if (first) {
        if (arch) wakeIsland(Math.floor(i / 6));
        await wakeLand(i);
      }
      if (lv !== level[i] || changed) {
        level[i] = lv;
        await build(i, Math.max(1, Math.min(4, lv)), c);
      }
      if (changed) {
        await joinNeighbours(i);
        await checkZone(Math.floor(i / 6));
      }
      await growMiddle();
    },
    clear(key) {
      const i = lots.indexOf(key);
      if (i < 0 || owner[i] === null) return;
      owner[i] = null;
      level[i] = 0;
      unlink(i);
      if (towers[i]) root.remove(towers[i]);
      towers[i] = null;
      const rim = padRims[i];
      rim.material.color.copy(goldMat.color);
      rim.material.emissiveIntensity = 0;
      sleepLand(i);
      if (arch) wakeIsland(Math.floor(i / 6));
      void checkZone(Math.floor(i / 6));
    },
    tick(now) {
      for (const f of fog) {
        if (!f.alive) continue;
        f.s.position.x += Math.sin(now / 3000 + f.phase) * 0.002;
        f.s.position.y = f.y + Math.sin(now / 2200 + f.phase) * 0.05;
      }
      for (const it of islets) it.g.position.y = it.y + Math.sin(now / 1800 + it.phase) * 0.18;
      for (const c of cloudSea) c.s.position.x = c.x + Math.sin(now / 9000 + c.phase) * 1.2 + ((now / 1000) * c.speed + c.phase) % 6 - 3;
      roadMat.opacity = 0.45 + Math.sin(now / 900) * 0.12;
      crystalMat.emissiveIntensity = 0.5 + Math.sin(now / 700) * 0.25;
      waterTex.offset.y = (now / 1400) % 1;
      for (const g of marvels) {
        if (!g) continue;
        g.userData.spin.rotation.z = now / 600;
        g.children.forEach((c: any) => {
          const u = c.userData;
          if (u.ember !== undefined) {
            const k = ((now / 1700 + u.ember / 22) % 1), a = u.ember * 2.39;
            c.position.set(Math.cos(a) * (0.15 + k * 0.5), u.top * 0.85 + k * 1.8, Math.sin(a) * (0.15 + k * 0.5));
            const sz = 0.22 * (1 - k) + 0.04;
            c.scale.set(sz, sz, 1);
            c.material.opacity = 1 - k;
          } else if (u.smoke !== undefined) {
            const k = ((now / 4200 + u.smoke / 8) % 1);
            c.position.set(Math.sin(u.smoke * 1.7) * 0.3 + k * 0.6, u.top * 0.9 + 0.3 + k * 2.4, Math.cos(u.smoke * 1.7) * 0.3);
            const sz = 0.5 + k * 1.3;
            c.scale.set(sz, sz, 1);
            c.material.opacity = 0.45 * (1 - k);
          } else if (u.heat !== undefined) {
            const sz = (u.heat ? 3.2 : 1.6) * (1 + Math.sin(now / 380 + u.heat) * 0.12);
            c.scale.set(sz, sz, 1);
            c.material.opacity = u.heat ? 0.35 + Math.sin(now / 900) * 0.12 : 0.75 + Math.sin(now / 160) * 0.2;
          } else if (u.dust !== undefined) {
            const a = now / 1600 + u.dust * 0.45;
            c.position.set(Math.cos(a) * 1.5, u.top * 0.4 + Math.sin(a * 1.3 + u.dust) * 0.6 + 0.6, Math.sin(a) * 1.1);
            c.scale.set(0.12, 0.12, 1);
          } else if (u.storm !== undefined) {
            c.position.set((u.storm - 3) * 0.45 + Math.sin(now / 2000 + u.storm) * 0.1, u.top + 0.9 + (u.storm % 2) * 0.25, Math.cos(u.storm * 2.1) * 0.35);
          } else if (u.bolt) {
            const b = u.bolt;
            if (now > b.next) {
              // A new strike: a jagged line from the cloud down to one of the towers.
              const pos = c.geometry.attributes.position, x0 = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.4);
              const top = g.userData.boltTop ?? 2.6;
              for (let i = 0; i < 10; i++) {
                const f = i / 9;
                pos.setXYZ(i, x0 * (0.2 + f * 0.8) + (i && i < 9 ? (Math.random() - 0.5) * 0.35 : 0), top + 1.1 - f * 1.6, (Math.random() - 0.5) * 0.2);
              }
              pos.needsUpdate = true;
              b.until = now + 260;
              b.next = now + 1800 + Math.random() * 2600;
            }
            c.material.opacity = now < b.until ? (Math.floor((b.until - now) / 60) % 2 ? 1 : 0.3) : 0;
          } else if (u.flash !== undefined) {
            const bolt = g.children.find((x: any) => x.userData.bolt);
            const on = bolt && now < bolt.userData.bolt.until;
            c.position.set(0, u.top + 0.6, 0);
            c.scale.set(4, 3, 1);
            c.material.opacity = on ? 0.55 : 0;
          }
        });
        g.children.forEach((c: any) => {
          if (c.userData.firefly === undefined) return;
          const a = now / 900 + c.userData.firefly;
          c.position.set(Math.cos(a) * 1.3, 1.8 + Math.sin(a * 1.7) * 0.6, Math.sin(a) * 1.3);
        });
      }
      const m = middle.children[0];
      if (m?.userData.wheel) {
        const w = m.userData.wheel;
        w.rotation.z = now / 2500;
        w.children.forEach((c: any) => c.userData.cab && (c.rotation.z = -w.rotation.z));
      }
      if (m?.userData.hand) m.userData.hand.rotation.z = -now / 800;
      m?.children.forEach((c: any) => c.userData.halo && (c.material.opacity = 0.45 + Math.sin(now / 700) * 0.2));
      if (m?.userData.flyer) {
        // 真龍盤旋: round the island, rising and dipping, banking into the turn, wings beating (a squash in time).
        const f = m.userData.flyer, a = now / 5200;
        const rx = 6.2, rz = 5.4;
        f.position.set(Math.cos(a) * rx, 3.4 + Math.sin(a * 2.3) * 0.6, Math.sin(a) * rz);
        // The model faces +z (head forward): turn it along its path and lean into the turn (toward the middle).
        const vx = -Math.sin(a) * rx, vz = Math.cos(a) * rz, yaw = Math.atan2(vx, vz);
        const side = Math.cos(yaw) * -f.position.x + -Math.sin(yaw) * -f.position.z;
        f.rotation.order = "YXZ";
        f.rotation.set(-0.08, yaw, side > 0 ? -0.35 : 0.35);
        const beat = Math.sin(now / 160);
        f.scale.set(1, 1 + beat * 0.08, 1 - Math.abs(beat) * 0.04);
      }
      if (m?.userData.hourHand) m.userData.hourHand.rotation.z = -now / 9600;
      m?.children.forEach((c: any) => {
        if (c.userData.drop === undefined) return;
        const k = ((now / 1100 + c.userData.drop / 12) % 1), a = (c.userData.drop / 12) * Math.PI * 2, s = c.userData.size;
        c.position.set(Math.cos(a) * k * 0.6 * s, 0.9 * s + Math.sin(k * Math.PI) * 0.45 - k * 0.55, Math.sin(a) * k * 0.6 * s);
        c.material.opacity = 1 - k * 0.6;
      });
      shine();
    },
  };
}

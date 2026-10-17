/**
 * 龍仔 on the plaza (Sky 2026-10-17): no nest — the player's dragon wanders about inside the round plaza, stops now
 * and then, and every so often flies up and hangs there looking at the camera before landing again.
 * Positions are in world units round the plaza's middle; the camera is towards +z.
 */
export type RoamPose = { x: number; z: number; y: number; yaw: number; mood: "rest" | "walk" | "fly" };

export function createRoamer(rx: number, rz: number, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = () => {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
    return { x: Math.cos(a) * rx * r, z: Math.sin(a) * rz * r };
  };
  const pose: RoamPose = { x: 0, z: 0, y: 0, yaw: 0, mood: "rest" };
  let phase: "walk" | "pause" | "up" | "hover" | "down" = "pause";
  let until = 1500;
  let target = pick();
  let walks = 0;
  let last = -1;
  const turnTo = (want: number, dt: number) => {
    const d = ((want - pose.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    pose.yaw += d * Math.min(1, dt * 5);
  };
  return function update(now: number): RoamPose {
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    if (phase === "walk") {
      const dx = target.x - pose.x, dz = target.z - pose.z, d = Math.hypot(dx, dz);
      pose.mood = "walk";
      turnTo(Math.atan2(dx, dz), dt);
      const step = 0.45 * dt;
      if (d <= step) {
        pose.x = target.x;
        pose.z = target.z;
        walks += 1;
        if (walks >= 3 + Math.floor(rnd() * 2)) {
          walks = 0;
          phase = "up";
          until = now + 900;
        } else {
          phase = "pause";
          until = now + 900 + rnd() * 1600;
        }
      } else {
        pose.x += (dx / d) * step;
        pose.z += (dz / d) * step;
      }
    } else if (phase === "pause") {
      pose.mood = "rest";
      turnTo(0, dt * 0.4); // glance towards the players
      if (now >= until) {
        target = pick();
        phase = "walk";
      }
    } else if (phase === "up") {
      pose.mood = "fly";
      turnTo(0, dt);
      pose.y += (0.9 - pose.y) * Math.min(1, dt * 3);
      if (now >= until) {
        phase = "hover";
        until = now + 2600;
      }
    } else if (phase === "hover") {
      pose.mood = "fly";
      turnTo(0, dt); // looking straight at us
      pose.y = 0.9 + Math.sin(now / 300) * 0.06;
      if (now >= until) {
        phase = "down";
        until = now + 900;
      }
    } else {
      pose.mood = "fly";
      pose.y += (0 - pose.y) * Math.min(1, dt * 4);
      if (now >= until) {
        pose.y = 0;
        phase = "pause";
        until = now + 1200;
      }
    }
    return pose;
  };
}

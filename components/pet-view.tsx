"use client";

import { loadThree } from "@/components/eight-scene";
import { MODEL_CLOSE_UP, buildMonster } from "@/components/monster";
import { useEffect, useRef, useState } from "react";

/**
 * One monster on a little floating stone, turning slowly; drag to spin it round. Remount (key) to
 * show a different monster or stage.
 */
export function PetView({
  element,
  stage,
  legend = false,
  hungry = false,
  tired = false,
  feeds = 0,
  onPet,
}: {
  element: number;
  stage: number;
  legend?: boolean;
  hungry?: boolean;
  /** 冇精神: today's meal not given yet — it sags and waits (Sky 2026-10-21). */
  tired?: boolean;
  /** Goes up by one for every bite fed: it chomps happily. */
  feeds?: number;
  onPet?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // What can change without rebuilding the scene.
  const live = useRef({ tired, feeds, onPet });
  live.current = { tired, feeds, onPet };
  // No 3D (WebGL refused or lost, which happens on iPhones): try once more, then show the drawn dragon.
  const [tries, setTries] = useState(0);
  const flat = tries >= 2;
  useEffect(() => {
    if (flat) return;
    let dead = false;
    let stop = () => undefined as void;
    loadThree()
      .then((T) => {
        const host = box.current;
        if (dead || !host) return;
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        if (!renderer.getContext()) throw new Error("no webgl");
        renderer.domElement.addEventListener("webglcontextlost", (e: Event) => {
          e.preventDefault();
          if (!dead) setTries((n) => n + 1);
        });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputEncoding = T.sRGBEncoding;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.shadowMap.enabled = true;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "pan-y";
        host.appendChild(renderer.domElement);
        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
        scene.add(new T.HemisphereLight(0xeef4ff, 0x30354a, 0.9));
        const sun = new T.DirectionalLight(0xfff2dc, 1.2);
        sun.position.set(-2, 5, 4);
        sun.castShadow = true;
        scene.add(sun);
        const stone = new T.Mesh(new T.CylinderGeometry(1.1, 0.7, 0.5, 10), new T.MeshStandardMaterial({ color: new T.Color(0x8a8f98).convertSRGBToLinear(), roughness: 0.9, flatShading: true }));
        stone.position.y = -0.25;
        stone.receiveShadow = true;
        const grass = new T.Mesh(new T.CylinderGeometry(1.12, 1.1, 0.1, 10), new T.MeshStandardMaterial({ color: new T.Color(0x6aa84f).convertSRGBToLinear(), roughness: 0.8 }));
        grass.position.y = 0.02;
        grass.receiveShadow = true;
        const turn = new T.Group();
        turn.add(stone, grass);
        const monster = buildMonster(T, element, stage, legend);
        monster.group.scale.setScalar(stage === 0 ? 1.1 : monster.model ? 1.25 * MODEL_CLOSE_UP : 1.25);
        monster.group.position.y = 0.07;
        turn.add(monster.group);
        scene.add(turn);
        // 見到主人 (Sky 2026-10-21; 2026-10-22: no hearts, something cooler): on opening the page the dragon turns to
        // you and bounces; a ring of its element's light sweeps out over the stone and sparks of the same colour
        // rise round it. A fed dragon gives off a slow drift of sparks; each bite or tap sets off a smaller burst.
        const glow = [0xffe066, 0xb45cff, 0x9dff6b][element] ?? 0xffe066;
        const sparkTex = (() => {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const x = c.getContext("2d")!;
          const col = new T.Color(glow);
          const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
          const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
          g.addColorStop(0, "rgba(255,255,255,1)");
          g.addColorStop(0.25, `rgba(${rgb},0.95)`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          x.fillStyle = g;
          x.fillRect(0, 0, 64, 64);
          return new T.CanvasTexture(c);
        })();
        const sparks: { s: any; born: number; x: number; z: number; rise: number; life: number; size: number }[] = [];
        const height = monster.height * (monster.model ? MODEL_CLOSE_UP : 1) * (stage === 0 ? 1.1 : 1.25);
        const ring = new T.Mesh(
          new T.RingGeometry(0.9, 1.05, 64),
          new T.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.09;
        turn.add(ring);
        let ringFrom = -1e9;
        let greetUntil = 0, greetFrom = 0, nextHeart = 0, hearty = true;
        const greet = (now: number, long: boolean, bite = false) => {
          // Sparks when it's well, or when it's just been given a bite; a hungry dragon only perks up.
          hearty = bite || (!hungry && !live.current.tired);
          if (stage === 0) return;
          greetFrom = now;
          greetUntil = now + (long ? 2800 : 1800);
          monster.setMood("happy");
          nextHeart = now;
          if (hearty) {
            ringFrom = now;
            for (let k = 0; k < (long ? 16 : 8); k++) addHeart(now, true);
          }
        };
        const addHeart = (now: number, burst = false) => {
          const sp = new T.Sprite(new T.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
          const a = Math.random() * Math.PI * 2, r = 0.45 + Math.random() * 0.6;
          const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.7 + 0.2;
          sp.position.set(x, 0.12, z);
          sp.scale.setScalar(0.01);
          scene.add(sp);
          sparks.push({ s: sp, born: now, x, z, rise: burst ? 1.4 + Math.random() * 0.8 : 0.8 + Math.random() * 0.5, life: burst ? 900 + Math.random() * 400 : 1800 + Math.random() * 800, size: burst ? 0.12 + Math.random() * 0.08 : 0.07 + Math.random() * 0.05 });
        };
        const fit = () => {
          const w = host.clientWidth || 300, h = host.clientHeight || 300;
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = `${w}px`;
          renderer.domElement.style.height = `${h}px`;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        const watch = new ResizeObserver(fit);
        watch.observe(host);
        fit();
        const lookY = monster.height * (monster.model ? MODEL_CLOSE_UP : 1) * 0.55;
        camera.position.set(0, lookY + 1.3, 5.2);
        camera.lookAt(0, lookY, 0);
        let spin = 0.4, drag: number | null = null, frame = 0, downX = 0;
        const down = (e: PointerEvent) => {
          drag = e.clientX;
          downX = e.clientX;
        };
        const move = (e: PointerEvent) => {
          if (drag === null) return;
          spin += (e.clientX - drag) * 0.01;
          drag = e.clientX;
        };
        const up = (e: PointerEvent) => {
          // A tap (not a spin) on the dragon: it's pleased to be patted.
          if (drag !== null && Math.abs(e.clientX - downX) < 6) {
            greet(performance.now(), false);
            live.current.onPet?.();
          }
          drag = null;
        };
        renderer.domElement.addEventListener("pointerdown", down);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        let started = false;
        let seenFeeds = live.current.feeds;
        // A fed dragon gives off a slow drift of sparks; finishing today's meal sets off a big burst.
        let wasTired = live.current.tired, idleHeart = 0;
        let mood = "";
        const tick = (now: number) => {
          if (!started) {
            started = true;
            greet(now + 250, true);
          }
          // A bite: a short happy chomp with a burst of sparks.
          if (live.current.feeds !== seenFeeds) {
            seenFeeds = live.current.feeds;
            greet(now, false, true);
            greetUntil = now + 900;
          }
          const greeting = now < greetUntil;
          if (drag === null && !greeting) spin += 0.004;
          // While greeting it swings round to face you, with a happy little wiggle.
          const facing = greeting ? Math.min(1, (now - greetFrom) / 350) : 0;
          if (greeting) spin = spin * (1 - facing * 0.12);
          turn.rotation.y = Math.sin(spin) * 0.9 * (1 - facing) + (greeting && !hungry ? Math.sin((now - greetFrom) / 120) * 0.12 : 0);
          turn.position.y = Math.sin(now / 900) * 0.06;
          // Between greetings: sagging if it hasn't had its meal, otherwise at ease.
          if (wasTired && !live.current.tired) {
            greet(now, true, true);
            greetUntil = now + 2600;
          }
          wasTired = live.current.tired;
          if (!greeting && !live.current.tired && !hungry && now >= idleHeart) {
            if (idleHeart) addHeart(now);
            idleHeart = now + 450 + Math.random() * 450;
          }
          const want = greeting ? "happy" : live.current.tired ? "tired" : "rest";
          if (want !== mood) {
            mood = want;
            monster.setMood(want as "happy" | "tired" | "rest");
          }
          if (!greeting && greetUntil) greetUntil = 0;
          if (greeting && hearty && now >= nextHeart) {
            addHeart(now, true);
            nextHeart = now + 90 + Math.random() * 80;
          }
          for (let i = sparks.length - 1; i >= 0; i--) {
            const sp = sparks[i];
            const age = (now - sp.born) / sp.life;
            if (age >= 1) {
              scene.remove(sp.s);
              sp.s.material.dispose();
              sparks.splice(i, 1);
              continue;
            }
            sp.s.position.set(sp.x * (1 - age * 0.25), 0.12 + age * sp.rise * height * 0.6, sp.z);
            sp.s.scale.setScalar(sp.size * Math.min(1, age * 6) * (1 - age * 0.5));
            sp.s.material.opacity = age < 0.6 ? 1 : 1 - (age - 0.6) / 0.4;
          }
          // The shockwave ring over the stone.
          const ra = (now - ringFrom) / 700;
          ring.material.opacity = ra < 1 ? 0.85 * (1 - ra) : 0;
          ring.scale.setScalar(ra < 1 ? 0.5 + ra * 0.9 : 1);
          monster.update(now);
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        stop = () => {
          cancelAnimationFrame(frame);
          watch.disconnect();
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          renderer.dispose();
          // Give the WebGL context back at once: iPhones only allow a few, and leaked ones make the next scene blank.
          renderer.forceContextLoss?.();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        if (!dead) setTries((n) => n + 1);
      });
    return () => {
      dead = true;
      stop();
    };
    // onPet is a fresh function each render; the scene keeps the first one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, stage, legend, hungry, tries]);
  if (flat) {
    const kind = ["light", "dark", "chaos"][element] ?? "light";
    return (
      <div className="flex h-full w-full items-center justify-center" data-testid="pet-view">
        {stage > 0 ? (
          <img
            src={`/art/dragons/${kind}-${Math.min(4, stage)}.webp`}
            alt=""
            draggable={false}
            onClick={() => onPet?.()}
            className={tired ? "max-h-[70%] max-w-[80%] object-contain opacity-80 grayscale-[30%]" : "max-h-[70%] max-w-[80%] animate-[balloon-bob_3s_ease-in-out_infinite] object-contain"}
          />
        ) : (
          <span className="text-8xl">🥚</span>
        )}
      </div>
    );
  }
  return <div ref={box} className="h-full w-full" data-testid="pet-view" />;
}

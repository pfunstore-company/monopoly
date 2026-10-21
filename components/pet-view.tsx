"use client";

import { loadThree } from "@/components/eight-scene";
import { MODEL_CLOSE_UP, buildMonster } from "@/components/monster";
import { useEffect, useRef } from "react";

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
  useEffect(() => {
    let dead = false;
    let stop = () => undefined as void;
    loadThree()
      .then((T) => {
        const host = box.current;
        if (dead || !host) return;
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
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
        // 見到主人 (Sky 2026-10-21): on opening the page the dragon turns to you, bounces with its tail going and
        // little hearts float up; tap it for more. Hungry, it hops once and waits for food instead.
        const heartTex = (() => {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const x = c.getContext("2d")!;
          x.fillStyle = "#FF5C8A";
          x.beginPath();
          x.moveTo(32, 56);
          x.bezierCurveTo(4, 36, 4, 10, 20, 10);
          x.bezierCurveTo(28, 10, 32, 18, 32, 20);
          x.bezierCurveTo(32, 18, 36, 10, 44, 10);
          x.bezierCurveTo(60, 10, 60, 36, 32, 56);
          x.fill();
          x.fillStyle = "rgba(255,255,255,0.7)";
          x.beginPath();
          x.ellipse(21, 21, 5, 3.5, -0.6, 0, Math.PI * 2);
          x.fill();
          const tex = new T.CanvasTexture(c);
          tex.encoding = T.sRGBEncoding;
          return tex;
        })();
        const hearts: { s: any; born: number; x: number; z: number; drift: number }[] = [];
        const height = monster.height * (monster.model ? MODEL_CLOSE_UP : 1) * (stage === 0 ? 1.1 : 1.25);
        let greetUntil = 0, greetFrom = 0, nextHeart = 0, hearty = true;
        const greet = (now: number, long: boolean, bite = false) => {
          // Hearts when it's well, or when it's just been given a bite; a hungry dragon only perks up.
          hearty = bite || (!hungry && !live.current.tired);
          if (stage === 0) return;
          greetFrom = now;
          greetUntil = now + (long ? 2800 : 1800);
          monster.setMood("happy");
          nextHeart = now;
        };
        const addHeart = (now: number) => {
          const sp = new T.Sprite(new T.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
          const x = (Math.random() - 0.5) * 0.9, z = 0.3 + Math.random() * 0.3;
          sp.position.set(x, height * 0.85, z);
          sp.scale.setScalar(0.01);
          scene.add(sp);
          hearts.push({ s: sp, born: now, x, z, drift: (Math.random() - 0.5) * 0.4 });
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
        let mood = "";
        const tick = (now: number) => {
          if (!started) {
            started = true;
            greet(now + 250, true);
          }
          // A bite: a short happy chomp with hearts.
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
          const want = greeting ? "happy" : live.current.tired ? "tired" : "rest";
          if (want !== mood) {
            mood = want;
            monster.setMood(want as "happy" | "tired" | "rest");
          }
          if (!greeting && greetUntil) greetUntil = 0;
          if (greeting && hearty && now >= nextHeart) {
            addHeart(now);
            nextHeart = now + 260 + Math.random() * 200;
          }
          for (let i = hearts.length - 1; i >= 0; i--) {
            const hrt = hearts[i];
            const age = (now - hrt.born) / 1400;
            if (age >= 1) {
              scene.remove(hrt.s);
              hrt.s.material.dispose();
              hearts.splice(i, 1);
              continue;
            }
            hrt.s.position.set(hrt.x + Math.sin(age * 6) * 0.08 + hrt.drift * age, height * 0.85 + age * 1.1, hrt.z);
            hrt.s.scale.setScalar(0.22 * Math.min(1, age * 5));
            hrt.s.material.opacity = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
          }
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
          renderer.domElement.remove();
        };
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      stop();
    };
    // onPet is a fresh function each render; the scene keeps the first one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, stage, legend, hungry]);
  return <div ref={box} className="h-full w-full" data-testid="pet-view" />;
}

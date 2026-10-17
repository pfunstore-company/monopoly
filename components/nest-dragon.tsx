"use client";

import { createRoamer } from "@/components/dragon-roam";
import { loadThree } from "@/components/eight-scene";
import { buildMonster } from "@/components/monster";
import { useEffect, useRef } from "react";

/**
 * 龍仔 (Sky 2026-10-17): the player's own 3D dragon on their island's plaza — no nest, no background. It wanders about
 * the plaza and sometimes flies up to look at us, seen from the same 50° as the painted island (same sizes as the
 * game board: `span` is the box's width in board units, `plaza` the plaza's width in picture pixels).
 */
export function NestDragon({ element, stage, span, plaza }: { element: number; stage: number; span: number; plaza: number }) {
  const box = useRef<HTMLDivElement>(null);
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
        renderer.domElement.style.display = "block";
        renderer.domElement.style.pointerEvents = "none";
        host.appendChild(renderer.domElement);
        const scene = new T.Scene();
        const h = span / 2;
        const camera = new T.OrthographicCamera(-h, h, h, -h, 0.1, 50);
        const elev = (50 * Math.PI) / 180;
        camera.position.set(0, Math.sin(elev) * 10, Math.cos(elev) * 10);
        camera.lookAt(0, 0, 0);
        scene.add(new T.HemisphereLight(0xfff4e0, 0x403020, 1.0));
        const sun = new T.DirectionalLight(0xfff2dc, 1.1);
        sun.position.set(-2, 5, 4);
        scene.add(sun);
        const monster = buildMonster(T, element, stage);
        monster.setMood("rest");
        const holder = new T.Group();
        holder.add(monster.group);
        holder.scale.setScalar((stage === 0 ? 0.35 : 0.5) / Math.max(0.1, monster.height));
        scene.add(holder);
        const px = 1 / 75;
        const roam = createRoamer(plaza * 0.32 * px, (plaza * 0.16 * px) / Math.sin(elev), 7);
        let mood = "rest";
        const fit = () => {
          const w = host.clientWidth || 200, hh = host.clientHeight || 200;
          renderer.setSize(w, hh, false);
          renderer.domElement.style.width = `${w}px`;
          renderer.domElement.style.height = `${hh}px`;
        };
        const watch = new ResizeObserver(fit);
        watch.observe(host);
        fit();
        let frame = 0;
        const tick = (now: number) => {
          const p = roam(now);
          holder.position.set(p.x, p.y, p.z);
          monster.group.rotation.y = p.yaw;
          if (p.mood !== mood && stage > 0) {
            mood = p.mood;
            monster.setMood(p.mood);
          }
          monster.update(now);
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        stop = () => {
          cancelAnimationFrame(frame);
          watch.disconnect();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      stop();
    };
  }, [element, stage, span, plaza]);
  return <div ref={box} className="pointer-events-none h-full w-full" data-testid="nest-dragon" />;
}

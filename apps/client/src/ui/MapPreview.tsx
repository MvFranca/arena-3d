import type { ArenaConfig } from "@arena/sim";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ArenaView } from "../render/ArenaView";

export function MapPreview({ arena }: { arena: ArenaConfig }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(arena.theme.sky);
    scene.fog = new THREE.Fog(arena.theme.fog, 40, 90);
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a1030, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-12, 24, 16);
    scene.add(sun);
    const view = new ArenaView(arena);
    scene.add(view.group);
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
    const L = arena.halfLength;
    const W = arena.halfWidth;
    camera.position.set(-L * 0.15, Math.max(L, W) * 1.15, W * 1.35);
    camera.lookAt(0, 0, 0);
    let raf = 0;
    let last = performance.now();
    const resize = () => {
      const w = canvas.clientWidth || 320;
      const h = canvas.clientHeight || 180;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      view.update(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
    };
  }, [arena]);
  return <canvas ref={ref} className="h-full w-full rounded-2xl" />;
}

import { sanitizeDisc, type DiscStyle } from "@arena/sim";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { RenderPlayer } from "../game/types";
import { PlayerView } from "../render/PlayerView";

/** Prévia do botão no perfil. A câmera gira devagar para mostrar a espessura. */
export function DiscPreview({ skinId, disc }: { skinId?: string; disc: DiscStyle }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<PlayerView | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    scene.add(new THREE.HemisphereLight(0xd7ecff, 0x1a1030, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-4, 7, 3);
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 40),
      new THREE.MeshStandardMaterial({ color: "#16324a", roughness: 0.92, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.005;
    scene.add(floor);

    const style = sanitizeDisc(disc);
    const dummy: RenderPlayer = {
      id: "preview",
      slot: 0,
      team: "left",
      name: "",
      x: 0,
      z: 0,
      yaw: 0,
      flags: 0,
      cooldownTicks: 0,
      abilityId: null,
      skinId,
      disc: style,
      isLocal: true,
      connected: true,
    };
    const view = new PlayerView(dummy, style.color, "#ff4fd8");
    viewRef.current = view;
    scene.add(view.group);

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = now * 0.001;
      const yaw = 0.55 + Math.sin(t * 0.7) * 0.28;
      camera.position.set(Math.sin(yaw) * 2.75, 1.55, Math.cos(yaw) * 2.75);
      camera.lookAt(0, 0.12, 0);
      view.update(dummy, 1 / 60, false);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      view.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      viewRef.current = null;
    };
    // O motor nasce uma vez; o visual entra pelo efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.setStyle(skinId, disc);
  }, [skinId, disc]);

  return <canvas ref={canvasRef} className="h-56 w-full" aria-label="Prévia do botão" />;
}

import { useEffect, useRef } from "react";
import { useAppState } from "../app/store";
import { HubScene as HubSceneEngine } from "../render/HubScene";

/** Canvas full-bleed do menu. A UI HTML fica por cima, no HomeScreen. */
export function HubScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HubSceneEngine | null>(null);
  const name = useAppState((s) => s.name);
  const abilityId = useAppState((s) => s.loadout.abilityId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new HubSceneEngine(canvas, name, abilityId);
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Identidade entra pelo efeito abaixo; o motor so nasce uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setIdentity(name, abilityId);
  }, [name, abilityId]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-testid="hub-scene" />;
}

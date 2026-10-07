import type { ArenaConfig } from "@arena/sim";
import * as THREE from "three";

/** Geometria procedural da arena. A malha e so visual; os colliders vivem na simulacao. */
export class ArenaView {
  readonly group = new THREE.Group();
  private readonly pulseMats: THREE.MeshStandardMaterial[] = [];
  private time = 0;

  constructor(arena: ArenaConfig) {
    const t = arena.theme;
    const L = arena.halfLength;
    const W = arena.halfWidth;

    const floorMat = new THREE.MeshStandardMaterial({ color: t.floor, roughness: 0.95, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry((L + arena.goalDepth + 2) * 2, 0.4, (W + 2) * 2), floorMat);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Faixas alternadas no gramado
    const stripeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.floor).offsetHSL(0, 0, 0.035), roughness: 0.95 });
    const stripes = 10;
    const stripeW = (L * 2) / stripes;
    for (let i = 0; i < stripes; i += 2) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(stripeW, W * 2), stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(-L + stripeW * (i + 0.5), 0.005, 0);
      s.receiveShadow = true;
      this.group.add(s);
    }

    // Linhas
    const lineMat = new THREE.MeshBasicMaterial({ color: t.lines, transparent: true, opacity: 0.85 });
    const lw = 0.12;
    const addLine = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      this.group.add(m);
    };
    addLine(lw, W * 2, 0, 0); // meio
    addLine(L * 2, lw, 0, W - lw / 2);
    addLine(L * 2, lw, 0, -W + lw / 2);
    addLine(lw, W * 2, L - lw / 2, 0);
    addLine(lw, W * 2, -L + lw / 2, 0);
    const circle = new THREE.Mesh(new THREE.RingGeometry(W * 0.3 - lw, W * 0.3, 64), lineMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.012;
    this.group.add(circle);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), lineMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.012;
    this.group.add(dot);
    // Areas
    const areaD = arena.goalHalfWidth * 2 + 4;
    const areaW = L * 0.22;
    for (const side of [-1, 1]) {
      addLine(lw, areaD, side * (L - areaW), 0);
      addLine(areaW, lw, side * (L - areaW / 2), areaD / 2);
      addLine(areaW, lw, side * (L - areaW / 2), -areaD / 2);
    }

    // Paredes translucidas com borda luminosa
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: t.walls,
      transparent: true,
      opacity: 0.22,
      roughness: 0.2,
      metalness: 0.1,
      transmission: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const edgeMat = new THREE.MeshStandardMaterial({ color: t.lines, emissive: t.lines, emissiveIntensity: 1.4, roughness: 0.4 });
    this.pulseMats.push(edgeMat);
    const H = arena.wallHeight;
    const wall = (w: number, d: number, x: number, z: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      m.position.set(x, H / 2, z);
      m.rotation.y = rotY;
      this.group.add(m);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.08), edgeMat);
      edge.position.set(x, H, z);
      edge.rotation.y = rotY;
      this.group.add(edge);
      void d;
    };
    wall(L * 2, 0, 0, W, 0);
    wall(L * 2, 0, 0, -W, 0);
    const seg = W - arena.goalHalfWidth;
    for (const side of [-1, 1]) {
      wall(seg, 0, side * L, arena.goalHalfWidth + seg / 2, Math.PI / 2);
      wall(seg, 0, side * L, -(arena.goalHalfWidth + seg / 2), Math.PI / 2);
    }

    // Gols: traves e rede
    const postMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3, metalness: 0.2 });
    const netMat = new THREE.MeshBasicMaterial({ color: t.lines, wireframe: true, transparent: true, opacity: 0.35 });
    for (const side of [-1, 1]) {
      const gx = side * L;
      const gw = arena.goalHalfWidth;
      const gh = arena.goalHeight;
      const gd = arena.goalDepth;
      const postGeo = new THREE.CylinderGeometry(0.1, 0.1, gh, 12);
      for (const z of [-gw, gw]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(gx, gh / 2, z);
        post.castShadow = true;
        this.group.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, gw * 2 + 0.2, 12), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(gx, gh, 0);
      this.group.add(bar);
      const net = new THREE.Mesh(new THREE.BoxGeometry(gd, gh, gw * 2, 3, 3, 6), netMat);
      net.position.set(gx + side * (gd / 2), gh / 2, 0);
      this.group.add(net);
      // Luz de fundo do gol na cor do time que defende
      const glowColor = side < 0 ? t.left : t.right;
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(gw * 2, gd),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.25 }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.rotation.z = Math.PI / 2;
      glow.position.set(gx + side * (gd / 2), 0.015, 0);
      this.group.add(glow);
    }

    // Arquibancada estilizada: blocos ao redor
    const standMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.walls).offsetHSL(0, -0.15, -0.04), roughness: 1 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(L * 2 + 10, 1.2, 2.2), standMat);
        s.position.set(0, 0.6 + i * 1.2, side * (W + 3.5 + i * 2.2));
        s.receiveShadow = true;
        this.group.add(s);
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    const pulse = 1.2 + Math.sin(this.time * 1.6) * 0.3;
    for (const m of this.pulseMats) m.emissiveIntensity = pulse;
  }
}

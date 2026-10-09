import { playerWalkBounds, type ArenaConfig } from "@arena/sim";
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
    const walk = playerWalkBounds(arena);

    const floorMat = new THREE.MeshStandardMaterial({ color: t.floor, roughness: 0.92, metalness: 0.02 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry((walk.halfLength + 2) * 2, 0.4, (walk.halfWidth + 2) * 2), floorMat);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const stripeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.floor).offsetHSL(0, 0.02, 0.045), roughness: 0.94 });
    const altMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.floor).offsetHSL(0, -0.02, -0.03), roughness: 0.94 });
    const stripes = 12;
    const stripeW = (L * 2) / stripes;
    for (let i = 0; i < stripes; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(stripeW - 0.04, W * 2), i % 2 === 0 ? stripeMat : altMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(-L + stripeW * (i + 0.5), 0.004, 0);
      s.receiveShadow = true;
      this.group.add(s);
    }

    const lineMat = new THREE.MeshBasicMaterial({ color: t.lines, transparent: true, opacity: 0.9 });
    const lw = 0.1;
    const addLine = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.014, z);
      this.group.add(m);
    };
    addLine(lw, W * 2, 0, 0);
    addLine(L * 2, lw, 0, W - lw / 2);
    addLine(L * 2, lw, 0, -W + lw / 2);
    addLine(lw, W * 2, L - lw / 2, 0);
    addLine(lw, W * 2, -L + lw / 2, 0);
    const circle = new THREE.Mesh(new THREE.RingGeometry(W * 0.28 - lw, W * 0.28, 72), lineMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.014;
    this.group.add(circle);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), lineMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.015;
    this.group.add(dot);
    const areaD = arena.goalHalfWidth * 2 + 4;
    const areaW = L * 0.22;
    for (const side of [-1, 1]) {
      addLine(lw, areaD, side * (L - areaW), 0);
      addLine(areaW, lw, side * (L - areaW / 2), areaD / 2);
      addLine(areaW, lw, side * (L - areaW / 2), -areaD / 2);
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), lineMat);
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(side * (L - areaW * 0.55), 0.015, 0);
      this.group.add(spot);
    }

    const wallMat = new THREE.MeshPhysicalMaterial({
      color: t.walls,
      transparent: true,
      opacity: 0.2,
      roughness: 0.18,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const edgeMat = new THREE.MeshStandardMaterial({ color: t.lines, emissive: t.lines, emissiveIntensity: 1.5, roughness: 0.35 });
    this.pulseMats.push(edgeMat);
    const H = arena.wallHeight;
    const wall = (w: number, x: number, z: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      m.position.set(x, H / 2, z);
      m.rotation.y = rotY;
      this.group.add(m);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.07), edgeMat);
      edge.position.set(x, H, z);
      edge.rotation.y = rotY;
      this.group.add(edge);
    };
    wall(L * 2, 0, W, 0);
    wall(L * 2, 0, -W, 0);
    const seg = W - arena.goalHalfWidth;
    for (const side of [-1, 1]) {
      wall(seg, side * L, arena.goalHalfWidth + seg / 2, Math.PI / 2);
      wall(seg, side * L, -(arena.goalHalfWidth + seg / 2), Math.PI / 2);
    }

    // Limite externo walkable: jogador para aqui; bola nao chega.
    const outerMat = new THREE.MeshPhysicalMaterial({
      color: t.accent,
      transparent: true,
      opacity: 0.08,
      roughness: 0.35,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outerEdge = new THREE.MeshStandardMaterial({ color: t.accent, emissive: t.accent, emissiveIntensity: 0.35, roughness: 0.5 });
    this.pulseMats.push(outerEdge);
    const outerWall = (w: number, x: number, z: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H * 0.55), outerMat);
      m.position.set(x, (H * 0.55) / 2, z);
      m.rotation.y = rotY;
      this.group.add(m);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.05), outerEdge);
      edge.position.set(x, H * 0.55, z);
      edge.rotation.y = rotY;
      this.group.add(edge);
    };
    outerWall(walk.halfLength * 2, 0, walk.halfWidth, 0);
    outerWall(walk.halfLength * 2, 0, -walk.halfWidth, 0);
    outerWall(walk.halfWidth * 2, walk.halfLength, 0, Math.PI / 2);
    outerWall(walk.halfWidth * 2, -walk.halfLength, 0, Math.PI / 2);
    addLine(walk.halfLength * 2, lw, 0, walk.halfWidth - lw / 2);
    addLine(walk.halfLength * 2, lw, 0, -walk.halfWidth + lw / 2);
    addLine(lw, walk.halfWidth * 2, walk.halfLength - lw / 2, 0);
    addLine(lw, walk.halfWidth * 2, -walk.halfLength + lw / 2, 0);

    const cornerMat = new THREE.MeshStandardMaterial({ color: t.accent, emissive: t.accent, emissiveIntensity: 0.7, roughness: 0.4 });
    this.pulseMats.push(cornerMat);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, H + 0.2, 8), cornerMat);
        post.position.set(sx * L, (H + 0.2) / 2, sz * W);
        this.group.add(post);
      }
    }

    const postMat = new THREE.MeshStandardMaterial({ color: "#f6f8ff", roughness: 0.22, metalness: 0.35 });
    const netMat = new THREE.MeshBasicMaterial({ color: t.lines, wireframe: true, transparent: true, opacity: 0.32 });
    for (const side of [-1, 1]) {
      const gx = side * L;
      const gw = arena.goalHalfWidth;
      const gh = arena.goalHeight;
      const gd = arena.goalDepth;
      const postGeo = new THREE.CylinderGeometry(0.09, 0.09, gh, 12);
      for (const z of [-gw, gw]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(gx, gh / 2, z);
        post.castShadow = true;
        this.group.add(post);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), postMat);
        cap.position.set(gx, gh, z);
        this.group.add(cap);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, gw * 2 + 0.2, 12), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(gx, gh, 0);
      this.group.add(bar);
      const net = new THREE.Mesh(new THREE.BoxGeometry(gd, gh, gw * 2, 4, 4, 7), netMat);
      net.position.set(gx + side * (gd / 2), gh / 2, 0);
      this.group.add(net);
      const glowColor = side < 0 ? t.left : t.right;
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(gw * 2, gd),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.28 }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.rotation.z = Math.PI / 2;
      glow.position.set(gx + side * (gd / 2), 0.016, 0);
      this.group.add(glow);
    }

    const standMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.walls).offsetHSL(0, -0.12, -0.06), roughness: 1 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(L * 2 + 10, 1.15, 2.1), standMat);
        s.position.set(0, 0.55 + i * 1.15, side * (W + 3.4 + i * 2.1));
        s.receiveShadow = true;
        this.group.add(s);
      }
    }

    const boardMatL = new THREE.MeshStandardMaterial({ color: t.left, emissive: t.left, emissiveIntensity: 0.45, roughness: 0.4 });
    const boardMatR = new THREE.MeshStandardMaterial({ color: t.right, emissive: t.right, emissiveIntensity: 0.45, roughness: 0.4 });
    this.pulseMats.push(boardMatL, boardMatR);
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 0.18), side < 0 ? boardMatL : boardMatR);
      board.position.set(side * (L * 0.35), 3.4, W + 7.2);
      this.group.add(board);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const pulse = 1.15 + Math.sin(this.time * 1.5) * 0.28;
    for (const m of this.pulseMats) m.emissiveIntensity = pulse * (m.emissiveIntensity > 0.8 ? 1 : 0.55);
  }
}

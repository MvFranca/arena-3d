import type { ArenaConfig } from "@arena/sim";
import * as THREE from "three";

const SKY_RADIUS = 165;
const STAR_RADIUS = 150;

function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Céu, horizonte e detalhes de estádio. Só visual: a simulação não vê nada disto. */
export class EnvironmentView {
  readonly group = new THREE.Group();
  private readonly uTime = { value: 0 };
  private readonly cloudGroup: THREE.Group | null = null;
  private readonly lampMats: THREE.MeshStandardMaterial[] = [];
  private readonly crowdMesh: THREE.InstancedMesh | null = null;
  private readonly crowdBase: Float32Array | null = null;
  private readonly crowdPhase: Float32Array | null = null;
  private readonly dummy = new THREE.Object3D();

  constructor(arena: ArenaConfig) {
    const night = luminance(arena.theme.sky) < 0.28;
    this.group.add(this.makeSky(arena, night));
    this.group.add(this.makeGround(arena, night));
    this.group.add(this.makeCity(arena, night));
    if (night) {
      this.group.add(this.makeStars());
      this.group.add(this.makeMoon());
    } else {
      this.cloudGroup = this.makeClouds(arena);
      this.group.add(this.cloudGroup);
      this.group.add(this.makeSun());
    }
    this.group.add(this.makeFloodlights(arena));
    const crowd = this.makeCrowd(arena);
    this.crowdMesh = crowd.mesh;
    this.crowdBase = crowd.base;
    this.crowdPhase = crowd.phase;
    this.group.add(crowd.mesh);
    this.group.add(this.makeFlags(arena));
  }

  update(dt: number): void {
    this.uTime.value += dt;
    if (this.cloudGroup) this.cloudGroup.rotation.y += dt * 0.012;
    const pulse = 1.05 + Math.sin(this.uTime.value * 1.4) * 0.18;
    for (const m of this.lampMats) m.emissiveIntensity = pulse;
    this.bobCrowd();
  }

  dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) geos.add(mesh.geometry);
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => mats.add(m));
      else if (mesh.material) mats.add(mesh.material);
    });
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }

  private makeSky(arena: ArenaConfig, night: boolean): THREE.Mesh {
    const t = arena.theme;
    const zenith = new THREE.Color(t.sky);
    const horizon = new THREE.Color(t.fog).lerp(new THREE.Color(t.accent), night ? 0.28 : 0.42);
    const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 20);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: zenith },
        uHorizon: { value: horizon },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        varying vec3 vDir;
        void main() {
          float h = smoothstep(-0.05, 0.58, vDir.y);
          vec3 col = mix(uHorizon, uZenith, h);
          float glow = pow(1.0 - smoothstep(0.0, 0.42, abs(vDir.y)), 2.0);
          col += uHorizon * glow * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    sky.renderOrder = -20;
    return sky;
  }

  private makeStars(): THREE.Points {
    const count = 780;
    const positions = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = 0.08 + Math.random() * 0.92;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      positions[i * 3] = Math.cos(theta) * ring * STAR_RADIUS;
      positions[i * 3 + 1] = y * STAR_RADIUS;
      positions[i * 3 + 2] = Math.sin(theta) * ring * STAR_RADIUS;
      phase[i] = Math.random() * Math.PI * 2;
      size[i] = Math.random() < 0.08 ? 3.4 + Math.random() * 1.6 : 1.1 + Math.random() * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime },
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        varying float vTw;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (280.0 / max(8.0, -mv.z));
          gl_Position = projectionMatrix * mv;
          vTw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.5 + aPhase));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d) * vTw;
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * vTw, a);
        }
      `,
    });
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    stars.renderOrder = -10;
    return stars;
  }

  private makeMoon(): THREE.Mesh {
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 20, 16),
      new THREE.MeshBasicMaterial({ color: "#fff4dd", fog: false }),
    );
    moon.position.set(36, 62, -48);
    moon.renderOrder = -9;
    return moon;
  }

  private makeSun(): THREE.Group {
    const g = new THREE.Group();
    g.position.set(-28, 34, -78);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(11, 20, 16),
      new THREE.MeshBasicMaterial({
        color: "#ffb15a",
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const disc = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 20, 16),
      new THREE.MeshBasicMaterial({ color: "#fff1c4", fog: false }),
    );
    g.add(glow, disc);
    return g;
  }

  private makeClouds(arena: ArenaConfig): THREE.Group {
    const g = new THREE.Group();
    const tint = new THREE.Color(arena.theme.sky).lerp(new THREE.Color("#fff8ee"), 0.72);
    const mat = new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const puff = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      const ang = (i / 7) * Math.PI * 2 + 0.4;
      const radius = 78 + (i % 3) * 8;
      cloud.position.set(Math.cos(ang) * radius, 26 + (i % 4) * 6, Math.sin(ang) * radius * 0.85);
      const blobs = 3 + (i % 3);
      for (let b = 0; b < blobs; b++) {
        const m = new THREE.Mesh(puff, mat);
        m.position.set((b - blobs / 2) * 3.1, Math.sin(b) * 0.6, 0);
        m.scale.set(3.4 + (b % 2), 1.5 + (b % 3) * 0.35, 2.2);
        cloud.add(m);
      }
      cloud.lookAt(0, cloud.position.y, 0);
      g.add(cloud);
    }
    return g;
  }

  private makeGround(arena: ArenaConfig, night: boolean): THREE.Mesh {
    const color = new THREE.Color(arena.theme.floor).multiplyScalar(night ? 0.38 : 0.62);
    const geo = new THREE.CircleGeometry(SKY_RADIUS * 0.92, 48);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    return ground;
  }

  private makeCity(arena: ArenaConfig, night: boolean): THREE.Group {
    const g = new THREE.Group();
    const L = arena.halfLength;
    const W = arena.halfWidth;
    const buildings: { x: number; z: number; w: number; h: number; d: number; color: THREE.Color }[] = [];
    const count = 52;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      const spread = 1 + Math.random() * 0.45;
      const x = Math.cos(ang) * (L + 26) * spread;
      const z = Math.sin(ang) * (W + 20) * spread;
      if (Math.abs(x) < L + 14 && Math.abs(z) < W + 14) continue;
      const w = 2.4 + Math.random() * 4.2;
      const d = 2.2 + Math.random() * 3.6;
      const h = 4 + Math.random() * (night ? 14 : 10);
      const color = new THREE.Color(arena.theme.walls).offsetHSL(
        (Math.random() - 0.5) * 0.04,
        night ? -0.08 : 0.04,
        (Math.random() - 0.5) * 0.1 + (night ? -0.22 : 0.06),
      );
      buildings.push({ x, z, w, h, d, color });
    }

    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.94, metalness: 0.04 }),
      buildings.length,
    );
    buildings.forEach((b, i) => {
      this.dummy.position.set(b.x, b.h / 2, b.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(b.w, b.h, b.d);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.setColorAt(i, b.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    g.add(mesh);

    if (night) {
      const windows: { x: number; y: number; z: number; color: THREE.Color }[] = [];
      const warm = new THREE.Color("#ffe1a3");
      const accent = new THREE.Color(arena.theme.accent);
      for (const b of buildings) {
        const faceX = Math.abs(b.x) >= Math.abs(b.z);
        const n = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) {
          const y = 1.4 + Math.random() * Math.max(1, b.h - 2.4);
          const along = (Math.random() - 0.5) * (faceX ? b.d : b.w) * 0.62;
          const x = b.x + (faceX ? -Math.sign(b.x || 1) * (b.w / 2 + 0.05) : along);
          const z = b.z + (faceX ? along : -Math.sign(b.z || 1) * (b.d / 2 + 0.05));
          windows.push({ x, y, z, color: Math.random() < 0.72 ? warm : accent });
        }
      }
      if (windows.length > 0) {
        const win = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.42, 0.55, 0.42),
          new THREE.MeshBasicMaterial({ color: "#ffffff" }),
          windows.length,
        );
        windows.forEach((w, i) => {
          this.dummy.position.set(w.x, w.y, w.z);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          win.setMatrixAt(i, this.dummy.matrix);
          win.setColorAt(i, w.color);
        });
        win.instanceMatrix.needsUpdate = true;
        if (win.instanceColor) win.instanceColor.needsUpdate = true;
        g.add(win);
      }
    }
    return g;
  }

  private makeFloodlights(arena: ArenaConfig): THREE.Group {
    const g = new THREE.Group();
    const L = arena.halfLength;
    const W = arena.halfWidth;
    const poleMat = new THREE.MeshStandardMaterial({ color: "#1c2433", roughness: 0.6, metalness: 0.35 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: arena.theme.accent,
      emissive: arena.theme.accent,
      emissiveIntensity: 1.1,
      roughness: 0.35,
    });
    this.lampMats.push(lampMat);
    const coneMat = new THREE.MeshBasicMaterial({
      color: arena.theme.accent,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7.4, 8);
    const headGeo = new THREE.BoxGeometry(1.15, 0.22, 0.42);
    const coneGeo = new THREE.ConeGeometry(2.4, 6.2, 12, 1, true);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rig = new THREE.Group();
        rig.position.set(sx * (L + 1.4), 0, sz * (W + 1.15));
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 3.7;
        const head = new THREE.Mesh(headGeo, lampMat);
        head.position.y = 7.35;
        head.rotation.z = -sx * 0.45;
        head.rotation.x = sz * 0.35;
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(-sx * 0.7, 4.5, -sz * 0.45);
        cone.rotation.x = Math.PI + sz * 0.28;
        cone.rotation.z = -sx * 0.32;
        cone.renderOrder = 1;
        rig.add(pole, head, cone);
        g.add(rig);
      }
    }
    return g;
  }

  private makeCrowd(arena: ArenaConfig): { mesh: THREE.InstancedMesh; base: Float32Array; phase: Float32Array } {
    const L = arena.halfLength;
    const W = arena.halfWidth;
    const span = L * 2 + 8;
    const endSpan = W * 2 + 2.6;
    const step = 1.05;
    const perRow = Math.max(8, Math.floor(span / step));
    const perRowEnd = Math.max(6, Math.floor(endSpan / step));
    const rows = 2;
    const tiers = 3;
    const count = (perRow + perRowEnd) * rows * tiers * 2;
    const colors = [arena.theme.left, arena.theme.right, arena.theme.accent].map((h) => new THREE.Color(h));
    const geo = new THREE.CapsuleGeometry(0.12, 0.2, 2, 6);
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, metalness: 0.02 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const base = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    let n = 0;
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < tiers; tier++) {
        const top = 1.125 + tier * 1.15;
        const z0 = side * (arena.halfWidth + 3.4 + tier * 2.1);
        for (let row = 0; row < rows; row++) {
          const z = z0 - side * (0.35 - row * 0.55);
          for (let i = 0; i < perRow; i++) {
            const x = -span / 2 + step * (i + 0.5) + (row % 2) * 0.28;
            const y = top + 0.22;
            base[n * 3] = x;
            base[n * 3 + 1] = y;
            base[n * 3 + 2] = z;
            phase[n] = Math.random() * Math.PI * 2;
            this.dummy.position.set(x, y, z);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            mesh.setMatrixAt(n, this.dummy.matrix);
            mesh.setColorAt(n, colors[(i + tier + row) % colors.length]!);
            n++;
          }
        }
      }
    }
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < tiers; tier++) {
        const top = 1.125 + tier * 1.15;
        const x0 = side * (L + arena.goalDepth + 3.4 + tier * 2.1);
        for (let row = 0; row < rows; row++) {
          const x = x0 - side * (0.35 - row * 0.55);
          for (let i = 0; i < perRowEnd; i++) {
            const z = -endSpan / 2 + step * (i + 0.5) + (row % 2) * 0.28;
            const y = top + 0.22;
            base[n * 3] = x;
            base[n * 3 + 1] = y;
            base[n * 3 + 2] = z;
            phase[n] = Math.random() * Math.PI * 2;
            this.dummy.position.set(x, y, z);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            mesh.setMatrixAt(n, this.dummy.matrix);
            mesh.setColorAt(n, colors[(i + tier + row) % colors.length]!);
            n++;
          }
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = n;
    return { mesh, base, phase };
  }

  private bobCrowd(): void {
    if (!this.crowdMesh || !this.crowdBase || !this.crowdPhase) return;
    const t = this.uTime.value;
    const mesh = this.crowdMesh;
    for (let i = 0; i < mesh.count; i++) {
      const x = this.crowdBase[i * 3] ?? 0;
      const y = this.crowdBase[i * 3 + 1] ?? 0;
      const z = this.crowdBase[i * 3 + 2] ?? 0;
      this.dummy.position.set(x, y + Math.sin(t * 2.3 + (this.crowdPhase[i] ?? 0)) * 0.045, z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private makeFlags(arena: ArenaConfig): THREE.Group {
    const g = new THREE.Group();
    const L = arena.halfLength;
    const W = arena.halfWidth;
    const poleMat = new THREE.MeshStandardMaterial({ color: "#d7e2ef", roughness: 0.45, metalness: 0.2 });
    const poleGeo = new THREE.CylinderGeometry(0.035, 0.045, 2.5, 6);
    const flagGeo = new THREE.PlaneGeometry(1.15, 0.58, 8, 2);
    flagGeo.translate(0.58, 0, 0);
    const colors = [arena.theme.left, arena.theme.right, arena.theme.accent];
    const flagMats = colors.map(
      (hex) =>
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.uTime, uColor: { value: new THREE.Color(hex) } },
          side: THREE.DoubleSide,
          vertexShader: /* glsl */ `
            uniform float uTime;
            varying float vX;
            void main() {
              vec3 p = position;
              float flap = sin(uTime * 3.1 + modelMatrix[3].x * 0.45 + position.x * 5.5);
              p.z += flap * 0.2 * position.x;
              p.y += cos(uTime * 2.4 + modelMatrix[3].z) * 0.03 * position.x;
              vX = position.x;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `,
          fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            varying float vX;
            void main() {
              float edge = smoothstep(0.95, 1.05, vX);
              vec3 col = mix(uColor, vec3(1.0), edge * 0.75);
              gl_FragColor = vec4(col, 1.0);
            }
          `,
        }),
    );
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = -L * 0.72 + i * ((L * 1.44) / 4);
        const z = side * (W + 1.55);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 1.25, z);
        const flag = new THREE.Mesh(flagGeo, flagMats[i % flagMats.length]!);
        flag.position.set(x, 2.28, z);
        flag.rotation.y = side > 0 ? 0 : Math.PI;
        g.add(pole, flag);
      }
    }
    return g;
  }
}

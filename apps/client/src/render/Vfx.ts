import * as THREE from "three";

const MAX = 512;

/** Particulas em pool com InstancedMesh: nenhuma alocacao durante a partida. */
export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly colors: THREE.Color[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();
  private cursor = 0;

  constructor() {
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.colors.push(new THREE.Color(1, 1, 1));
      this.mesh.setColorAt(i, this.colors[i]!);
      this.dummy.position.set(0, -100, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  burst(x: number, y: number, z: number, count: number, color: THREE.ColorRepresentation, speed: number, life = 0.6, size = 1, upBias = 0.5): void {
    this.tmpColor.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.5) * Math.PI * 0.8 + upBias;
      const s = speed * (0.5 + Math.random());
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * Math.cos(e) * s;
      this.vel[i * 3 + 1] = Math.sin(e) * s;
      this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.maxLife[i] = this.life[i]!;
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.colors[i]!.copy(this.tmpColor).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      this.mesh.setColorAt(i, this.colors[i]!);
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) continue;
      any = true;
      this.life[i]! -= dt;
      this.vel[i * 3 + 1]! -= 18 * dt;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      if (this.pos[i * 3 + 1]! < 0.05) {
        this.pos[i * 3 + 1] = 0.05;
        this.vel[i * 3 + 1] = -this.vel[i * 3 + 1]! * 0.4;
        this.vel[i * 3] = this.vel[i * 3]! * 0.7;
        this.vel[i * 3 + 2] = this.vel[i * 3 + 2]! * 0.7;
      }
      const t = this.life[i]! / this.maxLife[i]!;
      if (this.life[i]! <= 0) {
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0.001);
      } else {
        this.dummy.position.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
        this.dummy.rotation.set(t * 6, t * 4, 0);
        this.dummy.scale.setScalar(this.size[i]! * (0.3 + t * 0.7));
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Anel de impacto no chao que expande e some. Pool fixo. */
export class ImpactRings {
  readonly group = new THREE.Group();
  private readonly rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number }[] = [];
  private cursor = 0;

  constructor(count = 12) {
    const geo = new THREE.RingGeometry(0.4, 0.6, 32);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, t: 1 });
    }
  }

  spawn(x: number, z: number, color: THREE.ColorRepresentation, scale = 1): void {
    const r = this.rings[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.rings.length;
    r.mesh.position.set(x, 0.02, z);
    r.mesh.visible = true;
    r.mat.color.set(color);
    r.mesh.scale.setScalar(scale);
    r.t = 0;
    (r.mesh as any).__scale = scale;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt * 2.2;
      if (r.t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const base = (r.mesh as any).__scale ?? 1;
      r.mesh.scale.setScalar(base * (1 + r.t * 3));
      r.mat.opacity = (1 - r.t) * 0.8;
    }
  }
}

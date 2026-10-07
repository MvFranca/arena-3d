/** Escritor binario com buffer reutilizavel. Little-endian. */
export class BufferWriter {
  private view: DataView;
  private bytes: Uint8Array;
  private pos = 0;

  constructor(capacity = 1024) {
    this.bytes = new Uint8Array(capacity);
    this.view = new DataView(this.bytes.buffer);
  }

  reset(): this {
    this.pos = 0;
    return this;
  }

  private ensure(n: number): void {
    if (this.pos + n <= this.bytes.length) return;
    let cap = this.bytes.length * 2;
    while (cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.bytes);
    this.bytes = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): this { this.ensure(1); this.view.setUint8(this.pos, v); this.pos += 1; return this; }
  i8(v: number): this { this.ensure(1); this.view.setInt8(this.pos, v); this.pos += 1; return this; }
  u16(v: number): this { this.ensure(2); this.view.setUint16(this.pos, v, true); this.pos += 2; return this; }
  i16(v: number): this { this.ensure(2); this.view.setInt16(this.pos, v, true); this.pos += 2; return this; }
  u32(v: number): this { this.ensure(4); this.view.setUint32(this.pos, v >>> 0, true); this.pos += 4; return this; }
  i32(v: number): this { this.ensure(4); this.view.setInt32(this.pos, Math.round(v) | 0, true); this.pos += 4; return this; }
  f32(v: number): this { this.ensure(4); this.view.setFloat32(this.pos, v, true); this.pos += 4; return this; }
  f64(v: number): this { this.ensure(8); this.view.setFloat64(this.pos, v, true); this.pos += 8; return this; }

  /** Copia dos bytes escritos. Use quando o frame vai para a rede. */
  toUint8Array(): Uint8Array {
    return this.bytes.slice(0, this.pos);
  }

  get length(): number {
    return this.pos;
  }
}

export class BufferReader {
  private readonly view: DataView;
  private pos = 0;

  constructor(data: ArrayBuffer | Uint8Array) {
    this.view = data instanceof Uint8Array ? new DataView(data.buffer, data.byteOffset, data.byteLength) : new DataView(data);
  }

  get remaining(): number {
    return this.view.byteLength - this.pos;
  }

  u8(): number { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  i8(): number { const v = this.view.getInt8(this.pos); this.pos += 1; return v; }
  u16(): number { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i16(): number { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32(): number { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  f32(): number { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  f64(): number { const v = this.view.getFloat64(this.pos, true); this.pos += 8; return v; }
}

export function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

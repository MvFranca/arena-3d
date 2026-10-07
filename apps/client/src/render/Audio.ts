/**
 * Audio sintetizado com WebAudio. Sem arquivos: o jogo soa igual em qualquer deploy.
 * O contexto so e criado apos a primeira interacao do usuario.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  enabled = true;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = v;
  }

  private ready(): { ctx: AudioContext; master: GainNode; noiseBuffer: AudioBuffer } | null {
    if (!this.enabled || !this.ctx || !this.master || !this.noiseBuffer || this.ctx.state !== "running") return null;
    return { ctx: this.ctx, master: this.master, noiseBuffer: this.noiseBuffer };
  }

  kick(power: number): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.4 + power / 40), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const src = a.ctx.createBufferSource();
    src.buffer = a.noiseBuffer;
    const f = a.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    src.connect(f).connect(g).connect(a.master);
    src.start(t);
    src.stop(t + 0.2);
    const o = a.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const og = a.ctx.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(og).connect(a.master);
    o.start(t);
    o.stop(t + 0.15);
  }

  bounce(speed: number): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(320 + speed * 6, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, speed / 40), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(a.master);
    o.start(t);
    o.stop(t + 0.11);
  }

  contact(): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = a.noiseBuffer;
    const f = a.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 500;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f).connect(g).connect(a.master);
    src.start(t);
    src.stop(t + 0.1);
  }

  goal(): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const o = a.ctx.createOscillator();
      o.type = "square";
      o.frequency.value = freq;
      const g = a.ctx.createGain();
      const start = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      o.connect(g).connect(a.master);
      o.start(start);
      o.stop(start + 0.4);
    });
    this.crowd(1.2);
  }

  whistle(long = false): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const dur = long ? 0.9 : 0.35;
    const o = a.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(2200, t);
    const lfo = a.ctx.createOscillator();
    lfo.frequency.value = 28;
    const lg = a.ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    const f = a.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2300;
    f.Q.value = 6;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    g.gain.setValueAtTime(0.3, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(a.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur);
    lfo.stop(t + dur);
  }

  ability(): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(a.master);
    o.start(t);
    o.stop(t + 0.26);
  }

  deny(): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(220, t);
    o.frequency.setValueAtTime(180, t + 0.06);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(a.master);
    o.start(t);
    o.stop(t + 0.15);
  }

  private crowd(dur: number): void {
    const a = this.ready();
    if (!a) return;
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource();
    src.buffer = a.noiseBuffer;
    src.loop = true;
    const f = a.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(a.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}

export const gameAudio = new GameAudio();

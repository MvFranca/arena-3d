/** Histograma simples em memoria para duracao de tick e tamanho de snapshot. */
export class Histogram {
  private readonly samples: number[] = [];
  private readonly cap: number;
  total = 0;
  count = 0;
  max = 0;

  constructor(cap = 2000) {
    this.cap = cap;
  }

  record(v: number): void {
    this.samples.push(v);
    if (this.samples.length > this.cap) this.samples.shift();
    this.total += v;
    this.count++;
    if (v > this.max) this.max = v;
  }

  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx]!;
  }

  summary() {
    return {
      count: this.count,
      mean: this.count ? this.total / this.count : 0,
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
      max: this.max,
    };
  }
}

export const metrics = {
  tickMs: new Histogram(),
  snapshotBytes: new Histogram(),
  slowTicks: 0,
  inputsDropped: 0,
  inputsLate: 0,
  connections: 0,
  startedAt: Date.now(),
};

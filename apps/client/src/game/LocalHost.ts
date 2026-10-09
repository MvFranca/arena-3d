import {
  FIXED_DT,
  MatchSimulation,
  createEmptyMatchState,
  getRuleset,
  type Loadout,
  type MatchEvent,
  type MatchState,
  type Team,
} from "@arena/sim";
import { InputCollector, type KeyBinding } from "./InputCollector";
import { copyMatchState, interpolateStates } from "./stateUtils";
import type { RenderState, SimulationHost } from "./types";

export interface LocalPlayerSpec {
  id: string;
  name: string;
  team: Team;
  loadout: Loadout;
  binding: KeyBinding;
}

const MAX_FRAME_MS = 250;
const DT_MS = FIXED_DT * 1000;

/** Partida local: a simulacao roda no proprio processo da aba. */
export class LocalHost implements SimulationHost {
  readonly localPlayerIds: string[];
  readonly pingMs = 0;
  readonly sim: MatchSimulation;
  private readonly inputs: { id: string; collector: InputCollector }[];
  private readonly prev: MatchState = createEmptyMatchState();
  private readonly curr: MatchState = createEmptyMatchState();
  private accumulator = 0;
  private readonly events: MatchEvent[] = [];

  constructor(rulesetId: string, players: LocalPlayerSpec[]) {
    this.sim = new MatchSimulation({
      ruleset: getRuleset(rulesetId),
      autoStart: true,
      players: players.map((p, i) => ({ id: p.id, slot: i, team: p.team, name: p.name, loadout: p.loadout })),
    });
    this.localPlayerIds = players.map((p) => p.id);
    this.inputs = players.map((p, i) => ({ id: p.id, collector: new InputCollector(p.binding, i === 0) }));
    this.sim.readState(this.curr);
    copyMatchState(this.curr, this.prev);
  }

  update(deltaMs: number): void {
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);
    let steps = 0;
    while (this.accumulator >= DT_MS && steps < 8) {
      for (const { id, collector } of this.inputs) this.sim.setInput(id, collector.sample());
      copyMatchState(this.curr, this.prev);
      const ev = this.sim.step();
      for (const e of ev) this.events.push(e);
      this.sim.readState(this.curr);
      this.accumulator -= DT_MS;
      steps++;
    }
    if (steps >= 8) this.accumulator = 0; // evita espiral da morte em abas em segundo plano
  }

  render(out: RenderState): void {
    const alpha = Math.min(1, this.accumulator / DT_MS);
    interpolateStates(out, this.prev, this.curr, alpha, this.localPlayerIds);
  }

  consumeKickPresses(): string[] {
    const ids: string[] = [];
    for (const { id, collector } of this.inputs) {
      if (collector.consumeKickPulse()) ids.push(id);
    }
    return ids;
  }

  drainEvents(): MatchEvent[] {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  dispose(): void {
    for (const i of this.inputs) i.collector.dispose();
    this.sim.dispose();
  }
}

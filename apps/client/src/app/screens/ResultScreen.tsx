import { formatClock, getArena } from "@arena/sim";
import { navigate, useAppState } from "../store";
import { Card, Logo, Shell } from "../../ui/common";

export function ResultScreen() {
  const result = useAppState((s) => s.result);
  const room = useAppState((s) => s.room);
  const theme = (room?.arena ?? getArena(room?.ruleset.arenaId ?? "classic")).theme;
  if (!result) {
    navigate("home");
    return null;
  }
  const winnerColor = result.winner === "left" ? theme.left : result.winner === "right" ? theme.right : "#ffffff";
  const headline = result.winner === "draw" ? "Empate" : result.myTeam ? (result.myTeam === result.winner ? "Vitória" : "Derrota") : result.winner === "left" ? "Vermelho venceu" : "Azul venceu";
  const matchClock = (clockTicks: number) => formatClock(result.durationTicks - clockTicks);

  return (
    <Shell wide>
      <div className="mb-6 flex items-center justify-between">
        <Logo small />
        <span className="text-sm text-white/50">{result.mode === "local" ? "partida local" : "partida online"}</span>
      </div>
      <Card>
        <div className="text-center">
          <div className="font-display text-5xl font-bold" style={{ color: winnerColor, textShadow: `0 0 30px ${winnerColor}` }}>
            {headline}
          </div>
          <div className="font-display mt-4 text-6xl font-bold tabular-nums">
            <span style={{ color: theme.left }}>{result.scoreLeft}</span>
            <span className="mx-3 text-white/30">:</span>
            <span style={{ color: theme.right }}>{result.scoreRight}</span>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Jogadores</h3>
            <ul className="space-y-2">
              {result.players.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.team === "left" ? theme.left : theme.right }} />
                    {p.name}
                  </span>
                  <span className="text-sm text-white/60">
                    {p.goals} gol{p.goals === 1 ? "" : "s"}
                    {p.ownGoals > 0 && <span className="ml-2 text-red-300/70">{p.ownGoals} contra</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Gols</h3>
            {result.goals.length === 0 ? (
              <p className="text-sm text-white/40">Nenhum gol. Defesa impecável dos dois lados.</p>
            ) : (
              <ul className="space-y-2">
                {result.goals.map((g, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.team === "left" ? theme.left : theme.right }} />
                      {g.scorerName}
                      {g.ownGoal && <span className="text-red-300/70">(contra)</span>}
                    </span>
                    <span className="tabular-nums text-white/50">{matchClock(g.clockTicks)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {result.mode === "local" ? (
            <button className="btn btn-primary" onClick={() => navigate("match")}>
              Jogar de novo
            </button>
          ) : (
            room && (
              <button className="btn btn-primary" onClick={() => navigate("lobby")}>
                Voltar à sala
              </button>
            )
          )}
          <button className="btn btn-secondary" onClick={() => navigate("home")}>
            Menu
          </button>
        </div>
      </Card>
    </Shell>
  );
}

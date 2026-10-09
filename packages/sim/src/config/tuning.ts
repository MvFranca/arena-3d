/**
 * Todas as constantes de sensacao do jogo. Mudar aqui muda cliente e servidor
 * ao mesmo tempo, porque os dois importam o mesmo pacote.
 */
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY_TICKS = 1; // 60 Hz

export const GRAVITY = -22; // mais forte que a real para a bola cair rapido (arcade)

export const PLAYER = {
  radius: 0.75,
  halfHeight: 0.45, // capsula: altura total = 2*(halfHeight+radius)
  /** Folga acima do chao. O jogador e travado em Y, entao nunca encosta no piso. */
  hover: 0.03,
  baseMaxSpeed: 9.4,
  baseAcceleration: 42,
  baseMass: 80,
  linearDamping: 0.9,
  /** Slack acima do maxSpeed permitido antes de cortar (empurroes e dash). */
  speedCapSlack: 1.08,
  friction: 0.2,
  restitution: 0.25,
  /** Velocidade minima para atualizar o yaw visual. */
  yawMinSpeed: 0.5,
  /** Corredor externo ao redor do retangulo de jogo (laterais e atras dos gols). */
  corridorWidth: 2.8,
};

/** Limite walkable do jogador: laterais + atras das redes. A bola nao usa isto. */
export function playerWalkBounds(arena: { halfLength: number; halfWidth: number; goalDepth: number }): {
  halfLength: number;
  halfWidth: number;
} {
  return {
    halfLength: arena.halfLength + arena.goalDepth + PLAYER.corridorWidth,
    halfWidth: arena.halfWidth + PLAYER.corridorWidth,
  };
}

/** Altura do centro do corpo do jogador. */
export const PLAYER_CENTER_Y = PLAYER.halfHeight + PLAYER.radius + PLAYER.hover;

export const BALL = {
  radius: 0.42,
  mass: 1.4,
  linearDamping: 0.55,
  angularDamping: 1.6,
  friction: 0.4,
  restitution: 0.75,
  maxSpeed: 34,
  /** Velocidade minima de impacto para gerar evento de quique. */
  bounceEventSpeed: 6,
};

export const KICK = {
  /** Distancia horizontal extra alem de raio+raio para contar o toque de chute. */
  reach: 0.35,
  /** Quantos ticks o pedido de chute fica valido esperando a bola entrar no alcance. */
  bufferTicks: 8,
  /** Ticks apos um chute em que o mesmo jogador nao pode chutar de novo. */
  refractoryTicks: 10,
  baseImpulse: 17,
  /** Quanto da velocidade horizontal do jogador soma ao chute. */
  speedShare: 0.55,
  /** Componente vertical do chute em funcao do impulso horizontal. */
  lift: 0.14,
  /** Distancia extra para o toque suave (controle) alem do contato. */
  touchReach: 0.25,
};

export const ATTR = {
  speedMin: 0.85,
  speedRange: 0.3,
  accelMin: 0.85,
  accelRange: 0.3,
  massMin: 0.9,
  massRange: 0.4,
  powerMin: 0.8,
  powerRange: 0.4,
  controlMax: 0.35,
  precisionMin: 0.15,
  precisionRange: 0.35,
  recoveryMin: 0.04,
  recoveryRange: 0.12,
  cooldownMax: 1.2,
  cooldownRange: 0.4,
  /** Soma maxima dos oito atributos. 50 em cada e o loadout neutro. */
  budget: 400,
};

export const ABILITIES = {
  dash: {
    cooldownSeconds: 8,
    durationTicks: 14,
    speed: 22,
    /** Multiplicador do teto de velocidade durante o dash. */
    speedCapMultiplier: 2.1,
  },
  power_shot: {
    cooldownSeconds: 10,
    windowTicks: 120,
    multiplier: 1.75,
  },
  shield: {
    cooldownSeconds: 12,
    durationTicks: 90,
    massMultiplier: 6,
  },
};

export const CLOCK = {
  defaultDurationSeconds: 180,
  countdownSeconds: 3,
  goalPauseSeconds: 2,
  kickoffSeconds: 1.5,
};

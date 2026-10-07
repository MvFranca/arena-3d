/** Primeiro byte de todo frame binario. Frames de texto sao JSON de lobby. */
export const OP = {
  INPUT: 1,
  SNAPSHOT: 2,
  PING: 3,
  PONG: 4,
} as const;

export type Opcode = (typeof OP)[keyof typeof OP];

export const PROTOCOL_VERSION = 1;

/** Quantos inputs redundantes viajam em cada pacote de input. */
export const INPUT_REDUNDANCY = 3;

export const BTN_KICK = 1 << 0;
export const BTN_ABILITY = 1 << 1;

/** Posicoes em centesimos de unidade, velocidades idem. */
export const POS_SCALE = 100;
export const VEL_SCALE = 100;
export const YAW_SCALE = 1000;

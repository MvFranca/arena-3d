/**
 * Estado de toque compartilhado entre a UI e o InputCollector.
 * Escrito pelos controles virtuais, lido em sample() no mesmo frame.
 */
export const touchInput = {
  dirX: 0,
  dirZ: 0,
  kick: false,
  ability: false,
};

export function resetTouchInput(): void {
  touchInput.dirX = 0;
  touchInput.dirZ = 0;
  touchInput.kick = false;
  touchInput.ability = false;
}

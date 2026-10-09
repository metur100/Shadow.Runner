/**
 * Gameplay screen layout (design units): the reality lane fills the top half and the shadow lane the
 * bottom half, split by a glowing seam with the switch button on it. The HUD floats over the top of
 * the reality lane; jump / slide buttons float over the bottom corner of the shadow lane.
 */
export interface GameplayLayout {
  hudBottom: number;
  laneH: number;
  realTop: number;
  dividerY: number;
  shadowTop: number;
  /** Bottom of the play area (the screen bottom). */
  controlsTop: number;
  /** Centre of the switch button. */
  controlsY: number;
  switchRadius: number;
  /** Bottom edge for the floating jump / slide buttons. */
  buttonsBottom: number;
}

export const HUD_HEIGHT = 112;
export const DIVIDER = 10;

export function gameplayLayout(H: number, safeTop: number, safeBottom: number): GameplayLayout {
  const laneH = Math.floor((H - DIVIDER) / 2);
  const realTop = 0;
  const dividerY = laneH + DIVIDER / 2;
  const shadowTop = laneH + DIVIDER;
  return {
    hudBottom: Math.round(safeTop + HUD_HEIGHT),
    laneH,
    realTop,
    dividerY,
    shadowTop,
    controlsTop: H,
    controlsY: dividerY,
    switchRadius: 62,
    buttonsBottom: H - safeBottom - 24,
  };
}

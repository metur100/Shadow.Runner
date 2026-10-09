/** Gameplay screen layout (design units): HUD on top, reality lane, divider, shadow lane, controls. */
export interface GameplayLayout {
  hudBottom: number;
  laneH: number;
  realTop: number;
  dividerY: number;
  shadowTop: number;
  controlsTop: number;
  controlsY: number;
  switchRadius: number;
}

export const HUD_HEIGHT = 118;
export const CONTROLS_HEIGHT = 236;
export const DIVIDER = 14;

export function gameplayLayout(H: number, safeTop: number, safeBottom: number): GameplayLayout {
  const hudBottom = Math.round(safeTop + HUD_HEIGHT);
  const controlsH = CONTROLS_HEIGHT + safeBottom;
  const laneH = Math.floor((H - hudBottom - controlsH - DIVIDER) / 2);
  const realTop = hudBottom;
  const dividerY = realTop + laneH + DIVIDER / 2;
  const shadowTop = realTop + laneH + DIVIDER;
  const controlsTop = shadowTop + laneH;
  return {
    hudBottom,
    laneH,
    realTop,
    dividerY,
    shadowTop,
    controlsTop,
    controlsY: controlsTop + (H - safeBottom - controlsTop) / 2 + 4,
    switchRadius: 84,
  };
}

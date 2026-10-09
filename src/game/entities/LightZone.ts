import type { Obstacle, ObstacleState } from './Obstacle';

export type LightState = 'off' | 'warning' | 'on';

/** How long before a timed light turns on that it starts flickering as a warning (seconds). */
export const LIGHT_WARNING_TIME = 0.45;

/**
 * Light zones are the shadow's deadly hazard: while on, any part of the active shadow inside the light
 * is destroyed. Lights can be permanent, pulse on a cycle, sweep sideways or be switched on from the
 * reality world (street lamps). This helper describes the visible state for rendering, audio and HUD
 * warnings – the collision itself uses Obstacle.shape().
 */
export function lightState(light: Obstacle, t: number, state: ObstacleState): LightState {
  if (state.hidden || state.off) return 'off';
  if (light.cycleOn(t)) return 'on';
  return light.timeUntilOn(t) <= LIGHT_WARNING_TIME ? 'warning' : 'off';
}

/** Pulsing intensity 0..1 for drawing (on lights breathe, warnings flicker). */
export function lightIntensity(light: Obstacle, t: number, state: ObstacleState): number {
  switch (lightState(light, t, state)) {
    case 'on':
      return 0.82 + 0.18 * Math.sin(t * 9 + light.x * 0.01);
    case 'warning':
      return Math.sin(t * 40) > 0 ? 0.45 : 0.15;
    case 'off':
      return 0.06;
  }
}

/** Distance to the next light that is (or will be) dangerous ahead of the runner, or Infinity. */
export function nextLightDistance(lights: readonly Obstacle[], states: readonly ObstacleState[], x: number, t: number, horizon = 420): number {
  let best = Infinity;
  for (const light of lights) {
    if (light.kind !== 'lightZone') continue;
    const d = light.x - x;
    if (d < -light.w || d > horizon) continue;
    const s = states[light.index];
    if (s.hidden || s.off) continue;
    if (lightState(light, t, s) !== 'off' || light.def.cycle === undefined) best = Math.min(best, Math.max(0, d));
  }
  return best;
}

import type { Side, SwitchDef, SwitchKind } from '../levels/LevelDefinition';

/** Range for activating a switch by tapping the character / pressing E. */
export const INTERACT_RANGE = 120;

/**
 * Levers, pressure plates and lamps. A switch fires once, when the active form of its own world
 * touches it (or the player taps the character while it is in range):
 *   lever – a pole you run into (any height up to 110)
 *   plate – a pressure plate: only fires while the form is on the ground
 *   lamp  – a street light post (up to 140 high): running into it switches the light on.
 *           Jumping over it, or passing in the other form, leaves it off.
 */
export class Switch {
  readonly kind: SwitchKind;
  readonly side: Side;
  readonly x: number;
  readonly id: string;

  constructor(
    readonly def: SwitchDef,
    readonly index: number,
  ) {
    this.kind = def.kind;
    this.side = def.side;
    this.x = def.x;
    this.id = def.id;
  }

  /** Whether a body (centre x, feet h, on ground?) triggers the switch by contact. */
  touches(x: number, halfWidth: number, h: number, onGround: boolean): boolean {
    const reach = this.kind === 'plate' ? 34 : 14;
    if (Math.abs(x - this.x) > halfWidth + reach) return false;
    switch (this.kind) {
      case 'plate':
        return onGround && h <= 4;
      case 'lever':
        return h < 110;
      case 'lamp':
        return h < 140;
    }
  }

  inInteractRange(x: number): boolean {
    return this.x - x <= INTERACT_RANGE && this.x - x >= -30;
  }
}

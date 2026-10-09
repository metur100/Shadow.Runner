import type { PortalDef, Side } from '../levels/LevelDefinition';

/** Portal opening height (world units). */
export const PORTAL_HEIGHT = 190;

/**
 * Phase portals swap the active form when the active form of their world runs through them.
 * A required portal must be entered: passing it in the other form fails the level.
 * The exit portal at the end of every level spans both worlds and completes the level.
 */
export class Portal {
  readonly side: Side;
  readonly x: number;
  readonly id: string;

  constructor(
    readonly def: PortalDef,
    readonly index: number,
  ) {
    this.side = def.side;
    this.x = def.x;
    this.id = def.id;
  }

  get isExit(): boolean {
    return this.def.kind === 'exit';
  }

  get required(): boolean {
    return this.def.required ?? false;
  }

  touches(x: number, h: number): boolean {
    return Math.abs(x - this.x) < 24 && h < PORTAL_HEIGHT - 40;
  }

  /** The runner has passed it without entering. */
  missed(x: number): boolean {
    return x > this.x + 40;
  }
}

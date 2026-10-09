import type { CollectibleDef, CollectibleKind, Side } from '../levels/LevelDefinition';

/** Pickup radius around an item's centre (world units). */
export const PICKUP_RADIUS = 30;

/**
 * Coins live in the reality world and are collected by the physical form; crystals live in the shadow
 * world and are collected by the shadow. Keys can be in either world and trigger cross-world effects.
 */
export class Collectible {
  readonly kind: CollectibleKind;
  readonly side: Side;
  readonly x: number;
  readonly y: number;
  readonly id: string;

  constructor(
    readonly def: CollectibleDef,
    readonly index: number,
  ) {
    this.kind = def.kind;
    this.side = def.side;
    this.x = def.x;
    this.y = def.y;
    this.id = def.id ?? `item-${index}`;
  }

  /** Whether a body box (centre x, feet h, height) touches the item. */
  touches(x: number, halfWidth: number, h: number, height: number): boolean {
    const nx = Math.max(x - halfWidth, Math.min(this.x, x + halfWidth));
    const ny = Math.max(h, Math.min(this.y, h + height));
    const dx = this.x - nx;
    const dy = this.y - ny;
    return dx * dx + dy * dy <= PICKUP_RADIUS * PICKUP_RADIUS;
  }

  /** Score value. */
  get points(): number {
    return this.kind === 'coin' ? 50 : this.kind === 'crystal' ? 60 : 150;
  }
}

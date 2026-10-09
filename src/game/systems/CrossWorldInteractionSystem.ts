import type { ObstacleState } from '../entities/Obstacle';
import type { EffectAction, InteractionDef, InteractionEffect } from '../levels/LevelDefinition';

export interface PendingRevert {
  at: number;
  target: number;
  action: EffectAction;
}

export interface AppliedEffect {
  target: number;
  action: EffectAction;
}

const INVERSE: Record<EffectAction, EffectAction> = {
  open: 'close',
  close: 'open',
  show: 'hide',
  hide: 'show',
  on: 'off',
  off: 'on',
  start: 'start',
};

/**
 * Links the two worlds. A trigger (switch id or key id) fires the interactions listed in the level
 * data, which change obstacles – usually in the other world: a lever above opens a shadow gate below,
 * a shadow plate builds a bridge above, a street lamp above lights up the shadow world, and so on.
 * Timed effects revert after their duration (pending reverts are part of the run snapshot).
 */
export class CrossWorldInteractionSystem {
  private readonly byTrigger = new Map<string, InteractionDef[]>();
  pending: PendingRevert[] = [];

  constructor(
    interactions: readonly InteractionDef[],
    private readonly obstacleIds: ReadonlyMap<string, number>,
  ) {
    for (const interaction of interactions) {
      const list = this.byTrigger.get(interaction.trigger) ?? [];
      list.push(interaction);
      this.byTrigger.set(interaction.trigger, list);
    }
  }

  has(trigger: string): boolean {
    return this.byTrigger.has(trigger);
  }

  /** Descriptions of what a trigger does (documentation, tutorial and level preview). */
  describe(trigger: string): string[] {
    return (this.byTrigger.get(trigger) ?? []).map((i) => i.description);
  }

  fire(trigger: string, t: number, states: ObstacleState[], out: AppliedEffect[]): void {
    for (const interaction of this.byTrigger.get(trigger) ?? []) {
      for (const effect of interaction.effects) this.apply(effect, t, states, out);
    }
  }

  /** Applies reverts that are due. */
  tick(t: number, states: ObstacleState[], out: AppliedEffect[]): void {
    if (this.pending.length === 0) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at > t) continue;
      this.pending.splice(i, 1);
      applyAction(states[p.target], p.action, t);
      out.push({ target: p.target, action: p.action });
    }
  }

  private apply(effect: InteractionEffect, t: number, states: ObstacleState[], out: AppliedEffect[]): void {
    const target = this.obstacleIds.get(effect.target);
    if (target === undefined) return;
    applyAction(states[target], effect.action, t);
    out.push({ target, action: effect.action });
    if (effect.duration !== undefined && effect.action !== 'start') {
      this.pending.push({ at: t + effect.duration, target, action: INVERSE[effect.action] });
    }
  }
}

export function applyAction(state: ObstacleState, action: EffectAction, t: number): void {
  switch (action) {
    case 'open':
      state.open = true;
      break;
    case 'close':
      state.open = false;
      break;
    case 'show':
      state.hidden = false;
      break;
    case 'hide':
      state.hidden = true;
      break;
    case 'on':
      state.off = false;
      break;
    case 'off':
      state.off = true;
      break;
    case 'start':
      if (state.startedAt < 0) state.startedAt = t;
      break;
  }
}

import type { LevelDefinition } from '../src/game/levels/LevelDefinition';
import { RunSession } from '../src/game/systems/RunSession';
import { SIM_STEP } from '../src/game/utils/Constants';

/** A flat test level with a constant speed of 300 units/s; pass only what the test needs. */
export function testLevel(partial: Partial<LevelDefinition> = {}): LevelDefinition {
  return {
    id: 'test',
    index: -1,
    worldId: 0,
    name: 'Test',
    theme: 'city',
    speed: { start: 300, end: 300 },
    length: 3000,
    spawn: { real: { x: 0, h: 0 }, shadow: { x: 0, h: 0 }, form: 'real' },
    obstacles: [],
    collectibles: [],
    switches: [],
    portals: [{ id: 'exit', side: 'real', x: 3000, kind: 'exit' }],
    interactions: [],
    checkpoints: [],
    eclipses: [],
    timeLimit: 60,
    required: 0,
    parSwitches: 0,
    lives: 1,
    difficulty: 1,
    tutorialText: '',
    ...partial,
  };
}

/** Steps until the runner reaches `x` (or the run stops). */
export function runTo(session: RunSession, x: number, maxSteps = 20000): void {
  for (let i = 0; i < maxSteps && session.state === 'running' && session.x < x; i++) session.step(SIM_STEP);
}

export function steps(session: RunSession, n: number): void {
  for (let i = 0; i < n; i++) session.step(SIM_STEP);
}

export function session(partial: Partial<LevelDefinition> = {}, lives?: number): RunSession {
  return new RunSession(testLevel(partial), { lives });
}

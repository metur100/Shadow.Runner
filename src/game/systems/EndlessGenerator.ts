import type { LevelDefinition, ThemeId } from '../levels/LevelDefinition';
import { buildLevel, type PatternName } from '../levels/Patterns';
import { Rng } from '../utils/MathUtils';

/** Pattern tiers: endless mode starts with the gentle ones and mixes in harder ones as it goes. */
const TIERS: PatternName[][] = [
  ['spikes', 'darkSpikes', 'crate', 'rock', 'wall', 'light', 'ceiling', 'roots', 'mixed', 'pit'],
  ['leverGate', 'plateBridge', 'pulseLight', 'wallRun', 'shadowPit', 'falling', 'platforms', 'lampTrap'],
  ['laser', 'laserLight', 'timedDoor', 'train', 'sign', 'gear', 'gearPair', 'movingPlatform'],
  ['elevator', 'pendulum', 'phasePlatforms', 'collapse', 'shadowBridge', 'beams', 'portal', 'keyDoor'],
  ['fastSwitch', 'multiLight', 'eclipse', 'movingGate', 'silhouette', 'fasterSwitch'],
];

const THEMES: ThemeId[] = ['city', 'park', 'neon', 'clockwork', 'temple', 'eclipse'];

/**
 * Endless mode: a long run assembled from short obstacle segments. Speed rises steadily and the
 * segment pool widens over time. Segments alternate between those
 * that need the physical form and those that need the shadow, and every segment is self-contained, so
 * every switch the player is asked for is fair. The best distance is saved locally.
 */
export function buildEndlessLevel(seed: number, segments = 160): LevelDefinition {
  const rng = new Rng(seed);
  const loop: PatternName[] = [];
  let last: PatternName | null = null;
  for (let i = 0; i < segments; i++) {
    const unlocked = Math.min(TIERS.length, 1 + Math.floor(i / 10));
    // Mostly the newest tier, sometimes an older one.
    const tier = rng.chance(0.55) ? unlocked - 1 : rng.int(0, unlocked - 1);
    let p = rng.pick(TIERS[tier]);
    if (p === last) p = rng.pick(TIERS[0]);
    loop.push(p);
    last = p;
  }
  const theme = THEMES[seed % THEMES.length];
  const level = buildLevel({
    id: `endless-${seed}`,
    index: -1,
    worldId: THEMES.indexOf(theme),
    name: 'Endless Run',
    theme,
    speed: { start: 350, end: 330 + segments * 2.2 },
    duration: 1,
    spacing: 500,
    lives: 1,
    difficulty: 5,
    tutorialText: 'How far can you run?',
    intro: loop,
    loop: [],
    noCheckpoints: true,
  });
  // No time limit in endless mode; the session runs with `endless: true`.
  level.timeLimit = 60 * 60;
  return level;
}

/** A short endless run, used by the level verifier. */
export function buildEndlessPreview(seed: number): LevelDefinition {
  return buildEndlessLevel(seed, 40);
}

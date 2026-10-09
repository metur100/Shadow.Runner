import type { LevelDefinition, ThemeId } from '../levels/LevelDefinition';
import { buildLevel, type PatternName } from '../levels/Patterns';
import { WORLDS } from '../levels/WorldDefinitions';
import { hashString, Rng } from '../utils/MathUtils';

/** Today's date as YYYY-MM-DD in the player's local time zone. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const POOL: PatternName[] = [
  'wall', 'light', 'spikes', 'darkSpikes', 'crate', 'rock', 'ceiling', 'roots', 'pit', 'shadowPit',
  'leverGate', 'plateBridge', 'lampTrap', 'movingPlatform', 'pulseLight', 'wallRun', 'laser', 'laserLight',
  'timedDoor', 'train', 'sign', 'gear', 'gearPair', 'elevator', 'pendulum', 'phasePlatforms', 'collapse',
  'shadowBridge', 'beams', 'portal', 'keyDoor', 'multiLight', 'eclipse', 'movingGate', 'silhouette', 'falling',
];

/** Special twists: each day gets one, played twice in the level. */
const TWISTS: { name: string; patterns: PatternName[] }[] = [
  { name: 'Eclipse Day', patterns: ['eclipse'] },
  { name: 'Rush Hour', patterns: ['train', 'speed'] },
  { name: 'Lamp Alley', patterns: ['lampTrap', 'lampTrap'] },
  { name: 'Mirror Run', patterns: ['portal', 'shadowPortal'] },
  { name: 'Clockwork Panic', patterns: ['pendulum', 'phasePlatforms'] },
  { name: 'Lights Everywhere', patterns: ['multiLight', 'beams'] },
  { name: 'Switchback', patterns: ['fasterSwitch'] },
];

/**
 * Deterministic daily challenge without a backend: the date seeds a random generator that picks an
 * unusual world combination (the reality lane from one world, the shadow lane from another), a twist
 * and a pattern sequence. Every device produces the same level on the same day.
 */
export function buildDailyLevel(date: string): LevelDefinition {
  const rng = new Rng(hashString(`shadow-runner/daily/${date}`));
  const realWorld = rng.pick(WORLDS);
  let shadowWorld = rng.pick(WORLDS);
  if (shadowWorld.id === realWorld.id) shadowWorld = WORLDS[(realWorld.id + 1 + rng.int(0, 4)) % WORLDS.length];
  const twist = rng.pick(TWISTS);
  const loop: PatternName[] = [];
  let last: PatternName | null = null;
  while (loop.length < 12) {
    const p = rng.pick(POOL);
    if (p === last) continue;
    loop.push(p);
    last = p;
    if (loop.length === 4 || loop.length === 9) loop.push(...twist.patterns);
  }
  const level = buildLevel({
    id: `daily-${date}`,
    index: -1,
    worldId: realWorld.id,
    name: `${twist.name}`,
    theme: realWorld.theme as ThemeId,
    shadowTheme: shadowWorld.theme as ThemeId,
    speed: { start: 365, end: 415 },
    duration: 80,
    spacing: 500,
    lives: 3,
    difficulty: 7,
    tutorialText: `${realWorld.name} above, ${shadowWorld.name} below. Twist: ${twist.name}.`,
    intro: [],
    loop,
  });
  return level;
}

/** Readable label for a date key, e.g. "Oct 9". */
export function dailyLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

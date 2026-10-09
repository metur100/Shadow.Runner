import type { LevelDefinition } from './LevelDefinition';
import { buildLevel, LevelBuilder, run, type LevelRecipe } from './Patterns';

/**
 * The campaign: 6 worlds × 5 levels. Each level is a handcrafted recipe – an intro that teaches the
 * world's new idea, then a loop of patterns repeated until the level reaches its target length
 * (45–120 seconds). Difficulty rises through speed, shorter run-ups between patterns and denser mixes.
 */
const RECIPES: LevelRecipe[] = [
  // ───────── World 1 · First Light ─────────
  {
    id: 'w1-1', index: 0, worldId: 0, name: 'Morning Run', theme: 'city',
    speed: { start: 320, end: 345 }, duration: 45, spacing: 640, lives: 3, difficulty: 1,
    tutorialText: 'Swipe up to jump over spikes and crates.',
    intro: ['run', 'spikes', 'run', 'crate'],
    loop: ['spikes', 'run', 'crate', 'wideSpikes', 'platforms'],
    tips: [[1, 'Swipe up (or press Space) to jump']],
  },
  {
    id: 'w1-2', index: 1, worldId: 0, name: 'Two Worlds', theme: 'city',
    speed: { start: 320, end: 350 }, duration: 48, spacing: 640, lives: 3, difficulty: 1,
    tutorialText: 'Tap to switch. Your shadow walks through walls.',
    intro: ['mixed', 'wall', 'runShadow', 'wall'],
    loop: ['mixed', 'spikes', 'wall', 'darkSpikes', 'run'],
    tips: [[0, 'Tap to switch – crystals live in the shadow world'], [1, 'Walls stop you. Switch: the shadow passes through']],
  },
  {
    id: 'w1-3', index: 2, worldId: 0, name: 'Lights Out', theme: 'city',
    speed: { start: 325, end: 355 }, duration: 52, spacing: 620, lives: 3, difficulty: 2,
    tutorialText: 'Light destroys your shadow – be your physical self in the light.',
    intro: ['wall', 'light', 'run'],
    loop: ['wall', 'darkSpikes', 'light', 'spikes', 'mixed', 'shortLight'],
    tips: [[1, 'Light! Switch back before your shadow reaches it']],
  },
  {
    id: 'w1-4', index: 3, worldId: 0, name: 'Duck and Dash', theme: 'city',
    speed: { start: 330, end: 360 }, duration: 55, spacing: 600, lives: 3, difficulty: 2,
    tutorialText: 'Swipe down to slide under low barriers.',
    intro: ['ceiling', 'roots', 'wall'],
    loop: ['ceiling', 'wall', 'roots', 'light', 'crate', 'spikes', 'rock'],
    tips: [[0, 'Swipe down (or press ↓) to slide']],
  },
  {
    id: 'w1-5', index: 4, worldId: 0, name: 'Rooftop Leap', theme: 'city',
    speed: { start: 335, end: 365 }, duration: 60, spacing: 580, lives: 3, difficulty: 3,
    tutorialText: 'Jump the gaps between rooftops. Mind the falling crates.',
    intro: ['pit', 'shadowPit', 'wallThenLight'],
    loop: ['pit', 'wall', 'falling', 'light', 'platforms', 'shadowPit', 'ceiling', 'fallingRock'],
  },

  // ───────── World 2 · Parallel Park ─────────
  {
    id: 'w2-1', index: 5, worldId: 1, name: 'Root Gate', theme: 'park',
    speed: { start: 340, end: 370 }, duration: 62, spacing: 580, lives: 3, difficulty: 3,
    tutorialText: 'Pull a lever above to open the gate below.',
    intro: ['leverGate', 'run'],
    loop: ['leverGate', 'spikes', 'light', 'darkSpikes', 'wall', 'mixed'],
    tips: [[0, 'Run into the lever as your physical self – it opens the shadow gate']],
  },
  {
    id: 'w2-2', index: 6, worldId: 1, name: 'Bridge Builder', theme: 'park',
    speed: { start: 340, end: 372 }, duration: 66, spacing: 570, lives: 3, difficulty: 3,
    tutorialText: 'A shadow plate builds the bridge above.',
    intro: ['plateBridge', 'run'],
    loop: ['plateBridge', 'crate', 'wall', 'light', 'leverGate', 'roots'],
    tips: [[0, 'Step on the plate as the shadow, then switch to cross the bridge']],
  },
  {
    id: 'w2-3', index: 7, worldId: 1, name: 'Lamplight', theme: 'park',
    speed: { start: 345, end: 375 }, duration: 68, spacing: 560, lives: 3, difficulty: 4,
    tutorialText: 'Street lamps light up the shadow world. Don’t bump them.',
    intro: ['lampTrap', 'pulseLight'],
    loop: ['lampTrap', 'darkSpikes', 'pulseLight', 'wallRun', 'roots', 'mixed'],
    tips: [[0, 'Bumping a lamp lights the shadow world – jump it, or pass it as the shadow'], [1, 'Pulsing light: be your physical self']],
  },
  {
    id: 'w2-4', index: 8, worldId: 1, name: 'Drifting Paths', theme: 'park',
    speed: { start: 345, end: 378 }, duration: 72, spacing: 550, lives: 3, difficulty: 4,
    tutorialText: 'Ride moving platforms across the ponds.',
    intro: ['movingPlatform', 'platformPit'],
    loop: ['movingPlatform', 'wall', 'platformPit', 'leverGate', 'pulseLight', 'shadowPlatforms'],
  },
  {
    id: 'w2-5', index: 9, worldId: 1, name: 'Park After Dark', theme: 'park',
    speed: { start: 350, end: 385 }, duration: 76, spacing: 530, lives: 3, difficulty: 5,
    tutorialText: 'Everything the park has learned, all at once.',
    intro: [],
    loop: ['leverGate', 'plateBridge', 'lampTrap', 'movingPlatform', 'wallRun', 'pulseLight', 'platforms', 'shadowPlatforms'],
  },

  // ───────── World 3 · Neon City ─────────
  {
    id: 'w3-1', index: 10, worldId: 2, name: 'Laser Lane', theme: 'neon',
    speed: { start: 355, end: 395 }, duration: 70, spacing: 530, lives: 3, difficulty: 5,
    tutorialText: 'Lasers blink on and off. Read the rhythm – or switch.',
    intro: ['laserOff', 'laser'],
    loop: ['laser', 'crate', 'laserLight', 'wall', 'laserOff', 'spikes'],
    tips: [[1, 'This laser is on – switch to the shadow and jump the spikes']],
  },
  {
    id: 'w3-2', index: 11, worldId: 2, name: 'Door Rush', theme: 'neon',
    speed: { start: 360, end: 400 }, duration: 74, spacing: 520, lives: 3, difficulty: 5,
    tutorialText: 'Timed doors and timed levers – keep moving.',
    intro: ['timedDoor', 'timedLever'],
    loop: ['timedDoor', 'laser', 'timedLever', 'light', 'sign'],
    tips: [[1, 'This lever only holds the gate open for 3 seconds']],
  },
  {
    id: 'w3-3', index: 12, worldId: 2, name: 'Night Express', theme: 'neon',
    speed: { start: 360, end: 402 }, duration: 78, spacing: 520, lives: 3, difficulty: 6,
    tutorialText: 'Trains roar through reality. Be the shadow when they pass.',
    intro: ['train'],
    loop: ['train', 'laserLight', 'sign', 'wall', 'timedDoor'],
    tips: [[0, 'Train incoming – switch to the shadow!']],
  },
  {
    id: 'w3-4', index: 13, worldId: 2, name: 'Overdrive', theme: 'neon',
    speed: { start: 365, end: 405 }, duration: 80, spacing: 520, lives: 3, difficulty: 6,
    tutorialText: 'Speed sections push you faster. Stay sharp.',
    intro: ['speed'],
    loop: ['speed', 'laser', 'train', 'wallThenLight', 'sign', 'laserLight'],
  },
  {
    id: 'w3-5', index: 14, worldId: 2, name: 'Neon Signals', theme: 'neon',
    speed: { start: 370, end: 410 }, duration: 85, spacing: 500, lives: 3, difficulty: 6,
    tutorialText: 'The whole city is blinking at you.',
    intro: [],
    loop: ['sign', 'laser', 'timedLever', 'train', 'speed', 'laserLight', 'timedDoor', 'falling'],
  },

  // ───────── World 4 · Clockwork District ─────────
  {
    id: 'w4-1', index: 15, worldId: 3, name: 'Gearworks', theme: 'clockwork',
    speed: { start: 370, end: 405 }, duration: 80, spacing: 500, lives: 3, difficulty: 6,
    tutorialText: 'Slide under the spinning gears.',
    intro: ['gear', 'shadowGear'],
    loop: ['gear', 'wall', 'shadowGear', 'light', 'gearPair', 'blade'],
  },
  {
    id: 'w4-2', index: 16, worldId: 3, name: 'Up and Down', theme: 'clockwork',
    speed: { start: 370, end: 408 }, duration: 84, spacing: 500, lives: 3, difficulty: 7,
    tutorialText: 'Elevators rise and fall – some move in both worlds at once.',
    intro: ['elevator', 'syncPlatforms'],
    loop: ['elevator', 'gearPair', 'syncPlatforms', 'wallThenLight', 'thorn'],
    tips: [[1, 'One plate moves both lifts: up above, down below']],
  },
  {
    id: 'w4-3', index: 17, worldId: 3, name: 'Pendulum Hall', theme: 'clockwork',
    speed: { start: 372, end: 410 }, duration: 88, spacing: 490, lives: 3, difficulty: 7,
    tutorialText: 'Time your jumps over the swinging pendulums.',
    intro: ['pendulum'],
    loop: ['pendulum', 'gear', 'wall', 'pendulum', 'darkSpikes', 'leverGate'],
  },
  {
    id: 'w4-4', index: 18, worldId: 3, name: 'Phase Shift', theme: 'clockwork',
    speed: { start: 375, end: 412 }, duration: 90, spacing: 490, lives: 3, difficulty: 7,
    tutorialText: 'Phase platforms blink in and out of the shadow world.',
    intro: ['phasePlatforms'],
    loop: ['phasePlatforms', 'pendulum', 'elevator', 'shadowGear', 'lampTrap'],
  },
  {
    id: 'w4-5', index: 19, worldId: 3, name: 'Tick Tock', theme: 'clockwork',
    speed: { start: 378, end: 416 }, duration: 95, spacing: 480, lives: 3, difficulty: 8,
    tutorialText: 'Every gear in the district, perfectly in sync.',
    intro: [],
    loop: ['gearPair', 'pendulum', 'phasePlatforms', 'elevator', 'timedDoor', 'syncPlatforms', 'blade', 'thorn'],
  },

  // ───────── World 5 · Sunken Temple ─────────
  {
    id: 'w5-1', index: 20, worldId: 4, name: 'Tide Steps', theme: 'temple',
    speed: { start: 375, end: 412 }, duration: 90, spacing: 480, lives: 3, difficulty: 7,
    tutorialText: 'Old stones crumble – keep running across them.',
    intro: ['water', 'collapse'],
    loop: ['water', 'collapse', 'wall', 'light', 'roots', 'water'],
  },
  {
    id: 'w5-2', index: 21, worldId: 4, name: 'Bridge of Shadows', theme: 'temple',
    speed: { start: 378, end: 414 }, duration: 94, spacing: 480, lives: 3, difficulty: 8,
    tutorialText: 'A lever above raises a bridge in the shadow world.',
    intro: ['shadowBridge'],
    loop: ['shadowBridge', 'collapse', 'roots', 'wallThenLight', 'water'],
  },
  {
    id: 'w5-3', index: 22, worldId: 4, name: 'Beam Chamber', theme: 'temple',
    speed: { start: 380, end: 416 }, duration: 96, spacing: 470, lives: 3, difficulty: 8,
    tutorialText: 'Light beams flash between the pillars. Trust the rhythm.',
    intro: ['beams'],
    loop: ['beams', 'water', 'light', 'beams', 'collapse', 'shadowBridge'],
  },
  {
    id: 'w5-4', index: 23, worldId: 4, name: 'Mirror Gates', theme: 'temple',
    speed: { start: 382, end: 418 }, duration: 100, spacing: 470, lives: 3, difficulty: 8,
    tutorialText: 'Portals swap you between the worlds. You must go through.',
    intro: ['portal', 'shadowPortal'],
    loop: ['portal', 'collapse', 'shadowPortal', 'beams', 'water', 'wall'],
    tips: [[0, 'Run through the portal as your physical self – it turns you into the shadow']],
  },
  {
    id: 'w5-5', index: 24, worldId: 4, name: 'Temple Key', theme: 'temple',
    speed: { start: 385, end: 420 }, duration: 105, spacing: 460, lives: 3, difficulty: 9,
    tutorialText: 'A key from the shadow world opens the temple door.',
    intro: ['keyDoor'],
    loop: ['keyDoor', 'portal', 'shadowBridge', 'collapse', 'beams', 'water'],
  },

  // ───────── World 6 · The Eclipse ─────────
  {
    id: 'w6-1', index: 25, worldId: 5, name: 'First Shadow', theme: 'eclipse',
    speed: { start: 385, end: 425 }, duration: 100, spacing: 440, lives: 3, difficulty: 8,
    tutorialText: 'Walls and lights, faster and faster.',
    intro: ['fastSwitch', 'multiLight'],
    loop: ['fastSwitch', 'multiLight', 'silhouette', 'wall', 'darkSpikes'],
  },
  {
    id: 'w6-2', index: 26, worldId: 5, name: 'Merging', theme: 'eclipse',
    speed: { start: 388, end: 430 }, duration: 105, spacing: 440, lives: 3, difficulty: 9,
    tutorialText: 'In the eclipse both forms are real – and both jump together.',
    intro: ['eclipse'],
    loop: ['eclipse', 'fastSwitch', 'multiLight', 'movingGate'],
    tips: [[0, 'Eclipse! Both of you are solid now – jump and slide together']],
  },
  {
    id: 'w6-3', index: 27, worldId: 5, name: 'Sliding Gates', theme: 'eclipse',
    speed: { start: 390, end: 435 }, duration: 110, spacing: 430, lives: 3, difficulty: 9,
    tutorialText: 'Gates slide open and shut. Arrive at the right moment.',
    intro: ['movingGate'],
    loop: ['movingGate', 'fasterSwitch', 'eclipse', 'keyDoor', 'silhouette'],
  },
  {
    id: 'w6-4', index: 28, worldId: 5, name: 'Totality', theme: 'eclipse',
    speed: { start: 392, end: 440 }, duration: 115, spacing: 420, lives: 2, difficulty: 10,
    tutorialText: 'Everything you have learned, under a black sun.',
    intro: [],
    loop: ['fasterSwitch', 'eclipse', 'portal', 'train', 'movingGate', 'multiLight', 'collapse', 'pendulum'],
  },
  {
    id: 'w6-5', index: 29, worldId: 5, name: 'The Last Light', theme: 'eclipse',
    speed: { start: 395, end: 450 }, duration: 120, spacing: 420, lives: 2, difficulty: 10,
    tutorialText: 'The eclipse is chasing you. Run for the great portal!',
    intro: ['speed'],
    loop: ['fasterSwitch', 'eclipse', 'movingGate', 'train', 'shadowBridge', 'multiLight', 'portal', 'laserLight', 'speed'],
    chase: true,
  },
];

export const LEVELS: LevelDefinition[] = RECIPES.map(buildLevel);

export const LEVEL_COUNT = LEVELS.length;
export const LEVELS_PER_WORLD = 5;

export function levelById(id: string): LevelDefinition | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function levelsOfWorld(worldId: number): LevelDefinition[] {
  return LEVELS.filter((l) => l.worldId === worldId);
}

/**
 * The interactive tutorial: a short, gentle level where time freezes at each step until the player
 * performs the action it teaches.
 */
export function buildTutorialLevel(): LevelDefinition {
  const b = new LevelBuilder('real');
  const steps = b.steps;
  b.x = 300;
  steps.push({ x: 260, text: 'This is you, running through the reality world above.', action: 'none' });
  steps.push({ x: 262, text: 'And this is your shadow, in the shadow world below. You both run together.', action: 'none' });
  run(b, 500, 'real');
  // 1 · Switch to the shadow for a wall.
  const wallX = 1700;
  steps.push({ x: wallX - 330, text: 'A wall! Only your shadow can pass through walls.\nTap anywhere to switch.', action: 'switch', form: 'shadow' });
  b.obstacles.push({ kind: 'wall', side: 'real', x: wallX, w: 70, h: 300 }, { kind: 'shadowWall', side: 'shadow', x: wallX, w: 70, h: 300 });
  b.row('shadow', wallX - 160, 5, 70);
  // 2 · Back to the physical form for light.
  const lightX = 2650;
  steps.push({ x: lightX - 340, text: 'Light destroys your shadow.\nTap to switch back to your physical self.', action: 'switch', form: 'real' });
  b.obstacles.push({ kind: 'lightZone', side: 'shadow', x: lightX, w: 300 });
  b.row('real', lightX - 20, 4, 80);
  // 3 · Jump.
  const spikesX = 3500;
  // The jump starts right when the prompt is answered: close enough that even a short hop clears them.
  steps.push({ x: spikesX - 55, text: 'Spikes! Swipe up to jump.', action: 'jump' });
  b.obstacles.push({ kind: 'spikes', side: 'real', x: spikesX, w: 90 });
  b.arc('real', spikesX + 45, 5, 165, 230);
  // 4 · Slide.
  const ceilingX = 4300;
  steps.push({ x: ceilingX - 20, text: 'Low barrier! Swipe down to slide.', action: 'slide' });
  b.obstacles.push({ kind: 'ceiling', side: 'real', x: ceilingX, w: 120 });
  b.row('real', ceilingX + 20, 2, 70, 18);
  // 5 · Cross-world switch: the lever above opens the gate below.
  const leverX = 5100;
  steps.push({ x: leverX - 420, text: 'Switches change the OTHER world.\nRun into the lever to open the gate below.', action: 'none' });
  b.switches.push({ id: 'tlever', kind: 'lever', side: 'real', x: leverX });
  const gateX = 5800;
  b.obstacles.push({ id: 'tgate', kind: 'gate', side: 'shadow', x: gateX, w: 34 }, { kind: 'wall', side: 'real', x: gateX - 10, w: 60, h: 300 });
  b.interactions.push({ trigger: 'tlever', effects: [{ action: 'open', target: 'tgate' }], description: 'The tutorial lever opens the shadow gate.' });
  steps.push({ x: gateX - 330, text: 'The gate is open! Switch to your shadow to get past the wall.', action: 'switch', form: 'shadow' });
  b.row('shadow', gateX - 150, 4, 70);
  b.x = gateX + 400;
  steps.push({ x: gateX + 300, text: 'Collect coins above and crystals below. Reach the portal to finish!', action: 'none' });
  run(b, 900, 'both');
  const length = b.x + 100;
  b.portals.push({ id: 'exit', side: 'real', x: length, kind: 'exit' });
  return {
    id: 'tutorial',
    index: -1,
    worldId: 0,
    name: 'Tutorial',
    theme: 'city',
    speed: { start: 300, end: 300 },
    length,
    spawn: { real: { x: 0, h: 0 }, shadow: { x: 0, h: 0 }, form: 'real' },
    obstacles: b.obstacles,
    collectibles: b.collectibles,
    switches: b.switches,
    portals: b.portals,
    interactions: b.interactions,
    checkpoints: [1250, 2250, 3200, 4000, 4700],
    eclipses: [],
    timeLimit: 300,
    required: 0,
    parSwitches: 3,
    lives: 99,
    difficulty: 1,
    tutorialText: 'Learn to switch, jump and slide.',
    tutorialSteps: steps,
  };
}

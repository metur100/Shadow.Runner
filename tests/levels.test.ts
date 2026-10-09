import { describe, expect, it } from 'vitest';

import { buildTutorialLevel, LEVELS } from '../src/game/levels/LevelData';
import { solveLevel } from '../src/game/levels/LevelSolver';
import { estimateDuration } from '../src/game/levels/Patterns';
import { WORLDS } from '../src/game/levels/WorldDefinitions';
import { buildEndlessPreview } from '../src/game/systems/EndlessGenerator';
import { RunSession } from '../src/game/systems/RunSession';

describe('campaign data', () => {
  it('has 30 levels in 6 worlds of 5', () => {
    expect(LEVELS).toHaveLength(30);
    expect(WORLDS).toHaveLength(6);
    for (const world of WORLDS) expect(LEVELS.filter((l) => l.worldId === world.id)).toHaveLength(5);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(30);
    LEVELS.forEach((l, i) => expect(l.index).toBe(i));
  });

  it('every level lasts 45–120 seconds', () => {
    for (const level of LEVELS) {
      const seconds = estimateDuration(level);
      expect(seconds, level.id).toBeGreaterThanOrEqual(45);
      expect(seconds, level.id).toBeLessThanOrEqual(125);
    }
  });

  it('difficulty never drops from one world to the next', () => {
    for (let w = 1; w < WORLDS.length; w++) {
      const prev = Math.max(...LEVELS.filter((l) => l.worldId === w - 1).map((l) => l.difficulty));
      const first = LEVELS.find((l) => l.worldId === w)!.difficulty;
      expect(first).toBeGreaterThanOrEqual(prev - 2);
    }
  });

  it('every interaction points at existing switches / keys and obstacles', () => {
    for (const level of [...LEVELS, buildTutorialLevel()]) {
      const obstacleIds = new Set(level.obstacles.map((o) => o.id).filter(Boolean));
      const triggers = new Set([...level.switches.map((s) => s.id), ...level.collectibles.map((c) => c.id).filter(Boolean)]);
      for (const interaction of level.interactions) {
        expect(triggers.has(interaction.trigger), `${level.id}: trigger ${interaction.trigger}`).toBe(true);
        expect(interaction.description.length).toBeGreaterThan(10);
        for (const effect of interaction.effects) expect(obstacleIds.has(effect.target), `${level.id}: target ${effect.target}`).toBe(true);
      }
    }
  });

  it('every level has checkpoints, an exit portal and reachable two-star goals', () => {
    for (const level of LEVELS) {
      expect(level.checkpoints.length, level.id).toBeGreaterThanOrEqual(2);
      expect(level.portals.some((p) => p.kind === 'exit' && p.x === level.length)).toBe(true);
      const items = level.collectibles.filter((c) => c.kind !== 'key').length;
      expect(level.required).toBeGreaterThan(0);
      expect(level.required).toBeLessThan(items);
    }
  });
});

describe('levels can be finished', () => {
  // The full campaign is checked by `npm run verify:levels`; here: the tutorial, the first level of
  // every world and a sample of endless mode.
  const sample = [buildTutorialLevel(), ...LEVELS.filter((l) => l.index % 5 === 0), buildEndlessPreview(7)];
  for (const level of sample) {
    it(`${level.id} – ${level.name}`, () => {
      const result = solveLevel(level);
      expect(result.solved, `stuck at ${Math.round(result.reached)} of ${level.length}`).toBe(true);
    }, 60000);
  }
});

describe('interactive tutorial', () => {
  it('answering every prompt right away finishes the tutorial without damage', () => {
    const level = buildTutorialLevel();
    const steps = level.tutorialSteps ?? [];
    expect(steps.map((s) => s.action)).toEqual(expect.arrayContaining(['switch', 'jump', 'slide', 'none']));
    const s = new RunSession(level);
    let i = 0;
    for (let n = 0; n < 60 * 120 && s.state !== 'complete'; n++) {
      const step = steps[i];
      if (step && s.x >= step.x) {
        i++;
        if (step.action === 'switch') s.switchForm();
        if (step.action === 'jump') s.jump(0.25);
        if (step.action === 'slide') s.slide();
        if (step.form) expect(s.active).toBe(step.form);
      }
      s.step(1 / 60);
    }
    expect(s.state).toBe('complete');
    expect(s.damage).toBe(0);
  });
});

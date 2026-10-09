import { describe, expect, it } from 'vitest';

import { computeScore, starsFor, switchEfficiency, type RunStats } from '../src/game/systems/ScoreSystem';
import { runTo, session } from './helpers';

const base: RunStats = {
  completed: true,
  progress: 1,
  distance: 10000,
  coins: 20,
  crystals: 20,
  keys: 0,
  totalCollectibles: 60,
  timeUsed: 40,
  timeLimit: 60,
  switches: 10,
  parSwitches: 8,
  damage: 0,
  checkpoints: 3,
  nearMisses: 2,
};

describe('collectible scoring', () => {
  it('coins are collected by the physical form, crystals by the shadow', () => {
    const items = {
      collectibles: [
        { kind: 'coin' as const, side: 'real' as const, x: 300, y: 40 },
        { kind: 'crystal' as const, side: 'shadow' as const, x: 300, y: 40 },
        { kind: 'crystal' as const, side: 'shadow' as const, x: 700, y: 40 },
      ],
    };
    const s = session(items);
    runTo(s, 500);
    expect(s.coins).toBe(1);
    expect(s.crystals).toBe(0);
    s.switchForm();
    runTo(s, 900);
    expect(s.crystals).toBe(1);
  });

  it('items high in the air need a jump', () => {
    const s = session({ collectibles: [{ kind: 'coin', side: 'real', x: 500, y: 150 }] });
    runTo(s, 700);
    expect(s.coins).toBe(0);
    const j = session({ collectibles: [{ kind: 'coin', side: 'real', x: 500, y: 150 }] });
    runTo(j, 420);
    j.jump(1);
    runTo(j, 700);
    expect(j.coins).toBe(1);
  });

  it('adds up the score parts', () => {
    const score = computeScore(base, { required: 30 });
    expect(score.distance).toBe(1000);
    expect(score.collectibles).toBe(20 * 50 + 20 * 60);
    expect(score.time).toBe(200);
    expect(score.efficiency).toBe(500);
    expect(score.checkpoints).toBe(300);
    expect(score.nearMisses).toBe(50);
    expect(score.total).toBe(1000 + 2200 + 200 + 500 + 300 + 50);
  });

  it('damage costs points and a failed run scores no time or efficiency bonus', () => {
    const hurt = computeScore({ ...base, damage: 2 }, { required: 0 });
    expect(hurt.damage).toBe(-500);
    const failed = computeScore({ ...base, completed: false, distance: 5000 }, { required: 0 });
    expect(failed.time).toBe(0);
    expect(failed.efficiency).toBe(0);
    expect(failed.stars).toBe(0);
  });
});

describe('star thresholds', () => {
  it('one star for finishing', () => {
    expect(starsFor({ ...base, coins: 0, crystals: 0 }, 30)).toBe(1);
  });

  it('two stars with enough collectibles', () => {
    expect(starsFor({ ...base, damage: 1 }, 30)).toBe(2);
  });

  it('three stars with collectibles, no damage and efficient switching', () => {
    expect(starsFor(base, 30)).toBe(3);
    expect(starsFor({ ...base, switches: 60 }, 30)).toBe(2);
  });

  it('no stars without finishing', () => {
    expect(starsFor({ ...base, completed: false }, 0)).toBe(0);
  });

  it('switch efficiency allows extra switches for collecting, then drops', () => {
    expect(switchEfficiency(8, 8)).toBe(1);
    expect(switchEfficiency(16, 8)).toBe(1);
    expect(switchEfficiency(24, 8)).toBeLessThan(0.6);
    expect(switchEfficiency(200, 8)).toBe(0);
  });
});

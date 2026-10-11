import { describe, expect, it } from 'vitest';

import { LEVELS } from '../src/game/levels/LevelData';
import { LANES, SIM_STEP } from '../src/game/utils/Constants';
import { runTo, session, steps } from './helpers';

const barrier = (lane: -1 | 0 | 1, side: 'real' | 'shadow' = 'real') => ({ kind: 'wall' as const, side, x: 600, w: 70, h: 300, lane, style: 'barrier' });

describe('lane changes', () => {
  it('starts in the middle lane and moves one lane per swipe, smoothly', () => {
    const s = session();
    expect(s.lane).toBe(0);
    expect(s.moveLane(-1)).toBe(true);
    expect(s.lane).toBe(-1);
    s.step(SIM_STEP);
    expect(s.lx).toBeLessThan(0);
    expect(s.lx).toBeGreaterThan(-1);
    steps(s, Math.ceil(LANES.changeTime / SIM_STEP) + 1);
    expect(s.lx).toBe(-1);
    expect(s.events.length).toBe(0);
  });

  it('cannot leave the road', () => {
    const s = session();
    s.moveLane(1);
    expect(s.moveLane(1)).toBe(false);
    expect(s.lane).toBe(1);
    expect(s.events.some((e) => e.type === 'laneBlocked')).toBe(true);
  });

  it('works in the air, and both forms share the lane', () => {
    const s = session();
    s.jump(1);
    steps(s, 5);
    expect(s.moveLane(-1)).toBe(true);
    s.switchForm();
    steps(s, 20);
    expect(s.lx).toBe(-1);
  });
});

describe('lane obstacles', () => {
  it('a barrier only hits in its own lane', () => {
    const hit = session({ obstacles: [barrier(0)] });
    runTo(hit, 800);
    expect(hit.failure).toMatchObject({ reason: 'wall', form: 'real' });

    const dodged = session({ obstacles: [barrier(0)] });
    runTo(dodged, 400);
    dodged.moveLane(1);
    runTo(dodged, 800);
    expect(dodged.state).toBe('running');
  });

  it('changing lanes too late still hits', () => {
    const s = session({ obstacles: [barrier(0)] });
    runTo(s, 590);
    s.moveLane(-1);
    runTo(s, 800);
    expect(s.state).toBe('hit');
  });

  it('whole-road obstacles hit in every lane', () => {
    for (const lane of [-1, 1] as const) {
      const s = session({ obstacles: [{ kind: 'wall', side: 'real', x: 600, w: 70, h: 300 }] });
      s.moveLane(lane);
      runTo(s, 800);
      expect(s.failure?.reason).toBe('wall');
    }
  });

  it('lights always span the whole road, even when given a lane', () => {
    const s = session({ obstacles: [{ kind: 'lightZone', side: 'shadow', x: 600, w: 200, lane: 0 }] });
    s.switchForm();
    s.moveLane(-1);
    runTo(s, 900);
    expect(s.failure?.reason).toBe('light');
  });

  it('a car in one lane only hits that lane', () => {
    const car = { kind: 'train' as const, side: 'real' as const, x: 1200, w: 170, h: 220, speed: 260, trigger: 700, lane: 1 as const };
    const hit = session({ obstacles: [car] });
    hit.moveLane(1);
    runTo(hit, 1300);
    expect(hit.failure?.reason).toBe('train');
    const safe = session({ obstacles: [car] });
    runTo(safe, 1300);
    expect(safe.state).toBe('running');
  });
});

describe('approaching hazards', () => {
  it('falling crates drop once the runner is within their trigger distance', () => {
    const s = session({ obstacles: [{ kind: 'falling', side: 'real', x: 1000, w: 58, h: 60, y: 420, trigger: 520 }] });
    runTo(s, 470);
    expect(s.obstacleStates[0].triggeredAt).toBe(-1);
    runTo(s, 490);
    expect(s.obstacleStates[0].triggeredAt).toBeGreaterThan(0);
    runTo(s, 1100);
    expect(s.failure?.reason).toBe('falling');
  });
});

describe('lane items', () => {
  it('items are collected only in their lane', () => {
    const items = [
      { kind: 'coin' as const, side: 'real' as const, x: 400, y: 40, lane: -1 as const },
      { kind: 'coin' as const, side: 'real' as const, x: 500, y: 40 },
      { kind: 'coin' as const, side: 'real' as const, x: 700, y: 40, lane: 1 as const },
    ];
    const s = session({ collectibles: items });
    runTo(s, 800);
    expect(s.coins).toBe(1);
    const left = session({ collectibles: items });
    left.moveLane(-1);
    runTo(left, 800);
    expect(left.coins).toBe(1);
    expect(left.collected[0]).toBe(1);
  });
});

describe('campaign lanes', () => {
  it('every world asks for lane changes', () => {
    for (let w = 0; w < 6; w++) {
      const lanes = LEVELS.filter((l) => l.worldId === w).flatMap((l) => l.obstacles.filter((o) => o.lane !== undefined));
      expect(lanes.length, `world ${w + 1}`).toBeGreaterThan(10);
    }
  });
});

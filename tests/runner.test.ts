import { describe, expect, it } from 'vitest';

import { SpeedProfile } from '../src/game/systems/RunnerSystem';
import { PHYSICS, SIM_STEP } from '../src/game/utils/Constants';
import { runTo, session, steps } from './helpers';

describe('automatic runner movement', () => {
  it('runs forward on its own at the level speed', () => {
    const s = session();
    steps(s, 60);
    expect(s.x).toBeCloseTo(300, 0);
    expect(s.speed).toBeCloseTo(300, 5);
  });

  it('keeps both forms at the same horizontal position and on the ground', () => {
    const s = session();
    steps(s, 120);
    expect(s.physical.h).toBe(0);
    expect(s.shadow.h).toBe(0);
    expect(s.physical.onGround && s.shadow.onGround).toBe(true);
  });

  it('accelerates smoothly over the level and inside speed sections', () => {
    const profile = new SpeedProfile(300, 400, 10000, [{ x0: 4000, x1: 5000, mult: 1.5 }]);
    expect(profile.speedAt(0)).toBeCloseTo(300);
    expect(profile.speedAt(10000)).toBeCloseTo(400);
    let previous = profile.speedAt(0);
    for (let x = 100; x < 3800; x += 100) {
      const v = profile.speedAt(x);
      expect(v).toBeGreaterThanOrEqual(previous);
      expect(v - previous).toBeLessThan(5);
      previous = v;
    }
    expect(profile.speedAt(4500)).toBeCloseTo(profile.speedAt(4500) / 1.5 * 1.5);
    expect(profile.speedAt(4500)).toBeGreaterThan(profile.speedAt(3500) * 1.4);
  });

  it('knows when the runner reaches any distance', () => {
    const profile = new SpeedProfile(300, 300, 6000);
    expect(profile.timeAt(3000)).toBeCloseTo(10, 1);
    const s = session();
    runTo(s, 1500);
    expect(s.t).toBeCloseTo(profile.timeAt(s.x), 1);
  });
});

describe('jump physics', () => {
  it('jumps to the expected height and lands again', () => {
    const s = session();
    s.jump(1);
    let apex = 0;
    for (let i = 0; i < 90; i++) {
      s.step(SIM_STEP);
      apex = Math.max(apex, s.physical.h);
    }
    const expected = (PHYSICS.jumpMax * PHYSICS.jumpMax) / (2 * PHYSICS.gravity);
    expect(apex).toBeGreaterThan(expected * 0.95);
    expect(apex).toBeLessThan(expected * 1.05);
    expect(s.physical.onGround).toBe(true);
    expect(s.physical.h).toBe(0);
  });

  it('jumps lower with a short swipe or an early release', () => {
    const high = session();
    high.jump(1);
    const low = session();
    low.jump(0);
    let hiApex = 0;
    let loApex = 0;
    for (let i = 0; i < 60; i++) {
      high.step(SIM_STEP);
      low.step(SIM_STEP);
      if (i === 3) low.releaseJump();
      hiApex = Math.max(hiApex, high.physical.h);
      loApex = Math.max(loApex, low.physical.h);
    }
    expect(loApex).toBeLessThan(hiApex * 0.6);
  });

  it('only jumps with the active form', () => {
    const s = session();
    s.jump(1);
    steps(s, 10);
    expect(s.physical.h).toBeGreaterThan(50);
    expect(s.shadow.h).toBe(0);
  });

  it('buffers a jump pressed just before landing', () => {
    const s = session();
    s.jump(0);
    // Wait until falling, a few frames above the ground.
    for (let i = 0; i < 200 && !(s.physical.vy < 0 && s.physical.h < 30); i++) s.step(SIM_STEP);
    expect(s.physical.onGround).toBe(false);
    s.jump(0);
    steps(s, 12);
    expect(s.physical.jumps).toBe(2);
  });

  it('allows a jump shortly after running off an edge (coyote time)', () => {
    const s = session({ obstacles: [{ kind: 'pit', side: 'real', x: 600, w: 400 }] });
    runTo(s, 600 + 12 + 3);
    expect(s.physical.onGround).toBe(false);
    s.jump(1);
    s.step(SIM_STEP);
    expect(s.physical.vy).toBeGreaterThan(0);
  });
});

describe('slide state', () => {
  it('slides for a limited time with a smaller body', () => {
    const s = session();
    s.slide();
    s.step(SIM_STEP);
    expect(s.physical.sliding).toBe(true);
    expect(s.physical.animation).toBe('slide');
    steps(s, Math.ceil(PHYSICS.slideTime / SIM_STEP) + 2);
    expect(s.physical.sliding).toBe(false);
  });

  it('a jump cancels the slide', () => {
    const s = session();
    s.slide();
    steps(s, 5);
    s.jump(0);
    s.step(SIM_STEP);
    expect(s.physical.sliding).toBe(false);
    expect(s.physical.onGround).toBe(false);
  });

  it('passes under a low ceiling only while sliding', () => {
    const level = { obstacles: [{ kind: 'ceiling' as const, side: 'real' as const, x: 600, w: 120 }] };
    const standing = session(level);
    runTo(standing, 800);
    expect(standing.state).toBe('hit');
    expect(standing.failure?.reason).toBe('ceiling');

    const sliding = session(level);
    runTo(sliding, 560);
    sliding.slide();
    runTo(sliding, 800);
    expect(sliding.state).toBe('running');
  });

  it('slide in the air drops quickly', () => {
    const s = session();
    s.jump(1);
    steps(s, 12);
    const h = s.physical.h;
    s.slide();
    steps(s, 6);
    expect(s.physical.h).toBeLessThan(h - 80);
  });
});

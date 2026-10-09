import { describe, expect, it } from 'vitest';

import { HIT_PAUSE } from '../src/game/systems/RunSession';
import { SWITCH_COOLDOWN, SIM_STEP } from '../src/game/utils/Constants';
import { runTo, session, steps } from './helpers';

describe('world switching', () => {
  it('switches the active form and keeps the shared position', () => {
    const s = session();
    steps(s, 30);
    const x = s.x;
    expect(s.active).toBe('real');
    expect(s.switchForm()).toBe(true);
    expect(s.active).toBe('shadow');
    expect(s.shadow.active).toBe(true);
    expect(s.physical.active).toBe(false);
    expect(s.x).toBe(x);
    expect(s.events.some((e) => e.type === 'switch' && e.to === 'shadow')).toBe(true);
  });

  it('can switch while jumping, and each form keeps its own vertical motion', () => {
    const s = session();
    s.jump(1);
    steps(s, 8);
    const h = s.physical.h;
    s.switchForm();
    steps(s, 2);
    expect(s.active).toBe('shadow');
    // The physical form finishes its jump as an echo.
    expect(s.physical.h).toBeGreaterThan(h);
    expect(s.shadow.h).toBe(0);
  });
});

describe('switch cooldown', () => {
  it('blocks a second switch within the cooldown', () => {
    const s = session();
    expect(s.switchForm()).toBe(true);
    expect(s.switchForm()).toBe(false);
    expect(s.events.some((e) => e.type === 'switchBlocked')).toBe(true);
    expect(s.active).toBe('shadow');
    steps(s, Math.ceil(SWITCH_COOLDOWN / SIM_STEP) + 1);
    expect(s.switchForm()).toBe(true);
    expect(s.active).toBe('real');
    expect(s.switcher.count).toBe(2);
  });

  it('locks switching once the level is complete', () => {
    const s = session({ length: 400 });
    runTo(s, 500);
    expect(s.state).toBe('complete');
    expect(s.switchForm()).toBe(false);
  });
});

describe('physical collisions', () => {
  const wall = { kind: 'wall' as const, side: 'real' as const, x: 600, w: 70, h: 300 };

  it('a tall wall stops the physical form', () => {
    const s = session({ obstacles: [wall] });
    runTo(s, 800);
    expect(s.state).toBe('hit');
    expect(s.failure).toMatchObject({ reason: 'wall', form: 'real' });
  });

  it('the inactive form is an echo and passes everything in its world', () => {
    const s = session({ obstacles: [wall] });
    s.switchForm();
    runTo(s, 800);
    expect(s.state).toBe('running');
  });

  it('a low crate can be jumped', () => {
    const s = session({ obstacles: [{ kind: 'wall', side: 'real', x: 600, w: 56, h: 64 }] });
    runTo(s, 520);
    s.jump(1);
    runTo(s, 800);
    expect(s.state).toBe('running');
  });

  it('falling into a pit is a failure', () => {
    const s = session({ obstacles: [{ kind: 'pit', side: 'real', x: 600, w: 300 }] });
    runTo(s, 900);
    expect(s.failure?.reason).toBe('fell');
  });

  it('respawns at the last checkpoint while lives remain, then fails', () => {
    const s = session({ obstacles: [wall], checkpoints: [300] }, 2);
    runTo(s, 800);
    expect(s.state).toBe('hit');
    expect(s.lives).toBe(1);
    steps(s, Math.ceil(HIT_PAUSE / SIM_STEP) + 1);
    expect(s.state).toBe('running');
    expect(s.x).toBeGreaterThanOrEqual(300);
    expect(s.x).toBeLessThan(330);
    runTo(s, 800);
    steps(s, Math.ceil(HIT_PAUSE / SIM_STEP) + 1);
    expect(s.state).toBe('failed');
    expect(s.damage).toBe(2);
  });
});

describe('shadow walls', () => {
  it('the shadow passes straight through a shadow wall', () => {
    const s = session({
      obstacles: [
        { kind: 'wall', side: 'real', x: 600, w: 70, h: 300 },
        { kind: 'shadowWall', side: 'shadow', x: 600, w: 70, h: 300 },
      ],
    });
    s.switchForm();
    runTo(s, 900);
    expect(s.state).toBe('running');
  });

  it('a solid rock in the shadow world still blocks the shadow', () => {
    const s = session({ obstacles: [{ kind: 'wall', side: 'shadow', x: 600, w: 56, h: 64, style: 'rock' }] });
    s.switchForm();
    runTo(s, 900);
    expect(s.failure).toMatchObject({ reason: 'wall', form: 'shadow' });
  });
});

describe('light zones', () => {
  const lightLevel = { obstacles: [{ kind: 'lightZone' as const, side: 'shadow' as const, x: 600, w: 200 }] };

  it('destroy the active shadow', () => {
    const s = session(lightLevel);
    s.switchForm();
    runTo(s, 900);
    expect(s.failure).toMatchObject({ reason: 'light', form: 'shadow' });
  });

  it('cannot be jumped over', () => {
    const s = session(lightLevel);
    s.switchForm();
    runTo(s, 560);
    s.jump(1);
    runTo(s, 900);
    expect(s.failure?.reason).toBe('light');
  });

  it('are harmless to the physical form', () => {
    const s = session(lightLevel);
    runTo(s, 900);
    expect(s.state).toBe('running');
  });

  it('pulsing lights follow their cycle and are in the designed state on arrival', () => {
    const s = session({
      obstacles: [{ kind: 'lightZone', side: 'shadow', x: 600, w: 60, cycle: { period: 2, duty: 0.5, arrive: 'off' } }],
    });
    s.switchForm();
    runTo(s, 800);
    expect(s.state).toBe('running');
    const on = session({
      obstacles: [{ kind: 'lightZone', side: 'shadow', x: 600, w: 60, cycle: { period: 2, duty: 0.5, arrive: 'on' } }],
    });
    on.switchForm();
    runTo(on, 800);
    expect(on.failure?.reason).toBe('light');
  });
});

describe('eclipse zones', () => {
  it('make both forms solid and jump together', () => {
    const s = session({ eclipses: [{ x0: 300, x1: 1200 }] });
    runTo(s, 400);
    expect(s.eclipse).toBe(true);
    expect(s.isSolid('real') && s.isSolid('shadow')).toBe(true);
    s.jump(1);
    steps(s, 10);
    expect(s.physical.h).toBeGreaterThan(50);
    expect(s.shadow.h).toBeGreaterThan(50);
  });
});

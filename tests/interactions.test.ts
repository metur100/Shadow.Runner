import { describe, expect, it } from 'vitest';

import { runTo, session, steps } from './helpers';

describe('cross-world switches', () => {
  const gateLevel = {
    switches: [{ id: 'lever', kind: 'lever' as const, side: 'real' as const, x: 400 }],
    obstacles: [
      { id: 'gate', kind: 'gate' as const, side: 'shadow' as const, x: 1000, w: 34 },
      { kind: 'wall' as const, side: 'real' as const, x: 990, w: 60, h: 300 },
    ],
    interactions: [{ trigger: 'lever', effects: [{ action: 'open' as const, target: 'gate' }], description: 'lever opens gate' }],
  };

  it('a lever pulled by the physical form opens the gate in the shadow world', () => {
    const s = session(gateLevel);
    runTo(s, 700);
    expect(s.switchesOn[0]).toBe(1);
    expect(s.obstacleStates[0].open).toBe(true);
    s.switchForm();
    runTo(s, 1200);
    expect(s.state).toBe('running');
  });

  it('without the lever the shadow is blocked by the closed gate', () => {
    const s = session(gateLevel);
    s.switchForm();
    runTo(s, 1200);
    expect(s.failure).toMatchObject({ reason: 'gate', form: 'shadow' });
  });

  it('only the active form of the switch’s own world triggers it', () => {
    const s = session(gateLevel);
    s.switchForm();
    runTo(s, 700);
    expect(s.switchesOn[0]).toBe(0);
  });

  it('a shadow plate builds a bridge in the reality world', () => {
    const s = session({
      switches: [{ id: 'plate', kind: 'plate', side: 'shadow', x: 400 }],
      obstacles: [
        { kind: 'pit', side: 'real', x: 900, w: 420 },
        { id: 'bridge', kind: 'platform', side: 'real', x: 890, w: 440, y: 0, hidden: true },
      ],
      interactions: [{ trigger: 'plate', effects: [{ action: 'show', target: 'bridge' }], description: 'plate builds bridge' }],
    });
    s.switchForm();
    runTo(s, 600);
    expect(s.obstacleStates[1].hidden).toBe(false);
    steps(s, 20);
    s.switchForm();
    runTo(s, 1500);
    expect(s.state).toBe('running');
  });

  it('a street lamp above switches on a light zone below', () => {
    const s = session({
      switches: [{ id: 'lamp', kind: 'lamp', side: 'real', x: 400 }],
      obstacles: [{ id: 'glow', kind: 'lightZone', side: 'shadow', x: 900, w: 200, off: true }],
      interactions: [{ trigger: 'lamp', effects: [{ action: 'on', target: 'glow' }], description: 'lamp lights the shadow world' }],
    });
    runTo(s, 600);
    expect(s.obstacleStates[0].off).toBe(false);
    s.switchForm();
    runTo(s, 1200);
    expect(s.failure?.reason).toBe('light');
  });

  it('a key collected in one world opens a door in the other', () => {
    const s = session({
      collectibles: [{ id: 'key', kind: 'key', side: 'shadow', x: 400, y: 50 }],
      obstacles: [{ id: 'door', kind: 'gate', side: 'real', x: 1000, w: 40 }],
      interactions: [{ trigger: 'key', effects: [{ action: 'open', target: 'door' }], description: 'key opens door' }],
    });
    s.switchForm();
    runTo(s, 600);
    expect(s.keys).toBe(1);
    s.switchForm();
    runTo(s, 1300);
    expect(s.state).toBe('running');
  });

  it('timed effects revert after their duration', () => {
    const s = session({
      switches: [{ id: 'lever', kind: 'lever', side: 'real', x: 300 }],
      obstacles: [{ id: 'gate', kind: 'gate', side: 'shadow', x: 2500, w: 34 }],
      interactions: [{ trigger: 'lever', effects: [{ action: 'open', target: 'gate', duration: 2 }], description: 'timed' }],
    });
    runTo(s, 400);
    expect(s.obstacleStates[0].open).toBe(true);
    steps(s, 150);
    expect(s.obstacleStates[0].open).toBe(false);
  });

  it('tapping the character activates a switch within reach', () => {
    const s = session({
      switches: [{ id: 'lever', kind: 'lever', side: 'real', x: 400 }],
      obstacles: [{ id: 'gate', kind: 'gate', side: 'shadow', x: 1000, w: 34 }],
      interactions: [{ trigger: 'lever', effects: [{ action: 'open', target: 'gate' }], description: 'lever' }],
    });
    expect(s.interact()).toBe(false);
    runTo(s, 320);
    expect(s.interact()).toBe(true);
    expect(s.obstacleStates[0].open).toBe(true);
  });
});

describe('portal activation', () => {
  it('a phase portal swaps the active form without counting as a player switch', () => {
    const s = session({ portals: [{ id: 'p', side: 'real', x: 500, kind: 'phase' }, { id: 'exit', side: 'real', x: 3000, kind: 'exit' }] });
    runTo(s, 600);
    expect(s.active).toBe('shadow');
    expect(s.portalsUsed[0]).toBe(1);
    expect(s.switcher.count).toBe(0);
  });

  it('missing a required portal fails', () => {
    const s = session({ portals: [{ id: 'p', side: 'real', x: 500, kind: 'phase', required: true }, { id: 'exit', side: 'real', x: 3000, kind: 'exit' }] });
    s.switchForm();
    runTo(s, 700);
    expect(s.failure?.reason).toBe('missedPortal');
  });

  it('reaching the exit portal completes the level', () => {
    const s = session({ length: 900 });
    runTo(s, 1000);
    expect(s.state).toBe('complete');
    expect(s.events.some((e) => e.type === 'complete')).toBe(true);
  });
});

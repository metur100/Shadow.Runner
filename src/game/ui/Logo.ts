import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import { drawRunner } from '../rendering/CharacterRenderer';
import { addText } from './Typography';

/**
 * "Shadow Runner" wordmark: SHADOW in violet over RUNNER in warm orange, split by a glowing line, with
 * the runner above and its shadow mirrored below.
 */
export function drawLogo(scene: Phaser.Scene, x: number, y: number, scale: number, animate = true): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const line = scene.add.graphics();
  line.fillStyle(0xffffff, 0.9);
  line.fillRoundedRect(-260, -4, 520, 8, 4);
  line.fillStyle(0x9fe8ff, 0.4);
  line.fillRoundedRect(-280, -10, 560, 20, 10);
  const top = addText(scene, 0, -62, 'SHADOW', { size: 104, weight: '700', color: '#fff8ec', stroke: '#6b4cff', strokeThickness: 14 });
  const bottom = addText(scene, 0, 62, 'RUNNER', { size: 104, weight: '700', color: '#1d1838', stroke: '#ff8a3d', strokeThickness: 14 });
  const runner = scene.add.graphics();
  const shade = scene.add.graphics();
  runner.setPosition(250, -122).setScale(0.75);
  shade.setPosition(250, 122).setScale(0.75, -0.75);
  c.add([line, top, bottom, runner, shade]);
  c.setScale(scale);
  let t = 0;
  const draw = (dt: number) => {
    t += dt;
    runner.clear();
    shade.clear();
    const phase = t * 11;
    drawRunner(runner, { side: 'real', anim: 'run', phase, time: t, colors: [0xff8a3d, 0x2ec4b6, 0xfff1d6], glow: 0.6 });
    drawRunner(shade, { side: 'shadow', anim: 'run', phase, time: t, colors: [0x2b1f5c, 0x9a7bff, 0x9fe8ff], glow: 0.6 });
  };
  draw(0);
  if (animate && !GameContext.reducedMotion) {
    const handler = (_time: number, delta: number) => draw(delta / 1000);
    scene.events.on('update', handler);
    c.once('destroy', () => scene.events.off('update', handler));
  }
  return c;
}

import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import { addText } from './Typography';

function gradientFill(text: Phaser.GameObjects.Text, stops: [number, string][]): void {
  const g = text.context.createLinearGradient(0, 0, 0, text.height);
  for (const [at, color] of stops) g.addColorStop(at, color);
  text.setFill(g);
}

/**
 * "SHADOW RUNNER" wordmark: a bold white SHADOW over an electric-blue RUNNER, slanted for speed, with a
 * glowing underline and the tagline "Switch realities. Master both worlds."
 */
export function drawLogo(scene: Phaser.Scene, x: number, y: number, scale: number, animate = true): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const glow = scene.add.graphics();
  glow.fillStyle(0x4f7dff, 0.18);
  glow.fillEllipse(0, 10, 640, 260);
  const style = { size: 112, weight: 'italic 700', stroke: '#0b0822', strokeThickness: 16, shadow: true } as const;
  const top = addText(scene, -14, -58, 'SHADOW', { ...style, color: '#ffffff' });
  gradientFill(top, [
    [0, '#ffffff'],
    [0.7, '#f1ecff'],
    [1, '#c9bfff'],
  ]);
  const bottom = addText(scene, 18, 52, 'RUNNER', { ...style, color: '#5a8cff' });
  gradientFill(bottom, [
    [0, '#9fc2ff'],
    [0.45, '#4f7dff'],
    [1, '#3a4fe0'],
  ]);
  const line = scene.add.graphics();
  line.fillStyle(0x9fe8ff, 0.35);
  line.fillRoundedRect(-250, 118, 500, 14, 7);
  line.fillStyle(0xffffff, 0.95);
  line.fillRoundedRect(-230, 122, 460, 5, 2.5);
  const tag = addText(scene, 0, 160, 'SWITCH REALITIES · MASTER BOTH WORLDS', { size: 24, weight: '700', color: '#fff8ec', stroke: '#0b0822', strokeThickness: 6 });
  tag.setLetterSpacing(3);
  c.add([glow, top, bottom, line, tag]);
  c.setScale(scale);
  if (animate && !GameContext.reducedMotion) {
    scene.tweens.add({ targets: line, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, scaleX: 1.06, scaleY: 1.06, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  return c;
}

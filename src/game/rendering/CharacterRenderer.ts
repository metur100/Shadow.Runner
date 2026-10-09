import type Phaser from 'phaser';

import type { AnimationState } from '../entities/RunnerForm';
import type { Side } from '../levels/LevelDefinition';

export interface RunnerPose {
  side: Side;
  anim: AnimationState;
  /** Running cycle phase (radians, increases with distance). */
  phase: number;
  /** Seconds, for idle motion (scarf flutter, flame flicker). */
  time: number;
  /** Cosmetic colours: physical = hood, scarf, face; shadow = body, glow, eyes. */
  colors: [number, number, number];
  /** Celebrating (results screen): arms up. */
  cheer?: boolean;
  /** 0..1 strength of the outline (active form glows). */
  glow?: number;
}

const INK = 0x1d1838;

/**
 * The runner: an original hooded character with a curled hood tip, a visor face and a long scarf.
 * The physical form is warm and solid; the shadow form shares the silhouette but is dark with a glowing
 * edge, glowing eyes and a scarf made of wisps. Drawn with vector graphics every frame (two characters
 * only), with the feet at (0, 0) and up being negative y. The design is about 86 units tall.
 */
export function drawRunner(g: Phaser.GameObjects.Graphics, pose: RunnerPose): void {
  const shadow = pose.side === 'shadow';
  const [c0, c1, c2] = pose.colors;
  const t = pose.time;
  const ph = pose.phase;

  let lean = 0.14;
  let legA = Math.sin(ph) * 0.75;
  let legB = -legA;
  let armA = -Math.sin(ph) * 0.9;
  let armB = -armA;
  let bodyY = -Math.abs(Math.cos(ph)) * 3;
  let crouch = 0;
  switch (pose.anim) {
    case 'jump':
      legA = -0.9;
      legB = 0.5;
      armA = -2.4;
      armB = -2.0;
      lean = 0.05;
      bodyY = 0;
      break;
    case 'fall':
      legA = 0.25;
      legB = -0.35;
      armA = -2.7;
      armB = -0.6;
      lean = 0.02;
      bodyY = 0;
      break;
    case 'slide':
      crouch = 1;
      break;
    case 'idle':
      legA = 0.1;
      legB = -0.1;
      armA = 0.2;
      armB = -0.2;
      lean = 0;
      bodyY = Math.sin(t * 3) * 1.5;
      break;
    case 'hit':
      lean = -0.5;
      armA = -2.6;
      armB = -1.2;
      break;
    case 'run':
      break;
  }
  if (pose.cheer) {
    armA = -2.8;
    armB = -2.6;
    lean = 0;
  }

  const body = shadow ? c0 : c0;
  const limb = shadow ? c0 : mixInk(c0, 0.35);
  const glowColor = shadow ? c1 : 0xffffff;
  const glow = pose.glow ?? 0;

  if (crouch) {
    drawSlide(g, pose, body, limb, glowColor, glow);
    return;
  }

  const hipY = -30 + bodyY;
  const shoulderY = -58 + bodyY;
  const headX = 6 + lean * 30;
  const headY = -70 + bodyY;

  // Scarf behind everything.
  drawScarf(g, shadow, c1, -4 + lean * 20, shoulderY + 2, t, pose.anim, 1);

  // Glow outline for the active form.
  if (glow > 0) {
    g.fillStyle(glowColor, 0.22 * glow);
    g.fillEllipse(lean * 14, hipY - 12, 52, 66);
    g.fillCircle(headX, headY, 27);
  }

  // Back leg and arm (darker).
  leg(g, -2, hipY, legB, shadow ? mixInk(c0, 0.2) : mixInk(limb, 0.25));
  arm(g, lean * 20 - 4, shoulderY + 4, armB, shadow ? mixInk(c0, 0.2) : mixInk(limb, 0.25));

  // Body (rounded torso).
  g.fillStyle(body, 1);
  g.fillEllipse(lean * 14, hipY - 14, 36, 44);
  if (!shadow) {
    // Hood front panel and belt.
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(lean * 14 + 6, hipY - 18, 14, 28);
    g.fillStyle(INK, 0.5);
    g.fillRect(lean * 14 - 17, hipY - 2, 34, 5);
  } else {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeEllipse(lean * 14, hipY - 14, 36, 44);
  }

  // Head with hood.
  g.fillStyle(body, 1);
  g.fillCircle(headX, headY, 19);
  // Hood tip: a curl sweeping back – the character's signature shape.
  g.beginPath();
  g.moveTo(headX - 12, headY - 13);
  g.lineTo(headX - 26, headY - 30);
  g.lineTo(headX - 6, headY - 18);
  g.closePath();
  g.fillPath();
  g.fillCircle(headX - 26, headY - 30, 5);
  if (shadow) {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeCircle(headX, headY, 19);
    // Flickering flame tips on the hood.
    const f = Math.sin(t * 14) * 2;
    g.fillStyle(c1, 0.8);
    g.fillTriangle(headX - 26, headY - 34 + f, headX - 31, headY - 26, headX - 21, headY - 27);
  }
  // Visor face.
  const faceX = headX + 3;
  g.fillStyle(shadow ? mixInk(c0, 0.5) : c2, 1);
  g.fillRoundedRect(faceX - 6, headY - 9, 20, 15, 7);
  // Eyes.
  if (shadow) {
    g.fillStyle(c2, 0.35);
    g.fillCircle(faceX + 2, headY - 2, 6);
    g.fillCircle(faceX + 10, headY - 2, 6);
    g.fillStyle(c2, 1);
  } else {
    g.fillStyle(INK, 1);
  }
  const blink = !shadow && Math.sin(t * 1.3) > 0.985;
  if (blink) {
    g.fillRect(faceX - 1, headY - 2, 6, 2);
    g.fillRect(faceX + 7, headY - 2, 6, 2);
  } else {
    g.fillEllipse(faceX + 2, headY - 2, 4.5, pose.anim === 'hit' ? 2 : 6.5);
    g.fillEllipse(faceX + 10, headY - 2, 4.5, pose.anim === 'hit' ? 2 : 6.5);
  }

  // Front leg and arm.
  leg(g, 4, hipY, legA, limb);
  arm(g, lean * 20 + 2, shoulderY + 4, armA, limb);
  if (shadow) {
    // Wisps rising from the shadow's feet.
    g.fillStyle(c1, 0.35);
    g.fillCircle(-10 + Math.sin(t * 7) * 3, -4, 4);
    g.fillCircle(8 + Math.cos(t * 6) * 3, -8, 3);
  }
}

function drawSlide(g: Phaser.GameObjects.Graphics, pose: RunnerPose, body: number, limb: number, glowColor: number, glow: number): void {
  const shadow = pose.side === 'shadow';
  const [c0, c1, c2] = pose.colors;
  drawScarf(g, shadow, c1, -8, -30, pose.time, 'slide', 0.8);
  if (glow > 0) {
    g.fillStyle(glowColor, 0.22 * glow);
    g.fillEllipse(0, -20, 76, 40);
  }
  // Legs forward along the ground.
  g.fillStyle(limb, 1);
  g.fillRoundedRect(4, -12, 36, 10, 5);
  g.fillRoundedRect(-2, -8, 30, 9, 4);
  // Torso leaning back.
  g.fillStyle(body, 1);
  g.fillEllipse(-6, -20, 42, 26);
  // Head.
  g.fillCircle(-18, -32, 17);
  g.beginPath();
  g.moveTo(-28, -42);
  g.lineTo(-46, -48);
  g.lineTo(-24, -32);
  g.closePath();
  g.fillPath();
  g.fillCircle(-46, -48, 4.5);
  if (shadow) {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeEllipse(-6, -20, 42, 26);
    g.strokeCircle(-18, -32, 17);
  }
  g.fillStyle(shadow ? mixInk(c0, 0.5) : c2, 1);
  g.fillRoundedRect(-14, -40, 18, 13, 6);
  g.fillStyle(shadow ? c2 : INK, 1);
  g.fillEllipse(-8, -34, 4, 5.5);
  g.fillEllipse(-1, -34, 4, 5.5);
  // Slide sparks.
  g.fillStyle(shadow ? c1 : 0xffe08a, 0.8);
  for (let i = 0; i < 3; i++) g.fillCircle(-30 - i * 10 + Math.sin(pose.time * 20 + i) * 3, -3, 3 - i * 0.6);
}

function leg(g: Phaser.GameObjects.Graphics, x: number, hipY: number, angle: number, color: number): void {
  const len = 28;
  const kx = x + Math.sin(angle) * len * 0.55;
  const ky = hipY + Math.cos(angle) * len * 0.55;
  const knee = Math.max(0, -angle) * 0.9;
  const fx = kx + Math.sin(angle - knee) * len * 0.5;
  const fy = Math.min(0, ky + Math.cos(angle - knee) * len * 0.5);
  thick(g, x, hipY, kx, ky, 10, color);
  thick(g, kx, ky, fx, fy, 9, color);
  g.fillStyle(INK, 1);
  g.fillEllipse(fx + 4, fy - 2, 15, 8);
}

function arm(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, color: number): void {
  const len = 22;
  const ex = x + Math.sin(angle) * len;
  const ey = y + Math.cos(angle) * len;
  thick(g, x, y, ex, ey, 8, color);
  g.fillStyle(color, 1);
  g.fillCircle(ex, ey, 5);
}

function thick(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number): void {
  g.lineStyle(width, color, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.fillStyle(color, 1);
  g.fillCircle(x1, y1, width / 2);
  g.fillCircle(x2, y2, width / 2);
}

/** The long scarf (physical) or trail of wisps (shadow), fluttering behind the runner. */
function drawScarf(g: Phaser.GameObjects.Graphics, shadow: boolean, color: number, x: number, y: number, t: number, anim: AnimationState, scale: number): void {
  const segs = 7;
  const lift = anim === 'jump' ? 6 : anim === 'fall' ? -10 : 0;
  let px = x;
  let py = y;
  for (let i = 1; i <= segs; i++) {
    const nx = x - i * 9 * scale;
    const ny = y + Math.sin(t * 13 - i * 0.9) * i * 1.3 + lift * (i / segs) + i * 1.2;
    const w = (shadow ? 9 : 8) * (1 - (i / segs) * 0.55) * scale;
    if (shadow) {
      g.fillStyle(color, 0.75 * (1 - i / (segs + 1)));
      g.fillCircle(nx, ny, w * 0.7);
    } else {
      g.lineStyle(w, color, 1);
      g.lineBetween(px, py, nx, ny);
      g.fillStyle(color, 1);
      g.fillCircle(nx, ny, w / 2);
    }
    px = nx;
    py = ny;
  }
  if (!shadow) {
    g.fillStyle(color, 1);
    g.fillRoundedRect(x - 8, y - 6, 18, 10, 4);
  }
}

function mixInk(c: number, t: number): number {
  const ch = (s: number) => Math.round(((c >> s) & 255) * (1 - t) + ((INK >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

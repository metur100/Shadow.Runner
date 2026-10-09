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
const SKIN = 0xe9b08a;

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

  // Head: face in profile with spiky hair swept back.
  const hairColor = shadow ? mixInk(c0, 0.6) : 0x1f1a2e;
  g.fillStyle(shadow ? body : SKIN, 1);
  g.fillCircle(headX, headY, 17);
  g.fillStyle(hairColor, 1);
  g.slice(headX, headY, 18, Math.PI * 0.95, Math.PI * 1.9, false);
  g.fillPath();
  const sway = pose.anim === 'run' ? Math.sin(t * 10) * 1.5 : 0;
  const spikes: [number, number, number, number][] = [
    [-14, -8, -30, -12],
    [-10, -14, -24, -28],
    [-3, -17, -12, -34],
    [5, -17, 4, -33],
    [11, -12, 16, -25],
  ];
  for (const [bx, by, tx, ty] of spikes) g.fillTriangle(headX + bx - 5, headY + by + 4, headX + bx + 5, headY + by + 2, headX + tx + sway, headY + ty);
  g.fillRect(headX - 18, headY - 6, 8, 12);
  if (shadow) {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeCircle(headX, headY, 17);
    const f = Math.sin(t * 14) * 2;
    g.fillStyle(c1, 0.8);
    g.fillTriangle(headX - 30, headY - 14 + f, headX - 24, headY - 8, headX - 22, headY - 16);
  }
  // Eye (and an ear) facing the run.
  const faceX = headX + 6;
  if (!shadow) {
    g.fillStyle(mixInk(SKIN, 0.15), 1);
    g.fillEllipse(headX - 4, headY + 2, 6, 8);
  }
  if (shadow) {
    g.fillStyle(c2, 0.35);
    g.fillCircle(faceX + 3, headY - 2, 6);
    g.fillStyle(c2, 1);
  } else {
    g.fillStyle(INK, 1);
  }
  const blink = !shadow && Math.sin(t * 1.3) > 0.985;
  if (blink) g.fillRect(faceX, headY - 2, 7, 2);
  else g.fillEllipse(faceX + 3, headY - 2, 4.5, pose.anim === 'hit' ? 2 : 7);
  if (!shadow) {
    g.lineStyle(2, INK, 0.7);
    g.lineBetween(faceX + 2, headY + 8, faceX + 7, headY + 7);
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
  // Head with spiky hair.
  g.fillStyle(shadow ? body : SKIN, 1);
  g.fillCircle(-18, -32, 15);
  g.fillStyle(shadow ? mixInk(c0, 0.6) : 0x1f1a2e, 1);
  g.slice(-18, -32, 16, Math.PI * 0.95, Math.PI * 1.9, false);
  g.fillPath();
  for (const [tx, ty] of [[-46, -40], [-40, -54], [-28, -58]]) g.fillTriangle(-30, -36, -20, -46, tx, ty);
  if (shadow) {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeEllipse(-6, -20, 42, 26);
    g.strokeCircle(-18, -32, 17);
  }
  g.fillStyle(shadow ? c2 : INK, 1);
  g.fillEllipse(-9, -33, 4, 6);
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

/**
 * The runner seen from behind (chase camera): spiky hair, hoodie with an emblem on the back, scarf
 * tails, dark trousers and sneakers. The shadow form is a dark silhouette with a glowing rim and wisps.
 * Feet at (0, 0), up is negative y; about 92 units tall.
 */
export function drawRunnerBack(g: Phaser.GameObjects.Graphics, pose: RunnerPose): void {
  const shadow = pose.side === 'shadow';
  const [c0, c1] = pose.colors;
  const t = pose.time;
  const ph = pose.phase;
  const glow = pose.glow ?? 0;
  const rim = shadow ? c1 : 0xffffff;
  const hoodie = shadow ? mixInk(c0, 0.35) : c0;
  const pants = shadow ? mixInk(c0, 0.6) : 0x23243a;
  const skin = shadow ? mixInk(c0, 0.45) : 0xe9b08a;
  const hair = shadow ? mixInk(c0, 0.7) : 0x1f1a2e;
  const shoe = shadow ? c1 : 0xf4f1e8;

  let liftL = Math.max(0, Math.sin(ph));
  let liftR = Math.max(0, -Math.sin(ph));
  let armL = Math.sin(ph);
  let armR = -armL;
  let bob = -Math.abs(Math.cos(ph)) * 3;
  let spread = 0;
  let tilt = 0;
  switch (pose.anim) {
    case 'jump':
      liftL = 0.9;
      liftR = 0.5;
      armL = -1.4;
      armR = -1.4;
      bob = 0;
      spread = 6;
      break;
    case 'fall':
      liftL = 0.2;
      liftR = 0.35;
      armL = -1;
      armR = -1;
      bob = 0;
      spread = 10;
      break;
    case 'idle':
      liftL = liftR = 0;
      armL = armR = 0;
      bob = Math.sin(t * 3) * 1.5;
      break;
    case 'hit':
      tilt = 0.25;
      armL = -1.6;
      armR = -0.8;
      break;
    default:
      break;
  }
  if (pose.cheer) {
    armL = armR = -2;
  }
  if (pose.anim === 'slide') {
    drawSlideBack(g, pose, hoodie, pants, hair, rim, glow);
    return;
  }

  const hipY = -40 + bob;
  const shoulderY = -68 + bob;
  const headY = -82 + bob;
  const lean = tilt * 30;

  if (glow > 0) {
    g.fillStyle(rim, (shadow ? 0.18 : 0.1) * glow);
    g.fillEllipse(lean * 0.5, -46 + bob, 56, 96);
  }
  // Ground contact shadow is drawn by the lane; here: legs.
  const leg = (dx: number, lift: number) => {
    const knee = hipY + 22 - lift * 6;
    const foot = -lift * 22;
    g.fillStyle(pants, 1);
    g.fillRoundedRect(dx - 7, hipY, 14, knee - hipY + 4, 6);
    g.fillRoundedRect(dx - 6 + spread * Math.sign(dx) * 0.3, knee, 12, Math.max(6, foot - knee), 5);
    // Sole of the sneaker shows when the foot kicks back.
    g.fillStyle(shoe, 1);
    g.fillEllipse(dx + spread * Math.sign(dx) * 0.3, foot - 3, 17, lift > 0.3 ? 13 : 9);
    g.fillStyle(shadow ? c1 : 0xe0565b, lift > 0.3 ? 1 : 0.8);
    g.fillEllipse(dx + spread * Math.sign(dx) * 0.3, foot - 3, 12, lift > 0.3 ? 6 : 4);
  };
  // The lifted leg is further away: draw it first.
  if (liftL > liftR) {
    leg(-9 - spread, liftL);
    leg(9 + spread, liftR);
  } else {
    leg(9 + spread, liftR);
    leg(-9 - spread, liftL);
  }

  const arm = (dir: number, swing: number) => {
    const sx = dir * 19 + lean;
    const hx = sx + dir * (6 + Math.max(0, -swing) * 10);
    const hy = shoulderY + 30 - swing * 14 - Math.max(0, -swing) * 8;
    g.lineStyle(10, hoodie, 1);
    g.lineBetween(sx, shoulderY + 4, hx, hy);
    g.fillStyle(skin, 1);
    g.fillCircle(hx, hy + 2, 5.5);
  };
  arm(-1, armL);
  arm(1, armR);

  // Torso: hoodie with the emblem.
  g.fillStyle(hoodie, 1);
  g.fillRoundedRect(-20 + lean, shoulderY - 2, 40, hipY - shoulderY + 10, 12);
  g.fillStyle(shadow ? mixInk(c0, 0.55) : mixInk(c0, 0.25), 1);
  g.fillRoundedRect(-19 + lean, hipY - 2, 38, 9, 4);
  if (shadow) {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeRoundedRect(-20 + lean, shoulderY - 2, 40, hipY - shoulderY + 10, 12);
  } else {
    // A white lightning emblem on the back.
    g.fillStyle(0xffffff, 0.9);
    const ex = lean;
    const ey = shoulderY + 14;
    g.fillTriangle(ex + 3, ey - 7, ex - 6, ey + 2, ex + 1, ey + 1);
    g.fillTriangle(ex - 3, ey + 9, ex + 6, ey - 1, ex - 1, ey - 1);
  }
  // Hood bunched behind the neck.
  g.fillStyle(shadow ? mixInk(c0, 0.5) : mixInk(c0, 0.15), 1);
  g.fillEllipse(lean, shoulderY + 2, 30, 14);
  // Scarf tails fluttering out to the side.
  const flutter = Math.sin(t * 13);
  for (let i = 1; i <= 5; i++) {
    const sx = lean + 8 + i * 6;
    const sy = shoulderY + 2 + i * 2 + Math.sin(t * 13 - i * 0.9) * i * 1.2 + flutter;
    if (shadow) {
      g.fillStyle(c1, 0.7 * (1 - i / 6));
      g.fillCircle(sx, sy, 5 - i * 0.6);
    } else {
      g.fillStyle(c1, 1);
      g.fillCircle(sx, sy, 4.5 - i * 0.5);
    }
  }

  // Head: back of the head with spiky hair.
  g.fillStyle(skin, 1);
  g.fillEllipse(lean - 13, headY + 2, 6, 9);
  g.fillEllipse(lean + 13, headY + 2, 6, 9);
  g.fillStyle(hair, 1);
  g.fillCircle(lean, headY, 14);
  const spikes: [number, number, number][] = [
    [-14, -2, -22],
    [-9, -12, -26],
    [-2, -16, -30],
    [6, -14, -27],
    [12, -6, -22],
    [15, 2, -12],
    [-16, 4, -10],
  ];
  for (const [sx, sy, len] of spikes) {
    const ang = Math.atan2(sy, sx);
    const tx = lean + Math.cos(ang) * Math.abs(len) * 0.9 + (pose.anim === 'run' ? Math.sin(t * 10 + sx) * 1 : 0);
    const ty = headY + Math.sin(ang) * Math.abs(len) * 0.9;
    g.fillTriangle(lean + sx * 0.6 - 5, headY + sy * 0.5, lean + sx * 0.6 + 5, headY + sy * 0.5, tx, ty);
  }
  if (shadow) {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeCircle(lean, headY, 14);
    g.fillStyle(c1, 0.35);
    g.fillCircle(-10 + Math.sin(t * 7) * 3, -4, 4);
    g.fillCircle(10 + Math.cos(t * 6) * 3, -8, 3);
  }
}

function drawSlideBack(g: Phaser.GameObjects.Graphics, pose: RunnerPose, hoodie: number, pants: number, hair: number, rim: number, glow: number): void {
  const shadow = pose.side === 'shadow';
  const c1 = pose.colors[1];
  if (glow > 0) {
    g.fillStyle(rim, (shadow ? 0.18 : 0.1) * glow);
    g.fillEllipse(0, -22, 76, 44);
  }
  // Knees forward, body low and leaning back.
  g.fillStyle(pants, 1);
  g.fillRoundedRect(-24, -14, 18, 14, 6);
  g.fillRoundedRect(6, -14, 18, 14, 6);
  g.fillStyle(hoodie, 1);
  g.fillRoundedRect(-22, -40, 44, 30, 12);
  g.lineStyle(9, hoodie, 1);
  g.lineBetween(-20, -32, -36, -10);
  g.lineBetween(20, -32, 36, -10);
  g.fillStyle(hair, 1);
  g.fillCircle(0, -46, 13);
  for (const sx of [-10, -3, 4, 11]) g.fillTriangle(sx - 5, -50, sx + 5, -50, sx * 1.6, -64);
  if (shadow) {
    g.lineStyle(2.5, c1, 0.9);
    g.strokeRoundedRect(-22, -40, 44, 30, 12);
  }
  g.fillStyle(shadow ? c1 : 0xffe08a, 0.8);
  for (let i = 0; i < 4; i++) g.fillCircle(-30 + i * 20 + Math.sin(pose.time * 20 + i) * 3, -2, 3);
}

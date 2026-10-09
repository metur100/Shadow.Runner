import type Phaser from 'phaser';

import type { Collectible } from '../entities/Collectible';
import { lightIntensity, lightState } from '../entities/LightZone';
import type { Obstacle, ObstacleState } from '../entities/Obstacle';
import { PORTAL_HEIGHT, type Portal } from '../entities/Portal';
import type { Switch } from '../entities/Switch';
import type { Side } from '../levels/LevelDefinition';
import { CURB, NEAR_Z, ROAD_HALF, type LaneCamera } from './Perspective';
import { mix, type LanePalette } from './Themes';

export interface RenderContext {
  cam: LaneCamera;
  pal: LanePalette;
  side: Side;
  highContrast: boolean;
  reducedMotion: boolean;
  portalColors: [number, number, number];
}

const HAZARD = 0xffd23d;
const DANGER = 0xff4d5e;
const INK = 0x1d1838;
/** Solid things are cut off just behind the runner, so the runner is never hidden by what it passed. */
const BEHIND = 30;
/** Walls are drawn a little lower than their collision height (which only means "too high to jump"). */
const WALL_VIEW_H = 240;

function clipZ(cam: LaneCamera, x: number): number {
  return Math.max(cam.z(x), cam.z(cam.scroll - BEHIND), NEAR_Z);
}

/** A box spanning lateral l0..l1, world x0..x1 and height h0..h1: top or bottom face, then the front. */
function box(rc: RenderContext, g: Phaser.GameObjects.Graphics, l0: number, l1: number, x0: number, x1: number, h0: number, h1: number, front: number, top: number, alpha = 1): number {
  const cam = rc.cam;
  const zn = clipZ(cam, x0);
  const zf = cam.z(x1);
  if (zf <= zn) return -1;
  const eye = cam.eye + cam.lift;
  if (h1 < eye) {
    g.fillStyle(top, alpha);
    cam.flat(g, l0, l1, zn, zf, h1);
  } else if (h0 > eye) {
    g.fillStyle(mix(front, 0x000000, 0.35), alpha);
    cam.flat(g, l0, l1, zn, zf, h0);
  }
  g.fillStyle(front, alpha);
  cam.front(g, l0, l1, zn, h0, h1);
  return zn;
}

function outlineFront(rc: RenderContext, g: Phaser.GameObjects.Graphics, l0: number, l1: number, z: number, h0: number, h1: number, color: number): void {
  if (!rc.highContrast) return;
  const cam = rc.cam;
  g.lineStyle(4, color, 1);
  g.strokeRect(cam.sx(l0, z), cam.sy(h1, z), (l1 - l0) * cam.scale(z), (h1 - h0) * cam.scale(z));
}

/** Depth used to sort an obstacle against everything else in its lane. */
export function obstacleDepth(cam: LaneCamera, o: Obstacle, t: number, state: ObstacleState): number {
  let x = o.x;
  if (o.kind === 'train') x = o.trainX(t, state);
  else if (o.kind === 'platform') x = o.platformX(t, state);
  else if (o.kind === 'pendulum') x = o.pendulumBob(t).x - 30;
  return Math.max(cam.z(x), NEAR_Z);
}

/** Draws one obstacle into the lane's world layer. */
export function drawObstacle(rc: RenderContext, g: Phaser.GameObjects.Graphics, o: Obstacle, t: number, state: ObstacleState): void {
  const { cam, pal } = rc;
  const shadowSide = o.side === 'shadow';
  switch (o.kind) {
    case 'wall': {
      const style = o.def.style;
      const crate = style === 'crate';
      const stone = style === 'rock' || style === 'pillar' || style === 'ruin';
      const lw = crate || stone ? ROAD_HALF + 20 : CURB + 10;
      const front = crate ? 0xb07a46 : stone ? pal.solid : shadowSide ? pal.solid : 0xb5523f;
      const top = mix(front, 0xffffff, 0.2);
      const wh = Math.min(o.h, WALL_VIEW_H);
      const z = box(rc, g, -lw, lw, o.x, o.x + o.w, 0, wh, front, top);
      if (z < 0) return;
      const s = cam.scale(z);
      const x0 = cam.sx(-lw, z);
      const x1 = cam.sx(lw, z);
      const yTop = cam.sy(wh, z);
      const yBot = cam.sy(0, z);
      if (crate) {
        g.lineStyle(Math.max(1, 6 * s), 0x6b4423, 1);
        const cell = (x1 - x0) / 4;
        for (let i = 0; i < 4; i++) {
          g.strokeRect(x0 + i * cell, yTop, cell, yBot - yTop);
          g.lineBetween(x0 + i * cell, yTop, x0 + (i + 1) * cell, yBot);
        }
      } else {
        // Bricks / stone blocks.
        const row = 30 * s;
        g.fillStyle(mix(front, 0x000000, 0.25), 1);
        let r = 0;
        for (let y = yBot - row; y > yTop; y -= row, r++) {
          g.fillRect(x0, y, x1 - x0, Math.max(1, 3 * s));
          const brick = (stone ? 90 : 60) * s;
          for (let x = x0 + (r % 2) * brick * 0.5; x < x1; x += brick) g.fillRect(x, y, Math.max(1, 3 * s), row);
        }
        g.fillStyle(0xffffff, 0.12);
        g.fillRect(x0, yTop, x1 - x0, 8 * s);
        if (!shadowSide && !stone) {
          // Faded red cross: "no way through here".
          const cx = cam.cx;
          const cy = cam.sy(wh * 0.45, z);
          const k = 46 * s;
          g.lineStyle(Math.max(2, 14 * s), 0xe0565b, 0.75);
          g.lineBetween(cx - k, cy - k, cx + k, cy + k);
          g.lineBetween(cx + k, cy - k, cx - k, cy + k);
        }
      }
      outlineFront(rc, g, -lw, lw, z, 0, wh, HAZARD);
      break;
    }
    case 'shadowWall': {
      // The shadow's own wall: cracked and glowing, with a hole it phases through.
      const pulse = rc.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 3 + o.x * 0.01);
      const wh = Math.min(o.h, WALL_VIEW_H);
      const z = box(rc, g, -CURB - 10, CURB + 10, o.x, o.x + o.w, 0, wh, mix(pal.solid, pal.solidEdge, 0.25), mix(pal.solid, pal.solidEdge, 0.4), 0.55);
      if (z < 0) return;
      const s = cam.scale(z);
      const x0 = cam.sx(-CURB - 10, z);
      const x1 = cam.sx(CURB + 10, z);
      const yTop = cam.sy(wh, z);
      const yBot = cam.sy(0, z);
      g.fillStyle(mix(pal.solid, 0x000000, 0.3), 0.55);
      const row = 30 * s;
      for (let y = yBot - row, r = 0; y > yTop; y -= row, r++) {
        g.fillRect(x0, y, x1 - x0, Math.max(1, 3 * s));
        for (let x = x0 + (r % 2) * 30 * s; x < x1; x += 60 * s) g.fillRect(x, y, Math.max(1, 3 * s), row);
      }
      const cx = cam.cx;
      const cy = cam.sy(55, z);
      g.fillStyle(pal.solidEdge, 0.35 * pulse);
      g.fillEllipse(cx, cy, 190 * s, 200 * s);
      g.fillStyle(mix(pal.solidEdge, 0xffffff, 0.3), 0.55 * pulse);
      g.fillEllipse(cx, cy + 6 * s, 120 * s, 150 * s);
      g.lineStyle(Math.max(1, 3 * s), pal.solidEdge, 0.9 * pulse);
      g.strokeEllipse(cx, cy, 190 * s, 200 * s);
      break;
    }
    case 'ceiling': {
      const bottom = o.y;
      const beamH = 70;
      const front = shadowSide ? pal.solid : 0x3a3f55;
      const z = box(rc, g, -CURB, CURB, o.x, o.x + o.w, bottom, bottom + beamH, front, mix(front, 0xffffff, 0.15));
      if (z < 0) return;
      const s = cam.scale(z);
      // Posts at both curbs.
      g.fillStyle(mix(front, 0x000000, 0.2), 1);
      cam.front(g, -CURB - 16, -CURB + 8, z, 0, bottom + beamH);
      cam.front(g, CURB - 8, CURB + 16, z, 0, bottom + beamH);
      const x0 = cam.sx(-CURB, z);
      const x1 = cam.sx(CURB, z);
      const y0 = cam.sy(bottom + beamH * 0.62, z);
      const y1 = cam.sy(bottom, z);
      if (shadowSide) {
        g.fillStyle(pal.solidEdge, 1);
        const n = 16;
        const step = (x1 - x0) / n;
        for (let i = 0; i < n; i++) g.fillTriangle(x0 + i * step, y0, x0 + (i + 1) * step, y0, x0 + (i + 0.5) * step, y1 + 6 * s);
      } else {
        g.fillStyle(HAZARD, 1);
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.fillStyle(INK, 1);
        const step = 40 * s;
        for (let x = x0; x < x1; x += step) g.fillTriangle(x, y1, x + step * 0.5, y1, x + step * 0.9, y0);
      }
      outlineFront(rc, g, -CURB, CURB, z, bottom, bottom + beamH, HAZARD);
      break;
    }
    case 'spikes': {
      const base = shadowSide ? mix(pal.solidEdge, 0x000000, 0.35) : 0x8e9ab5;
      const tip = shadowSide ? pal.solidEdge : 0xffffff;
      const zn = clipZ(cam, o.x);
      const zf = cam.z(o.x + o.w);
      if (zf <= zn) return;
      g.fillStyle(shadowSide ? pal.solid : 0x4a5570, 1);
      cam.flat(g, -CURB, CURB, zn, zf, 2);
      const rows = Math.max(1, Math.round(o.w / 45));
      for (let r = rows - 1; r >= 0; r--) {
        const z = zn + ((zf - zn) * (r + 0.5)) / rows;
        const s = cam.scale(z);
        const n = 14;
        const x0 = cam.sx(-CURB, z);
        const w = (cam.sx(CURB, z) - x0) / n;
        const y = cam.sy(0, z);
        const h = o.h * s;
        for (let i = 0; i < n; i++) {
          g.fillStyle(base, 1);
          g.fillTriangle(x0 + i * w, y, x0 + (i + 1) * w, y, x0 + (i + 0.5) * w, y - h);
          g.fillStyle(tip, 0.9);
          g.fillTriangle(x0 + (i + 0.35) * w, y - h * 0.45, x0 + (i + 0.65) * w, y - h * 0.45, x0 + (i + 0.5) * w, y - h);
        }
        if (rc.highContrast && r === 0) {
          g.lineStyle(3, DANGER, 1);
          g.lineBetween(x0, y - h, x0 + n * w, y - h);
        }
      }
      break;
    }
    case 'pit': {
      const zn = Math.max(cam.z(o.x), NEAR_Z);
      const zf = cam.z(o.x + o.w);
      if (zf <= zn) return;
      const wide = CURB + 900;
      if (o.def.style === 'water') {
        g.fillStyle(0x1a7f8f, 1);
        cam.flat(g, -wide, wide, zn, zf, -6);
        g.fillStyle(0xbffcf2, 0.7);
        const off = rc.reducedMotion ? 0 : Math.sin(t * 2) * 20;
        for (let k = 0; k < 6; k++) {
          const zk = zn + ((zf - zn) * (k + 0.5)) / 6;
          cam.flat(g, -ROAD_HALF + off + k * 20, -ROAD_HALF + 60 + off + k * 20, zk - 4, zk + 4, -6);
          cam.flat(g, 40 - off, 110 - off, zk - 4, zk + 4, -6);
        }
      } else {
        g.fillStyle(shadowSide ? 0x030208 : mix(pal.ground, 0x000000, 0.75), 1);
        cam.flat(g, -wide, wide, zn, zf);
        // The far wall of the hole.
        g.fillStyle(shadowSide ? mix(pal.solid, pal.solidEdge, 0.15) : mix(pal.ground, 0x000000, 0.45), 1);
        cam.quad(g, -wide, zf, 0, wide, zf, 0, wide, zf, -140, -wide, zf, -140);
        g.fillStyle(shadowSide ? pal.solidEdge : pal.groundTop, 1);
        cam.flat(g, -wide, wide, zf, zf + 6);
        if (zn > NEAR_Z) cam.flat(g, -wide, wide, zn - 6, zn);
        if (shadowSide || o.def.style === 'void') {
          g.fillStyle(pal.detail, 0.4 + 0.4 * Math.abs(Math.sin(t * 2)));
          for (let k = 0; k < 8; k++) {
            const zk = zn + ((zf - zn) * ((k * 0.37) % 1));
            const lat = ((k * 53) % 260) - 130;
            g.fillCircle(cam.sx(lat, zk), cam.sy(-40, zk), Math.max(1, 3 * cam.scale(zk)));
          }
        }
      }
      break;
    }
    case 'platform': {
      if (state.hidden) return;
      const visible = o.isActive(t, state);
      let alpha = 1;
      if (o.def.cycle) {
        const ending = o.cycleOn(t) && o.cyclePhase(t) > o.def.cycle.duty - 0.12;
        alpha = visible ? (ending && !rc.reducedMotion ? 0.5 + 0.5 * Math.sin(t * 40) : 1) : 0.15;
      }
      const x = o.platformX(t, state);
      const top = o.platformTop(t, state);
      const style = o.def.style;
      if (style === 'bridge' || style === 'shadowBridge') {
        const zn = Math.max(cam.z(x), NEAR_Z);
        const zf = cam.z(x + o.w);
        if (zf <= zn) return;
        const wood = style === 'bridge';
        g.fillStyle(wood ? 0x8a5a32 : pal.solidEdge, wood ? 1 : 0.45);
        cam.flat(g, -ROAD_HALF, ROAD_HALF, zn, zf, top);
        g.fillStyle(wood ? 0xc98b4f : mix(pal.solidEdge, 0xffffff, 0.4), wood ? 1 : 0.6);
        for (let k = 0; k < o.w; k += 30) {
          const za = cam.z(x + k + 4);
          if (za <= NEAR_Z) continue;
          cam.flat(g, -ROAD_HALF + 6, ROAD_HALF - 6, za, za + 20, top);
        }
        g.fillStyle(wood ? 0x5b3a1e : pal.solidEdge, 1);
        cam.side(g, -ROAD_HALF, zn, zf, top, top + 40);
        cam.side(g, ROAD_HALF, zn, zf, top, top + 40);
        return;
      }
      const thick = style === 'stone' ? 26 : 20;
      const front = style === 'phase' ? pal.solidEdge : style === 'stone' ? 0xb98a55 : pal.solid;
      const topC = style === 'phase' ? mix(pal.solidEdge, 0xffffff, 0.35) : style === 'stone' ? 0xe0bf86 : shadowSide ? mix(pal.solid, pal.solidEdge, 0.5) : pal.groundTop;
      const z = box(rc, g, -ROAD_HALF, ROAD_HALF, x, x + o.w, top - thick, top, front, topC, style === 'phase' ? alpha * 0.7 : alpha);
      if (z > 0 && style === 'elevator') {
        g.lineStyle(Math.max(1, 3 * cam.scale(z)), INK, 0.6);
        for (const l of [-ROAD_HALF + 20, ROAD_HALF - 20]) g.lineBetween(cam.sx(l, z), cam.sy(top, z), cam.sx(l, z), cam.sy(top + 900, z));
      }
      if (z > 0) outlineFront(rc, g, -ROAD_HALF, ROAD_HALF, z, top - thick, top, 0xffffff);
      break;
    }
    case 'blade': {
      const style = o.def.style;
      const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
      const dy = o.def.motion?.axis === 'y' ? o.motionOffset(t, state) : 0;
      if (style === 'sign') {
        const z = box(rc, g, -ROAD_HALF - 20, ROAD_HALF + 20, o.x + dx, o.x + dx + o.w, o.y + dy, o.y + dy + o.h, 0x1f1a46, 0x2b2470);
        if (z < 0) return;
        const s = cam.scale(z);
        g.fillStyle(0xff3db8, 1);
        g.fillRect(cam.sx(-ROAD_HALF, z), cam.sy(o.y + dy + o.h - 16, z), ROAD_HALF * 2 * s, 8 * s);
        g.fillStyle(pal.detail, 1);
        g.fillRect(cam.sx(-ROAD_HALF, z), cam.sy(o.y + dy + o.h * 0.45, z), ROAD_HALF * 1.2 * s, 8 * s);
        g.lineStyle(Math.max(1, 3 * s), INK, 0.8);
        for (const l of [-ROAD_HALF * 0.5, ROAD_HALF * 0.5]) g.lineBetween(cam.sx(l, z), cam.sy(o.y + dy + o.h, z), cam.sx(l, z), cam.sy(o.y + dy + 800, z));
        outlineFront(rc, g, -ROAD_HALF - 20, ROAD_HALF + 20, z, o.y + dy, o.y + dy + o.h, DANGER);
        return;
      }
      const z = Math.max(cam.z(o.x + o.w / 2 + dx), cam.z(cam.scroll - BEHIND));
      if (z <= NEAR_Z) return;
      const s = cam.scale(z);
      const cx = cam.cx;
      if (style === 'silhouette') {
        const yb = cam.sy(o.y + dy, z);
        const yt = cam.sy(o.y + dy + o.h, z);
        const hw = 60 * s;
        g.fillStyle(0x05030a, 0.95);
        g.fillPoints([{ x: cx - hw, y: yb }, { x: cx - hw * 0.6, y: yt + 26 * s }, { x: cx + hw * 0.6, y: yt + 26 * s }, { x: cx + hw, y: yb }], true);
        g.fillCircle(cx, yt + 16 * s, 18 * s);
        g.fillStyle(pal.detail, 1);
        g.fillRect(cx - 8 * s, yt + 12 * s, 5 * s, 4 * s);
        g.fillRect(cx + 3 * s, yt + 12 * s, 5 * s, 4 * s);
        return;
      }
      const cy = cam.sy(o.y + dy, z);
      const r = (o.w / 2) * s;
      const gear = style === 'gear';
      const color = gear ? 0xc98b4f : style === 'thorn' ? mix(pal.solidEdge, 0x000000, 0.4) : 0xb8c4dc;
      if (gear) {
        g.lineStyle(Math.max(1, 5 * s), 0x3e2614, 1);
        g.lineBetween(cx, cy, cx, cam.sy(o.y + 900, z));
      }
      const teeth = gear ? 10 : 14;
      const rot = rc.reducedMotion ? 0 : t * (gear ? 2.5 : 9);
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2 + rot;
        const rr = i % 2 === 0 ? r : r * (gear ? 0.82 : 0.7);
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
      }
      g.fillStyle(color, 1);
      g.fillPoints(pts, true);
      g.fillStyle(mix(color, 0x000000, 0.35), 1);
      g.fillCircle(cx, cy, r * 0.32);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(cx - r * 0.15, cy - r * 0.15, r * 0.12);
      if (rc.highContrast) {
        g.lineStyle(4, DANGER, 1);
        g.strokeCircle(cx, cy, r);
      }
      return;
    }
    case 'laser': {
      const zn = clipZ(cam, o.x);
      const zf = cam.z(o.x + o.w);
      if (zf <= zn) return;
      const s = cam.scale(zn);
      const on = o.isActive(t, state);
      const warn = !on && !state.off && o.timeUntilOn(t) < 0.35;
      for (const l of [-ROAD_HALF - 30, ROAD_HALF + 10]) {
        g.fillStyle(0x2a2350, 1);
        cam.front(g, l, l + 20, zn, 0, 420);
        g.fillStyle(on ? DANGER : 0x5a5280, 1);
        for (let h = 30; h <= 400; h += 55) g.fillCircle(cam.sx(l + 10, zn), cam.sy(h, zn), 5 * s);
      }
      if (on) {
        const flick = rc.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 50);
        g.fillStyle(DANGER, 0.18 * flick);
        cam.front(g, -ROAD_HALF - 10, ROAD_HALF + 10, zn, 0, 420);
        for (let h = 30; h <= 400; h += 55) {
          g.fillStyle(DANGER, 0.55 * flick);
          cam.front(g, -ROAD_HALF - 10, ROAD_HALF + 10, zn, h - 5, h + 5);
          g.fillStyle(0xffd6dc, flick);
          cam.front(g, -ROAD_HALF - 10, ROAD_HALF + 10, zn, h - 1.5, h + 1.5);
        }
      } else {
        g.fillStyle(DANGER, warn ? (Math.sin(t * 40) > 0 ? 0.9 : 0.2) : 0.3);
        for (let h = 30; h <= 400; h += 55) {
          for (let l = -ROAD_HALF; l < ROAD_HALF; l += 40) cam.front(g, l, l + 18, zn, h - 1.5, h + 1.5);
        }
      }
      break;
    }
    case 'lightZone': {
      const ls = lightState(o, t, state);
      const intensity = rc.reducedMotion && ls === 'on' ? 0.9 : lightIntensity(o, t, state);
      const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
      const x = o.x + dx;
      const zn = clipZ(cam, x);
      const zf = cam.z(x + o.w);
      if (zf <= zn) return;
      const warm = 0xfff1a8;
      const a = ls === 'off' ? 0.06 : intensity;
      const top = 700;
      // A column of light pouring onto the street, with a bright pool on the ground.
      g.fillStyle(0xffc64a, 0.55 * a);
      cam.flat(g, -CURB, CURB, zn, zf, 1);
      g.fillStyle(warm, 0.22 * a);
      cam.side(g, -CURB, zn, zf, 0, top);
      cam.side(g, CURB, zn, zf, 0, top);
      g.fillStyle(warm, 0.3 * a);
      cam.front(g, -CURB, CURB, zn, 0, top);
      g.fillStyle(0xffffff, 0.28 * a);
      const s = cam.scale(zn);
      for (let k = 0; k < 7; k++) {
        const l = -CURB + 30 + k * 68 + (rc.reducedMotion ? 0 : Math.sin(t * 3 + k) * 8);
        cam.front(g, l, l + 10 + (k % 3) * 6, zn, 0, top);
      }
      // Edges and a sun mark, so the light reads without colour too.
      const edgeA = ls === 'off' ? 0.3 : ls === 'warning' ? Math.min(1, intensity + 0.3) : 1;
      g.fillStyle(rc.highContrast ? 0xffffff : warm, edgeA);
      cam.front(g, -CURB - 4, -CURB + 4, zn, 0, top);
      cam.front(g, CURB - 4, CURB + 4, zn, 0, top);
      const sx = cam.cx;
      const sy = cam.sy(330, zn);
      g.fillCircle(sx, sy, 14 * s);
      g.lineStyle(Math.max(1, 4 * s), rc.highContrast ? 0xffffff : warm, edgeA);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        g.lineBetween(sx + Math.cos(ang) * 20 * s, sy + Math.sin(ang) * 20 * s, sx + Math.cos(ang) * 28 * s, sy + Math.sin(ang) * 28 * s);
      }
      if (o.def.style === 'lamp' || o.def.style === 'streetlight') {
        g.fillStyle(0x2f3b57, 1);
        cam.front(g, CURB + 10, CURB + 24, zn, 0, 360);
        cam.front(g, ROAD_HALF * 0.2, CURB + 24, zn, 350, 362);
      }
      break;
    }
    case 'falling': {
      const bottom = o.fallingBottom(t, state);
      const zn = clipZ(cam, o.x);
      const zf = cam.z(o.x + o.w);
      if (zf <= zn) return;
      if (state.triggeredAt < 0 || t - state.triggeredAt < 0.5) {
        const a = state.triggeredAt < 0 ? 1 : Math.max(0, 1 - (t - state.triggeredAt) * 2);
        g.fillStyle(0x000000, 0.3 * a);
        cam.flat(g, -ROAD_HALF * 0.6, ROAD_HALF * 0.6, zn, zf, 1);
        g.fillStyle(DANGER, a);
        const s = cam.scale(zn);
        const y = cam.sy(0, zn);
        g.fillTriangle(cam.cx - 12 * s, y - 20 * s, cam.cx + 12 * s, y - 20 * s, cam.cx, y - 42 * s);
      }
      const rock = o.def.style === 'rock';
      const z = box(rc, g, -ROAD_HALF * 0.6, ROAD_HALF * 0.6, o.x, o.x + o.w, bottom, bottom + o.h, rock ? pal.solid : 0xb07a46, rock ? mix(pal.solid, 0xffffff, 0.2) : 0xd09a5e);
      if (z > 0 && !rock) {
        g.lineStyle(Math.max(1, 5 * cam.scale(z)), 0x6b4423, 1);
        g.lineBetween(cam.sx(-ROAD_HALF * 0.6, z), cam.sy(bottom + o.h, z), cam.sx(ROAD_HALF * 0.6, z), cam.sy(bottom, z));
      }
      break;
    }
    case 'train': {
      const x = o.trainX(t, state);
      const lw = ROAD_HALF - 10;
      const z = box(rc, g, -lw, lw, x, x + o.w, 0, o.h, 0x2a2350, 0x3a3270);
      if (z < 0) return;
      const s = cam.scale(z);
      const x0 = cam.sx(-lw, z);
      const w = lw * 2 * s;
      g.fillStyle(pal.detail, 1);
      g.fillRect(x0, cam.sy(o.h * 0.42, z), w, 10 * s);
      g.fillStyle(0xbff4ff, 0.9);
      g.fillRect(x0 + 30 * s, cam.sy(o.h - 30, z), w - 60 * s, 70 * s);
      g.fillStyle(0xfff6a8, 1);
      g.fillCircle(x0 + 40 * s, cam.sy(40, z), 16 * s);
      g.fillCircle(x0 + w - 40 * s, cam.sy(40, z), 16 * s);
      g.fillStyle(0xfff6a8, 0.25);
      g.fillCircle(x0 + 40 * s, cam.sy(40, z), 36 * s);
      g.fillCircle(x0 + w - 40 * s, cam.sy(40, z), 36 * s);
      outlineFront(rc, g, -lw, lw, z, 0, o.h, DANGER);
      break;
    }
    case 'pendulum': {
      const bob = o.pendulumBob(t);
      const px = o.x + o.w / 2;
      const zp = cam.z(px);
      const zb = cam.z(bob.x);
      if (zp <= NEAR_Z || zb <= NEAR_Z || bob.x < cam.scroll - BEHIND) return;
      g.fillStyle(0x3e2614, 1);
      cam.front(g, -CURB, CURB, zp, o.y, o.y + 18);
      const sb = cam.scale(zb);
      const bx = cam.cx;
      const by = cam.sy(bob.y, zb);
      g.lineStyle(Math.max(1, 5 * cam.scale(zp)), 0x3e2614, 1);
      g.lineBetween(cam.cx, cam.sy(o.y, zp), bx, by);
      g.fillStyle(0xb8c4dc, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillTriangle(bx + Math.cos(a) * 26 * sb, by + Math.sin(a) * 26 * sb, bx + Math.cos(a + 0.3) * 26 * sb, by + Math.sin(a + 0.3) * 26 * sb, bx + Math.cos(a + 0.15) * 42 * sb, by + Math.sin(a + 0.15) * 42 * sb);
      }
      g.fillStyle(0x6b7a99, 1);
      g.fillCircle(bx, by, 30 * sb);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(bx - 9 * sb, by - 9 * sb, 8 * sb);
      if (rc.highContrast) {
        g.lineStyle(4, DANGER, 1);
        g.strokeCircle(bx, by, 32 * sb);
      }
      break;
    }
    case 'gate': {
      const closed = o.isActive(t, state);
      const zn = clipZ(cam, o.x);
      const zf = cam.z(o.x + o.w);
      if (zf <= zn) return;
      const s = cam.scale(zn);
      const door = o.def.style === 'door';
      const color = door ? 0xb98a55 : shadowSide ? pal.solidEdge : 0x5b6b8c;
      const lift = closed ? 0 : 380;
      // Frame.
      g.fillStyle(mix(color, 0x000000, 0.35), 1);
      cam.front(g, -CURB - 20, -CURB, zn, 0, 460);
      cam.front(g, CURB, CURB + 20, zn, 0, 460);
      cam.front(g, -CURB - 20, CURB + 20, zn, 440, 470);
      if (door) {
        g.fillStyle(color, 1);
        cam.front(g, -CURB, CURB, zn, lift, 440);
        g.fillStyle(0x6e4e2b, 1);
        for (let h = lift + 40; h < 440; h += 50) cam.front(g, -CURB, CURB, zn, h, h + 8);
      } else {
        g.fillStyle(color, shadowSide ? 0.85 : 1);
        for (let l = -CURB; l < CURB; l += 34) cam.front(g, l, l + 12, zn, lift, 440);
        cam.front(g, -CURB, CURB, zn, lift + 10, lift + 24);
        if (o.def.style === 'timed' || o.def.style === 'slide') {
          g.fillStyle(HAZARD, 1);
          cam.front(g, -CURB, CURB, zn, lift + 24, lift + 34);
        }
      }
      if (closed) {
        // Lock icon: closed gates are recognisable without colour.
        const lx = cam.cx;
        const ly = cam.sy(110, zn);
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(lx - 14 * s, ly - 10 * s, 28 * s, 22 * s, 4 * s);
        g.lineStyle(Math.max(1, 5 * s), 0xffffff, 1);
        g.beginPath();
        g.arc(lx, ly - 12 * s, 10 * s, Math.PI, 0, false);
        g.strokePath();
        if (rc.highContrast) outlineFront(rc, g, -CURB, CURB, zn, 0, 440, DANGER);
      }
      break;
    }
    case 'boost': {
      const zn = Math.max(cam.z(o.x), NEAR_Z);
      const zf = cam.z(o.x + o.w);
      if (zf <= zn) return;
      g.fillStyle(pal.detail, rc.reducedMotion ? 0.7 : 0.45 + 0.4 * Math.abs(Math.sin(t * 6)));
      for (let k = 20; k < o.w; k += 70) {
        const za = cam.z(o.x + k);
        if (za <= NEAR_Z) continue;
        cam.quad(g, -60, za, 1, 0, za + 30, 1, 0, za + 48, 1, -60, za + 18, 1);
        cam.quad(g, 0, za + 30, 1, 60, za, 1, 60, za + 18, 1, 0, za + 48, 1);
      }
      break;
    }
  }
}

/** Coins (reality), crystals (shadow) and keys, floating over the middle of the road. */
export function drawCollectible(rc: RenderContext, g: Phaser.GameObjects.Graphics, item: Collectible, t: number): void {
  const cam = rc.cam;
  const z = cam.z(item.x);
  if (z <= NEAR_Z || item.x < cam.scroll - BEHIND) return;
  const s = cam.scale(z);
  const bob = rc.reducedMotion ? 0 : Math.sin(t * 4 + item.x * 0.02) * 4;
  const x = cam.cx;
  const y = cam.sy(item.y + bob, z);
  const r = 17 * s;
  if (item.kind === 'coin') {
    const spin = rc.reducedMotion ? 1 : Math.max(0.15, Math.abs(Math.cos(t * 3 + item.x * 0.01)));
    g.fillStyle(0xffd36b, 0.25);
    g.fillCircle(x, y, r * 1.5);
    g.fillStyle(0xc98712, 1);
    g.fillEllipse(x, y + r * 0.08, r * 2 * spin, r * 2);
    g.fillStyle(0xffc83d, 1);
    g.fillEllipse(x, y, r * 1.7 * spin, r * 1.7);
    g.fillStyle(0xfff3a8, 1);
    g.fillEllipse(x - r * 0.2 * spin, y - r * 0.25, r * 0.6 * spin, r * 0.7);
    g.fillStyle(0xd99a1e, 1);
    g.fillRect(x - r * 0.12 * spin, y - r * 0.45, r * 0.24 * spin, r * 0.9);
  } else if (item.kind === 'crystal') {
    const pulse = rc.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 5 + item.x);
    g.fillStyle(0x9a7bff, 0.35 * pulse);
    g.fillCircle(x, y, r * 1.7);
    g.fillStyle(0x5236c9, 1);
    g.fillCircle(x, y, r);
    g.lineStyle(Math.max(1, 3 * s), 0xc9b8ff, 1);
    g.strokeCircle(x, y, r * 0.8);
    // Lightning mark.
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(x + r * 0.15, y - r * 0.6, x - r * 0.35, y + r * 0.1, x + r * 0.05, y + r * 0.05);
    g.fillTriangle(x - r * 0.15, y + r * 0.6, x + r * 0.35, y - r * 0.1, x - r * 0.05, y - r * 0.05);
  } else {
    g.fillStyle(0xffd36b, 0.3);
    g.fillCircle(x, y, r * 1.8);
    g.lineStyle(Math.max(1, 6 * s), 0xffd36b, 1);
    g.strokeCircle(x - r * 0.5, y, r * 0.5);
    g.fillStyle(0xffd36b, 1);
    g.fillRect(x - r * 0.05, y - r * 0.1, r * 1.1, r * 0.22);
    g.fillRect(x + r * 0.6, y, r * 0.18, r * 0.4);
    g.fillRect(x + r * 0.85, y, r * 0.18, r * 0.3);
  }
}

/** Levers and lamps stand on the right sidewalk, pressure plates lie in the road. */
export function drawSwitch(rc: RenderContext, g: Phaser.GameObjects.Graphics, sw: Switch, on: boolean): void {
  const { cam, pal } = rc;
  const z = cam.z(sw.x);
  if (z <= NEAR_Z || sw.x < cam.scroll - BEHIND - 40) return;
  const s = cam.scale(z);
  const accent = sw.side === 'real' ? 0xff8a3d : pal.solidEdge;
  switch (sw.kind) {
    case 'lever': {
      const x = cam.sx(ROAD_HALF + 45, z);
      const y = cam.sy(0, z);
      g.fillStyle(0x3a3355, 1);
      g.fillRoundedRect(x - 22 * s, y - 20 * s, 44 * s, 20 * s, 5 * s);
      const angle = on ? 0.7 : -0.7;
      const hx = x + Math.sin(angle) * 70 * s;
      const hy = y - 12 * s - Math.cos(angle) * 70 * s;
      g.lineStyle(Math.max(1, 8 * s), INK, 1);
      g.lineBetween(x, y - 12 * s, hx, hy);
      g.fillStyle(on ? 0x3bb273 : accent, 1);
      g.fillCircle(hx, hy, 14 * s);
      g.fillStyle(on ? 0x3bb273 : 0xffffff, 1);
      g.fillRoundedRect(x - 16 * s, y - 40 * s, 32 * s, 13 * s, 4 * s);
      break;
    }
    case 'plate': {
      const color = on ? 0x3bb273 : accent;
      const y0 = cam.sy(0, z - 55);
      const y1 = cam.sy(0, z + 55);
      const cy = (y0 + y1) / 2;
      const w = 130 * s;
      g.fillStyle(color, 0.3);
      g.fillEllipse(cam.cx, cy, w * 1.5, Math.abs(y0 - y1) * 1.5);
      g.fillStyle(INK, 0.6);
      g.fillEllipse(cam.cx, cy, w, Math.abs(y0 - y1));
      g.fillStyle(color, 1);
      g.fillEllipse(cam.cx, cy - (on ? 0 : 5 * s), w * 0.8, Math.abs(y0 - y1) * 0.8);
      g.lineStyle(Math.max(1, 3 * s), 0xffffff, 0.9);
      g.strokeEllipse(cam.cx, cy - (on ? 0 : 5 * s), w * 0.8, Math.abs(y0 - y1) * 0.8);
      break;
    }
    case 'lamp': {
      const x = cam.sx(ROAD_HALF + 40, z);
      const y = cam.sy(0, z);
      const top = cam.sy(200, z);
      const hx = cam.sx(ROAD_HALF - 40, z);
      if (on) {
        g.fillStyle(0xfff1a8, 0.3);
        g.fillTriangle(hx, top, cam.sx(-ROAD_HALF, z), y, cam.sx(ROAD_HALF, z), y);
      }
      g.fillStyle(0x2f3b57, 1);
      g.fillRect(x - 5 * s, top, 10 * s, y - top);
      g.fillRect(hx, top - 4 * s, x - hx, 8 * s);
      g.fillStyle(on ? 0xfff1a8 : 0x8e9ab5, 1);
      g.fillCircle(hx, top + 8 * s, 12 * s);
      break;
    }
  }
  if (rc.highContrast) {
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(cam.sx(sw.kind === 'plate' ? 0 : ROAD_HALF + 45, z), cam.sy(20, z), 30 * s);
  }
}

/** Phase portals stand in the road; the exit portal is a great ring spanning the street. */
export function drawPortal(rc: RenderContext, g: Phaser.GameObjects.Graphics, p: Portal, used: boolean, t: number): void {
  const cam = rc.cam;
  const z = cam.z(p.x);
  if (z <= NEAR_Z || p.x < cam.scroll - BEHIND) return;
  const s = cam.scale(z);
  const [a, b, glow] = rc.portalColors;
  const exit = p.isExit;
  const r = (exit ? 175 : PORTAL_HEIGHT * 0.55) * s;
  const cx = cam.cx;
  const cy = cam.sy(exit ? 165 : PORTAL_HEIGHT * 0.5, z);
  const alpha = used && !exit ? 0.35 : 1;
  const main = rc.side === 'real' ? b : a;
  g.fillStyle(main, 0.18 * alpha);
  g.fillCircle(cx, cy, r * 1.35);
  g.fillStyle(rc.side === 'real' ? 0x0b1640 : 0x12062a, 0.85 * alpha);
  g.fillEllipse(cx, cy, r * 1.7, r * 1.9);
  g.fillStyle(glow, 0.3 * alpha);
  g.fillEllipse(cx, cy, r * 1.2, r * 1.4);
  const spin = rc.reducedMotion ? 0 : t * 1.6;
  g.lineStyle(Math.max(1, 4 * s), glow, 0.8 * alpha);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(cx, cy, r * (0.3 + i * 0.17), spin + i * 2, spin + i * 2 + 2.4, false);
    g.strokePath();
  }
  g.lineStyle(Math.max(2, 14 * s), main, alpha);
  g.strokeEllipse(cx, cy, r * 1.8, r * 2);
  g.lineStyle(Math.max(1, 5 * s), 0xffffff, 0.8 * alpha);
  g.strokeEllipse(cx, cy, r * 1.8, r * 2);
  if (!exit) {
    // Arrow showing the swap direction (up = to reality, down = to the shadow).
    const down = p.side === 'real';
    const ty = cy - r * 1.15;
    g.fillStyle(0xffffff, alpha);
    g.fillTriangle(cx - 12 * s, down ? ty - 22 * s : ty, cx + 12 * s, down ? ty - 22 * s : ty, cx, down ? ty : ty - 22 * s);
  }
  // Ground glow.
  g.fillStyle(glow, 0.35 * alpha);
  g.fillEllipse(cx, cam.sy(0, z), r * 2.2, r * 0.35);
}

/** Checkpoint flag on the left sidewalk, with a glowing pad. */
export function drawCheckpoint(rc: RenderContext, g: Phaser.GameObjects.Graphics, x: number, lit: boolean, t: number): void {
  const cam = rc.cam;
  const z = cam.z(x);
  if (z <= NEAR_Z || x < cam.scroll - BEHIND - 60) return;
  const s = cam.scale(z);
  const [, b, glow] = rc.portalColors;
  const color = lit ? glow : rc.side === 'real' ? 0xffffff : 0x9a7bff;
  const px = cam.sx(-ROAD_HALF - 50, z);
  const py = cam.sy(0, z);
  const pulse = lit ? 0.6 + 0.3 * Math.sin(t * 4) : 0.3;
  g.fillStyle(lit ? b : 0x9fe8ff, pulse * 0.6);
  g.fillEllipse(px, py, 120 * s, 30 * s);
  g.lineStyle(Math.max(1, 4 * s), lit ? glow : 0x9fe8ff, pulse + 0.2);
  g.strokeEllipse(px, py, 90 * s, 22 * s);
  g.fillStyle(mix(color, 0x000000, 0.1), 1);
  g.fillRect(px - 3 * s, py - 170 * s, 6 * s, 170 * s);
  g.fillStyle(lit ? 0x3bb273 : 0xff8a3d, 1);
  const wave = rc.reducedMotion ? 0 : Math.sin(t * 6) * 4 * s;
  g.fillTriangle(px + 3 * s, py - 168 * s, px + 3 * s, py - 128 * s, px + 52 * s, py - 150 * s + wave);
  g.fillTriangle(px + 3 * s, py - 150 * s, px + 3 * s, py - 120 * s, px + 40 * s, py - 128 * s + wave);
}

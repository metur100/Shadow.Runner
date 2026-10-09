import Phaser from 'phaser';

import { lightIntensity, lightState } from '../entities/LightZone';
import type { Obstacle, ObstacleState } from '../entities/Obstacle';
import { GROUND_H } from './TextureFactory';
import { mix, type LanePalette } from './Themes';

export interface ObstacleView {
  root: Phaser.GameObjects.Container;
  update(t: number, state: ObstacleState): void;
}

export interface RenderContext {
  scene: Phaser.Scene;
  pal: LanePalette;
  /** Visible height above the ground line. */
  top: number;
  highContrast: boolean;
  reducedMotion: boolean;
}

const HAZARD = 0xffd23d;
const DANGER = 0xff4d5e;

function outline(g: Phaser.GameObjects.Graphics, rc: RenderContext, draw: () => void, color = 0xffffff): void {
  if (!rc.highContrast) return;
  g.lineStyle(4, color, 1);
  draw();
}

/**
 * Builds the display objects for one obstacle inside a lane's world container (x = world x,
 * y = −height). Static parts are drawn once; moving and blinking parts are updated through
 * transforms and alpha in `update`, never redrawn per frame.
 */
export function createObstacleView(rc: RenderContext, o: Obstacle): ObstacleView | null {
  const { scene, pal } = rc;
  const root = scene.add.container(o.x, 0);
  const g = scene.add.graphics();
  root.add(g);
  const shadowSide = o.side === 'shadow';
  let update: ObstacleView['update'] = () => undefined;

  switch (o.kind) {
    case 'wall': {
      const w = o.w;
      const h = o.h;
      const style = o.def.style;
      if (style === 'crate') {
        g.fillStyle(0x8a5a32, 1);
        g.fillRoundedRect(0, -h, w, h, 6);
        g.fillStyle(0xc98b4f, 1);
        g.fillRoundedRect(4, -h + 4, w - 8, h - 8, 4);
        g.lineStyle(5, 0x8a5a32, 1);
        g.lineBetween(6, -h + 6, w - 6, -6);
        g.lineBetween(w - 6, -h + 6, 6, -6);
      } else if (style === 'rock') {
        g.fillStyle(pal.solid, 1);
        g.fillPoints([{ x: 0, y: 0 }, { x: 6, y: -h * 0.8 }, { x: w * 0.5, y: -h }, { x: w - 4, y: -h * 0.7 }, { x: w, y: 0 }], true);
        g.lineStyle(3, pal.solidEdge, 0.9);
        g.strokePoints([{ x: 0, y: 0 }, { x: 6, y: -h * 0.8 }, { x: w * 0.5, y: -h }, { x: w - 4, y: -h * 0.7 }, { x: w, y: 0 }], false);
      } else if (style === 'pillar' || style === 'ruin') {
        g.fillStyle(pal.solid, 1);
        g.fillRect(4, -h, w - 8, h);
        g.fillStyle(mix(pal.solid, 0xffffff, 0.25), 1);
        g.fillRect(0, -h, w, 14);
        g.fillRect(0, -16, w, 16);
        g.fillStyle(mix(pal.solid, 0x000000, 0.2), 1);
        for (let x = 14; x < w - 8; x += 18) g.fillRect(x, -h + 16, 5, h - 34);
      } else {
        // Tall wall / building column with bricks and a warning stripe.
        g.fillStyle(pal.solid, 1);
        g.fillRoundedRect(0, -h, w, h, 6);
        g.fillStyle(mix(pal.solid, 0xffffff, 0.18), 1);
        g.fillRect(6, -h + 6, 6, h - 12);
        g.fillStyle(mix(pal.solid, 0x000000, 0.18), 1);
        for (let y = -h + 20; y < -10; y += 26) g.fillRect(6, y, w - 12, 3);
        g.lineStyle(4, pal.solidEdge, 1);
        g.strokeRoundedRect(0, -h, w, h, 6);
        // A diagonal warning band, high up so it never reads as spikes.
        g.fillStyle(HAZARD, 1);
        g.fillRect(4, -h * 0.62, w - 8, 18);
        g.fillStyle(0x1d1838, 1);
        for (let x = 4; x < w - 12; x += 16) g.fillTriangle(x, -h * 0.62 + 18, x + 8, -h * 0.62 + 18, x + 16, -h * 0.62);
      }
      outline(g, rc, () => g.strokeRect(0, -h, w, h), HAZARD);
      break;
    }
    case 'shadowWall': {
      const w = o.w;
      const h = o.h;
      g.fillStyle(pal.solidEdge, 0.16);
      g.fillRoundedRect(0, -h, w, h, 10);
      g.lineStyle(2, pal.solidEdge, 0.6);
      for (let y = -h + 16; y < 0; y += 24) {
        g.beginPath();
        g.moveTo(4, y);
        g.lineTo(w * 0.35, y - 8);
        g.lineTo(w * 0.7, y + 4);
        g.lineTo(w - 4, y - 6);
        g.strokePath();
      }
      g.lineStyle(3, pal.solidEdge, 0.85);
      g.strokeRoundedRect(0, -h, w, h, 10);
      if (!rc.reducedMotion) {
        update = (t) => {
          g.setAlpha(0.65 + 0.35 * Math.sin(t * 3 + o.x * 0.01));
        };
      }
      break;
    }
    case 'ceiling': {
      const w = o.w;
      const bottom = o.y;
      const height = rc.top - bottom + 20;
      if (shadowSide) {
        g.fillStyle(pal.solid, 1);
        g.fillRect(0, -rc.top - 20, w, height - 16);
        for (let x = 6; x < w; x += 16) g.fillTriangle(x - 8, -bottom - 18, x + 8, -bottom - 18, x, -bottom);
        g.lineStyle(3, pal.solidEdge, 0.9);
        g.lineBetween(0, -bottom - 18, w, -bottom - 18);
      } else {
        g.fillStyle(pal.solid, 1);
        g.fillRect(0, -rc.top - 20, w, height);
        g.fillStyle(HAZARD, 1);
        g.fillRect(0, -bottom - 18, w, 18);
        g.fillStyle(0x1d1838, 1);
        for (let x = 0; x < w; x += 24) g.fillTriangle(x, -bottom, x + 12, -bottom, x + 22, -bottom - 18);
      }
      outline(g, rc, () => g.strokeRect(0, -bottom - 18, w, 18), HAZARD);
      break;
    }
    case 'spikes': {
      const w = o.w;
      const h = o.h;
      const n = Math.max(2, Math.round(w / 22));
      const sw = w / n;
      const base = shadowSide ? mix(pal.solidEdge, 0x000000, 0.35) : 0x8e9ab5;
      const tip = shadowSide ? pal.solidEdge : 0xffffff;
      for (let i = 0; i < n; i++) {
        g.fillStyle(base, 1);
        g.fillTriangle(i * sw, 0, i * sw + sw, 0, i * sw + sw / 2, -h);
        g.fillStyle(tip, 0.9);
        g.fillTriangle(i * sw + sw * 0.35, -h * 0.45, i * sw + sw * 0.65, -h * 0.45, i * sw + sw / 2, -h);
      }
      g.fillStyle(shadowSide ? pal.solid : 0x5b6b8c, 1);
      g.fillRect(-2, -5, w + 4, 5);
      outline(g, rc, () => g.strokeTriangle(0, 0, w, 0, w / 2, -h), DANGER);
      if (shadowSide && !rc.reducedMotion) update = (t) => g.setAlpha(0.8 + 0.2 * Math.sin(t * 5));
      break;
    }
    case 'pit': {
      const w = o.w;
      const style = o.def.style;
      if (style === 'water') {
        g.fillStyle(0x1a7f8f, 1);
        g.fillRect(0, 0, w, GROUND_H + 4);
        g.fillStyle(0x2fb5a3, 1);
        g.fillRect(0, 10, w, 10);
        const waves = scene.add.graphics();
        waves.fillStyle(0xbffcf2, 0.85);
        for (let x = 0; x < w; x += 30) waves.fillEllipse(x + 15, 10, 22, 6);
        root.add(waves);
        if (!rc.reducedMotion) update = (t) => (waves.x = Math.sin(t * 2) * 6);
      } else {
        g.fillStyle(shadowSide ? 0x030208 : mix(pal.skyBottom, 0x000000, 0.55), 1);
        g.fillRect(0, -1, w, GROUND_H + 6);
        g.fillStyle(0x000000, 0.45);
        g.fillRect(0, GROUND_H * 0.4, w, GROUND_H * 0.7);
        g.fillStyle(shadowSide ? pal.solidEdge : pal.groundTop, 1);
        g.fillRect(-4, -2, 6, GROUND_H * 0.6);
        g.fillRect(w - 2, -2, 6, GROUND_H * 0.6);
        if (style === 'brokenBridge') {
          g.fillStyle(0x3a2a4a, 1);
          g.fillRect(-4, -6, w * 0.2, 8);
          g.fillRect(w * 0.82, -6, w * 0.2, 8);
          g.fillRect(w * 0.16, -6, 10, 26);
          g.fillRect(w * 0.82, -6, 10, 22);
        }
        if (shadowSide || style === 'void') {
          const sparks = scene.add.graphics();
          sparks.fillStyle(pal.detail, 0.8);
          for (let x = 12; x < w; x += 34) sparks.fillCircle(x, 18 + ((x * 7) % 20), 2);
          root.add(sparks);
          if (!rc.reducedMotion) update = (t) => sparks.setAlpha(0.4 + 0.6 * Math.abs(Math.sin(t * 2)));
        }
      }
      break;
    }
    case 'platform': {
      const w = o.w;
      const style = o.def.style;
      const deck = scene.add.graphics();
      const thickness = style === 'bridge' || style === 'shadowBridge' ? 14 : 18;
      if (style === 'shadowBridge') {
        deck.fillStyle(pal.solidEdge, 0.35);
        deck.fillRect(0, -2, w, thickness);
        deck.lineStyle(3, pal.solidEdge, 1);
        deck.strokeRect(0, -2, w, thickness);
        for (let x = 10; x < w; x += 28) deck.lineBetween(x, -2, x + 14, thickness - 2);
      } else if (style === 'bridge') {
        deck.fillStyle(0x8a5a32, 1);
        deck.fillRect(0, -2, w, thickness);
        deck.fillStyle(0xc98b4f, 1);
        for (let x = 0; x < w; x += 22) deck.fillRect(x + 2, 0, 18, thickness - 6);
        deck.lineStyle(3, 0x5b3a1e, 1);
        deck.lineBetween(0, -16, w, -16);
        for (let x = 0; x <= w; x += 44) deck.lineBetween(x, -16, x, -2);
      } else if (style === 'phase') {
        deck.fillStyle(pal.solidEdge, 0.55);
        deck.fillRoundedRect(0, 0, w, thickness, 8);
        deck.lineStyle(3, pal.detail, 1);
        deck.strokeRoundedRect(0, 0, w, thickness, 8);
      } else if (style === 'stone') {
        deck.fillStyle(0xb98a55, 1);
        deck.fillRoundedRect(0, 0, w, thickness + 6, 5);
        deck.lineStyle(2, 0x6e4e2b, 1);
        deck.lineBetween(w * 0.3, 0, w * 0.4, thickness + 6);
        deck.lineBetween(w * 0.7, 0, w * 0.62, thickness + 6);
      } else {
        const fill = shadowSide ? pal.solid : pal.solid;
        deck.fillStyle(fill, 1);
        deck.fillRoundedRect(0, 0, w, thickness, 6);
        deck.fillStyle(shadowSide ? pal.solidEdge : pal.groundTop, 1);
        deck.fillRoundedRect(0, 0, w, 6, 3);
        if (style === 'elevator') {
          deck.lineStyle(3, 0x1d1838, 0.6);
          deck.lineBetween(w * 0.2, 0, w * 0.2, -rc.top);
          deck.lineBetween(w * 0.8, 0, w * 0.8, -rc.top);
        }
      }
      if (rc.highContrast) {
        deck.lineStyle(4, 0xffffff, 1);
        deck.strokeRect(0, 0, w, thickness);
      }
      root.add(deck);
      g.destroy();
      update = (t, state) => {
        const visible = o.isActive(t, state);
        if (state.hidden) {
          deck.setVisible(false);
          return;
        }
        deck.setVisible(true);
        if (o.def.cycle) {
          // Phase platforms fade out, and flicker just before they vanish.
          const ending = o.cycleOn(t) && o.cyclePhase(t) > o.def.cycle.duty - 0.12;
          deck.setAlpha(visible ? (ending && !rc.reducedMotion ? 0.5 + 0.5 * Math.sin(t * 40) : 1) : 0.15);
        }
        deck.x = o.platformX(t, state) - o.x;
        deck.y = -o.platformTop(t, state);
      };
      update(0, o.initialState());
      return { root, update };
    }
    case 'blade': {
      const style = o.def.style;
      const part = scene.add.graphics();
      if (style === 'sign' || style === 'silhouette') {
        if (style === 'sign') {
          part.fillStyle(0x1f1a46, 1);
          part.fillRoundedRect(0, -o.h, o.w, o.h, 8);
          part.lineStyle(4, pal.detail, 1);
          part.strokeRoundedRect(0, -o.h, o.w, o.h, 8);
          part.fillStyle(0xff3db8, 1);
          part.fillRect(14, -o.h + 14, o.w - 28, 6);
          part.fillStyle(pal.detail, 1);
          part.fillRect(14, -o.h + 26, (o.w - 28) * 0.6, 6);
          part.lineStyle(3, 0x1d1838, 0.8);
          part.lineBetween(o.w * 0.25, -o.h, o.w * 0.25, -rc.top);
          part.lineBetween(o.w * 0.75, -o.h, o.w * 0.75, -rc.top);
        } else {
          part.fillStyle(0x05030a, 0.95);
          part.fillEllipse(o.w / 2, -o.h + 12, 26, 26);
          part.fillPoints([{ x: 0, y: 0 }, { x: o.w * 0.2, y: -o.h + 22 }, { x: o.w * 0.8, y: -o.h + 22 }, { x: o.w, y: 0 }], true);
          part.fillStyle(pal.detail, 1);
          part.fillRect(o.w / 2 - 6, -o.h + 10, 4, 3);
          part.fillRect(o.w / 2 + 3, -o.h + 10, 4, 3);
        }
        root.add(part);
        update = (t, state) => {
          const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
          const dy = o.def.motion?.axis === 'y' ? o.motionOffset(t, state) : 0;
          part.x = dx;
          part.y = -o.y - dy;
        };
      } else {
        const r = o.w / 2;
        const teeth = style === 'gear' ? 10 : 14;
        const color = style === 'gear' ? 0xc98b4f : style === 'thorn' ? mix(pal.solidEdge, 0x000000, 0.4) : 0xb8c4dc;
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * (style === 'gear' ? 0.82 : 0.7);
          pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
        }
        part.fillStyle(color, 1);
        part.fillPoints(pts, true);
        part.fillStyle(mix(color, 0x000000, 0.35), 1);
        part.fillCircle(0, 0, r * 0.32);
        part.fillStyle(0xffffff, 0.5);
        part.fillCircle(-r * 0.15, -r * 0.15, r * 0.12);
        if (style === 'gear') {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            part.fillStyle(mix(color, 0x000000, 0.2), 1);
            part.fillCircle(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.12);
          }
        }
        if (rc.highContrast) {
          part.lineStyle(4, DANGER, 1);
          part.strokeCircle(0, 0, r);
        }
        root.add(part);
        part.x = r;
        if (style === 'gear') {
          g.lineStyle(4, 0x3e2614, 1);
          g.lineBetween(r, -o.y, r, -rc.top);
        }
        update = (t, state) => {
          const dy = o.def.motion?.axis === 'y' ? o.motionOffset(t, state) : 0;
          const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
          part.x = r + dx;
          part.y = -o.y - dy;
          part.rotation = rc.reducedMotion ? 0 : t * (style === 'gear' ? 2.5 : 9);
        };
      }
      break;
    }
    case 'laser': {
      const w = o.w;
      g.fillStyle(0x2a2350, 1);
      g.fillRoundedRect(-8, -rc.top - 4, w + 16, 22, 6);
      g.fillRoundedRect(-8, -16, w + 16, 16, 6);
      g.fillStyle(DANGER, 1);
      g.fillCircle(w / 2, -rc.top + 12, 5);
      const beam = scene.add.graphics();
      beam.fillStyle(DANGER, 0.35);
      beam.fillRect(-8, -rc.top + 18, w + 16, rc.top - 34);
      beam.fillStyle(0xffd6dc, 1);
      beam.fillRect(w / 2 - 3, -rc.top + 18, 6, rc.top - 34);
      const ghost = scene.add.graphics();
      ghost.lineStyle(2, DANGER, 0.5);
      for (let y = -rc.top + 22; y < -20; y += 16) ghost.lineBetween(w / 2, y, w / 2, y + 6);
      root.add([ghost, beam]);
      update = (t, state) => {
        const on = o.isActive(t, state);
        const warn = !on && !state.off && o.timeUntilOn(t) < 0.35;
        beam.setVisible(on);
        if (on && !rc.reducedMotion) beam.setAlpha(0.85 + 0.15 * Math.sin(t * 50));
        ghost.setAlpha(warn ? (Math.sin(t * 40) > 0 ? 1 : 0.2) : 0.5);
      };
      break;
    }
    case 'lightZone': {
      const w = o.w;
      const style = o.def.style;
      const glow = scene.add.graphics();
      const cone = scene.add.graphics();
      const warm = 0xfff1a8;
      // Light pours down from above: a bright cone with a pool on the ground.
      const topW = style === 'lamp' ? w * 0.35 : style === 'beam' ? w * 0.8 : w * 0.7;
      cone.fillStyle(warm, 0.28);
      cone.fillPoints([{ x: (w - topW) / 2, y: -rc.top - 10 }, { x: (w + topW) / 2, y: -rc.top - 10 }, { x: w, y: 0 }, { x: 0, y: 0 }], true);
      cone.fillStyle(0xffffff, 0.22);
      cone.fillPoints([{ x: w / 2 - topW * 0.2, y: -rc.top - 10 }, { x: w / 2 + topW * 0.2, y: -rc.top - 10 }, { x: w * 0.7, y: 0 }, { x: w * 0.3, y: 0 }], true);
      glow.fillStyle(warm, 0.5);
      glow.fillEllipse(w / 2, -4, w * 1.1, 26);
      // Edges, so the light reads even in high contrast / without colour.
      const edge = scene.add.graphics();
      edge.lineStyle(rc.highContrast ? 5 : 3, rc.highContrast ? 0xffffff : warm, 0.9);
      edge.lineBetween((w - topW) / 2, -rc.top - 10, 0, 0);
      edge.lineBetween((w + topW) / 2, -rc.top - 10, w, 0);
      // Sun icon at the top: a non-colour cue for "light".
      edge.fillStyle(warm, 1);
      edge.fillCircle(w / 2, -rc.top + 14, 9);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        edge.lineBetween(w / 2 + Math.cos(a) * 13, -rc.top + 14 + Math.sin(a) * 13, w / 2 + Math.cos(a) * 18, -rc.top + 14 + Math.sin(a) * 18);
      }
      root.add([glow, cone, edge]);
      update = (t, state) => {
        const s = lightState(o, t, state);
        const intensity = rc.reducedMotion && s === 'on' ? 0.9 : lightIntensity(o, t, state);
        cone.setAlpha(s === 'off' ? 0.05 : intensity);
        glow.setAlpha(s === 'off' ? 0 : intensity);
        edge.setAlpha(s === 'off' ? 0.25 : s === 'warning' ? intensity + 0.3 : 1);
        if (o.def.motion?.axis === 'x') {
          const dx = o.motionOffset(t, state);
          cone.x = glow.x = edge.x = dx;
        }
      };
      break;
    }
    case 'falling': {
      const w = o.w;
      const h = o.h;
      const box = scene.add.graphics();
      if (o.def.style === 'rock') {
        box.fillStyle(pal.solid, 1);
        box.fillRoundedRect(0, -h, w, h, 14);
        box.lineStyle(3, pal.solidEdge, 1);
        box.strokeRoundedRect(0, -h, w, h, 14);
      } else {
        box.fillStyle(0x8a5a32, 1);
        box.fillRoundedRect(0, -h, w, h, 6);
        box.fillStyle(0xc98b4f, 1);
        box.fillRoundedRect(4, -h + 4, w - 8, h - 8, 4);
        box.lineStyle(5, 0x8a5a32, 1);
        box.lineBetween(6, -h + 6, w - 6, -6);
      }
      // Warning shadow on the ground where it will land.
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(w / 2, -2, w * 1.2, 10);
      g.fillStyle(DANGER, 1);
      g.fillTriangle(w / 2 - 9, -24, w / 2 + 9, -24, w / 2, -40);
      root.add(box);
      update = (t, state) => {
        box.y = -o.fallingBottom(t, state);
        g.setAlpha(state.triggeredAt < 0 ? 1 : Math.max(0, 1 - (t - state.triggeredAt) * 2));
      };
      break;
    }
    case 'train': {
      const w = o.w;
      const h = o.h;
      const car = scene.add.graphics();
      car.fillStyle(0x2a2350, 1);
      car.fillRoundedRect(0, -h, w, h - 10, 18);
      car.fillStyle(pal.detail, 1);
      car.fillRect(0, -h * 0.42, w, 8);
      car.fillStyle(0xbff4ff, 0.9);
      for (let x = 30; x < w - 40; x += 56) car.fillRoundedRect(x, -h + 28, 40, 44, 6);
      car.fillStyle(0xfff6a8, 1);
      car.fillCircle(10, -40, 10);
      car.fillStyle(0x111111, 1);
      for (let x = 40; x < w; x += 110) car.fillCircle(x, -6, 12);
      if (rc.highContrast) {
        car.lineStyle(5, DANGER, 1);
        car.strokeRoundedRect(0, -h, w, h - 10, 18);
      }
      root.add(car);
      // Rails.
      g.lineStyle(3, 0x1d1838, 0.6);
      g.lineBetween(-900, -2, w + 200, -2);
      update = (t, state) => {
        car.x = o.trainX(t, state) - o.x;
      };
      break;
    }
    case 'pendulum': {
      const bobG = scene.add.graphics();
      bobG.fillStyle(0x6b7a99, 1);
      bobG.fillCircle(0, 0, 30);
      bobG.fillStyle(0xb8c4dc, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        bobG.fillTriangle(Math.cos(a) * 26, Math.sin(a) * 26, Math.cos(a + 0.3) * 26, Math.sin(a + 0.3) * 26, Math.cos(a + 0.15) * 40, Math.sin(a + 0.15) * 40);
      }
      bobG.fillStyle(0xffffff, 0.4);
      bobG.fillCircle(-9, -9, 8);
      const rope = scene.add.graphics();
      root.add([rope, bobG]);
      const pivotX = o.w / 2;
      g.fillStyle(0x3e2614, 1);
      g.fillRoundedRect(pivotX - 40, -o.y - 12, 80, 18, 6);
      update = (t) => {
        const bob = o.pendulumBob(t);
        bobG.x = bob.x - o.x;
        bobG.y = -bob.y;
        rope.clear();
        rope.lineStyle(4, 0x3e2614, 1);
        rope.lineBetween(pivotX, -o.y, bob.x - o.x, -bob.y);
      };
      break;
    }
    case 'gate': {
      const w = o.w;
      const bars = scene.add.graphics();
      const style = o.def.style;
      const color = style === 'door' ? 0xb98a55 : shadowSide ? pal.solidEdge : 0x5b6b8c;
      const height = rc.top + 20;
      if (style === 'door') {
        bars.fillStyle(color, 1);
        bars.fillRect(0, -height, w, height);
        bars.fillStyle(0x6e4e2b, 1);
        for (let y = -height + 30; y < 0; y += 40) bars.fillRect(4, y, w - 8, 6);
        bars.fillStyle(0xffd36b, 1);
        bars.fillCircle(w / 2, -60, 7);
        bars.fillRect(w / 2 - 3, -60, 6, 14);
      } else {
        bars.fillStyle(color, shadowSide ? 0.85 : 1);
        for (let x = 0; x < w; x += 12) bars.fillRect(x, -height, 7, height);
        bars.fillRect(-4, -height, w + 8, 10);
        bars.fillRect(-4, -26, w + 8, 10);
        if (style === 'timed' || style === 'slide') {
          bars.fillStyle(HAZARD, 1);
          bars.fillRect(-4, -34, w + 8, 8);
        }
      }
      if (rc.highContrast) {
        bars.lineStyle(4, DANGER, 1);
        bars.strokeRect(0, -height, w, height);
      }
      // Lock icon: closed gates are recognisable without colour.
      const lock = scene.add.graphics();
      lock.fillStyle(0xffffff, 1);
      lock.fillRoundedRect(w / 2 - 10, -96, 20, 16, 3);
      lock.lineStyle(4, 0xffffff, 1);
      lock.beginPath();
      lock.arc(w / 2, -98, 7, Math.PI, 0, false);
      lock.strokePath();
      root.add([bars, lock]);
      let shown = 0;
      update = (t, state) => {
        const closed = o.isActive(t, state);
        const target = closed ? 0 : 1;
        shown += (target - shown) * (rc.reducedMotion ? 1 : 0.25);
        bars.y = -shown * (height - 30);
        lock.setVisible(closed);
      };
      break;
    }
    case 'boost': {
      for (let x = 30; x < o.w; x += 90) {
        g.fillStyle(pal.detail, 0.7);
        g.fillTriangle(x, -4, x + 22, -12, x, -20);
        g.fillTriangle(x + 20, -4, x + 42, -12, x + 20, -20);
      }
      if (!rc.reducedMotion) update = (t) => g.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(t * 6)));
      break;
    }
  }
  return { root, update };
}

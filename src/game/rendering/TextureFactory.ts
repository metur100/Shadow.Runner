import type Phaser from 'phaser';

import type { Side, ThemeId } from '../levels/LevelDefinition';
import { hashString, Rng } from '../utils/MathUtils';
import { hex, lanePalette, mix, THEMES, type LanePalette } from './Themes';

/** Height of the ground strip at the bottom of each lane (design units). */
export const GROUND_H = 60;

type Ctx = CanvasRenderingContext2D;

const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  if (!tex) return key;
  const ctx = tex.getContext();
  draw(ctx, tex.width, tex.height);
  tex.refresh();
  return key;
}

/** Small shared textures: glow dots, sparkles, coins, crystals, keys. */
export function ensureCoreTextures(scene: Phaser.Scene, scale: number): void {
  const s = Math.max(1, Math.min(2, scale));
  canvasTexture(scene, 'dot', 32 * s, 32 * s, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  canvasTexture(scene, 'glow', 128 * s, 128 * s, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  canvasTexture(scene, 'spark', 32 * s, 32 * s, (ctx, w) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const c = w / 2;
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? c : c * 0.22;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
  canvasTexture(scene, 'coin', 48 * s, 48 * s, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#d99a1e';
    ctx.beginPath();
    ctx.arc(c, c + w * 0.03, c * 0.86, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, w);
    g.addColorStop(0, '#fff3a8');
    g.addColorStop(0.5, '#ffc83d');
    g.addColorStop(1, '#f2a41e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,100,10,0.6)';
    ctx.lineWidth = w * 0.06;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(c - w * 0.06, c - w * 0.22, w * 0.12, w * 0.44);
  });
  canvasTexture(scene, 'crystal', 48 * s, 48 * s, (ctx, w) => {
    const c = w / 2;
    const pts: [number, number][] = [
      [c, w * 0.04],
      [w * 0.8, w * 0.38],
      [c, w * 0.96],
      [w * 0.2, w * 0.38],
    ];
    const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, 'rgba(159,232,255,0.55)');
    glow.addColorStop(1, 'rgba(159,232,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, w);
    const g = ctx.createLinearGradient(0, 0, w, w);
    g.addColorStop(0, '#e8fbff');
    g.addColorStop(0.5, '#8fe9ff');
    g.addColorStop(1, '#7b5cff');
    ctx.fillStyle = g;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(c, w * 0.04);
    ctx.lineTo(w * 0.2, w * 0.38);
    ctx.lineTo(c, w * 0.42);
    ctx.closePath();
    ctx.fill();
  });
  canvasTexture(scene, 'key', 48 * s, 48 * s, (ctx, w) => {
    ctx.strokeStyle = '#ffd36b';
    ctx.fillStyle = '#ffd36b';
    ctx.lineWidth = w * 0.11;
    ctx.beginPath();
    ctx.arc(w * 0.32, w * 0.5, w * 0.17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(w * 0.45, w * 0.45, w * 0.45, w * 0.1);
    ctx.fillRect(w * 0.72, w * 0.5, w * 0.08, w * 0.18);
    ctx.fillRect(w * 0.84, w * 0.5, w * 0.08, w * 0.14);
  });
}

export interface LaneTextures {
  sky: string;
  far: string;
  mid: string;
  ground: string;
}

/**
 * Background layers for one lane of one world, drawn procedurally on canvases (no image files):
 * a static sky, two seamlessly tiling parallax layers and a tiling ground strip.
 */
export function laneTextures(scene: Phaser.Scene, theme: ThemeId, side: Side, width: number, height: number, scale: number): LaneTextures {
  const s = Math.max(0.75, Math.min(1.25, scale));
  const w = Math.round(width * s);
  const h = Math.round(height * s);
  const tag = `${theme}-${side}-${w}x${h}`;
  const pal = lanePalette(theme, side);
  const kind = THEMES[theme].scenery;
  const seed = hashString(tag);
  return {
    sky: canvasTexture(scene, `sky-${tag}`, w, h, (ctx) => drawSky(ctx, w, h, pal, side, kind, new Rng(seed))),
    far: canvasTexture(scene, `far-${tag}`, w, h, (ctx) => drawLayer(ctx, w, h, pal, side, kind, 'far', new Rng(seed + 1), s)),
    mid: canvasTexture(scene, `mid-${tag}`, w, h, (ctx) => drawLayer(ctx, w, h, pal, side, kind, 'mid', new Rng(seed + 2), s)),
    ground: canvasTexture(scene, `ground-${theme}-${side}-${s}`, 160 * s, GROUND_H * s, (ctx, gw, gh) => drawGround(ctx, gw, gh, pal, side, kind, s)),
  };
}

/**
 * Frees the background textures of worlds that are not in use, so only a couple of worlds' canvases
 * live in memory at a time (important on mid-range Android devices).
 */
export function trimLaneTextures(scene: Phaser.Scene, keep: ThemeId[]): void {
  for (const key of scene.textures.getTextureKeys()) {
    const m = /^(sky|far|mid)-([a-z]+)-/.exec(key);
    if (m && !keep.includes(m[2] as ThemeId)) scene.textures.remove(key);
  }
}

/** Texture resolution for backgrounds: sharp on good devices, lighter on weak ones. */
export function backgroundScale(renderScale: number, lowEnd: boolean): number {
  return lowEnd ? 1 : Math.min(renderScale, 1.5);
}

function drawSky(ctx: Ctx, w: number, h: number, p: LanePalette, side: Side, kind: string, rng: Rng): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hex(p.skyTop));
  g.addColorStop(1, hex(p.skyBottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (side === 'real') {
    if (kind === 'eclipse') {
      // The eclipse: a dark disc with a burning corona.
      const cx = w * 0.78;
      const cy = h * 0.24;
      const r = h * 0.12;
      const corona = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 3);
      corona.addColorStop(0, 'rgba(255,214,140,0.95)');
      corona.addColorStop(0.3, 'rgba(255,150,90,0.35)');
      corona.addColorStop(1, 'rgba(255,150,90,0)');
      ctx.fillStyle = corona;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1a1026';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Soft sun.
      const cx = w * (kind === 'neon' ? 0.5 : 0.8);
      const cy = h * (kind === 'neon' ? 0.55 : 0.2);
      const r = h * 0.1;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
      glow.addColorStop(0, 'rgba(255,250,220,0.9)');
      glow.addColorStop(0.25, 'rgba(255,236,170,0.4)');
      glow.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = kind === 'neon' ? 'rgba(255,214,120,0.95)' : 'rgba(255,253,235,0.95)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (kind === 'neon') {
        ctx.fillStyle = hex(p.skyBottom);
        for (let i = 0; i < 5; i++) ctx.fillRect(cx - r, cy + r * (0.15 + i * 0.18), r * 2, r * 0.06 + i * 0.6);
      }
    }
    // Clouds.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 5; i++) {
      const x = rng.range(0, w);
      const y = rng.range(h * 0.06, h * 0.35);
      const r = rng.range(h * 0.03, h * 0.05);
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.arc(x + j * r * 1.1, y - (j % 2) * r * 0.5, r * (j % 2 ? 1.2 : 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Stars, a moon and drifting mist.
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = rgba(p.particle, rng.range(0.15, 0.7));
      const r = rng.range(0.6, 1.8) * (h / 450);
      ctx.beginPath();
      ctx.arc(rng.range(0, w), rng.range(0, h * 0.7), r, 0, Math.PI * 2);
      ctx.fill();
    }
    const mx = w * 0.18;
    const my = h * 0.2;
    const mr = h * 0.07;
    const halo = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4);
    halo.addColorStop(0, rgba(p.detail, 0.35));
    halo.addColorStop(1, rgba(p.detail, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(230,240,255,0.9)';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hex(p.skyTop);
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.85, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const y = h * (0.55 + i * 0.12);
      const mist = ctx.createLinearGradient(0, y - h * 0.08, 0, y + h * 0.08);
      mist.addColorStop(0, rgba(p.mid, 0));
      mist.addColorStop(0.5, rgba(mix(p.mid, p.detail, 0.25), 0.28));
      mist.addColorStop(1, rgba(p.mid, 0));
      ctx.fillStyle = mist;
      ctx.fillRect(0, y - h * 0.08, w, h * 0.16);
    }
  }
}

/** Draws `fn` at x and, when it crosses an edge, again at x ± w so the layer tiles seamlessly. */
function wrap(w: number, x: number, span: number, fn: (x: number) => void): void {
  fn(x);
  if (x + span > w) fn(x - w);
  if (x - span < 0) fn(x + w);
}

function drawLayer(ctx: Ctx, w: number, h: number, p: LanePalette, side: Side, kind: string, layer: 'far' | 'mid', rng: Rng, s: number): void {
  const far = layer === 'far';
  const base = h - GROUND_H * s;
  const color = far ? p.far : p.mid;
  const shadow = side === 'shadow';
  const detail = (a: number) => rgba(p.detail, a);
  ctx.fillStyle = hex(color);
  ctx.strokeStyle = hex(color);

  const n = far ? 9 : 7;
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const x = i * step + rng.range(-step * 0.2, step * 0.2);
    const bw = rng.range(step * 0.55, step * 0.95);
    const bh = (far ? rng.range(0.35, 0.65) : rng.range(0.18, 0.4)) * h;
    const lean = shadow ? rng.range(-0.12, 0.12) : 0;
    wrap(w, x, bw + 40 * s, (xx) => {
      ctx.save();
      ctx.translate(xx, base);
      if (lean) ctx.transform(1, 0, lean, 1, 0, 0);
      ctx.fillStyle = hex(color);
      switch (kind) {
        case 'city':
        case 'neon': {
          ctx.fillRect(0, -bh, bw, bh);
          if (!far && kind === 'city' && !shadow) {
            ctx.fillStyle = hex(mix(color, 0x000000, 0.25));
            ctx.beginPath();
            ctx.moveTo(-8 * s, -bh);
            ctx.lineTo(bw / 2, -bh - 34 * s);
            ctx.lineTo(bw + 8 * s, -bh);
            ctx.fill();
          }
          // Windows / neon strips.
          const cols = Math.max(2, Math.floor(bw / (18 * s)));
          for (let r = 0; r < Math.floor(bh / (26 * s)) - 1; r++) {
            for (let c = 0; c < cols; c++) {
              if (rng.chance(kind === 'neon' ? 0.5 : 0.35)) continue;
              ctx.fillStyle = detail(shadow ? rng.range(0.25, 0.8) : far ? 0.35 : 0.6);
              ctx.fillRect(c * (bw / cols) + 4 * s, -bh + 14 * s + r * 26 * s, bw / cols - 8 * s, 10 * s);
            }
          }
          if (kind === 'neon') {
            ctx.fillStyle = detail(0.9);
            ctx.fillRect(0, -bh, bw, 3 * s);
          }
          break;
        }
        case 'park': {
          if (far) {
            ctx.beginPath();
            ctx.ellipse(bw / 2, 0, bw * 0.9, bh * 0.7, 0, Math.PI, 0);
            ctx.fill();
          } else if (!shadow) {
            ctx.fillStyle = hex(mix(color, 0x3a2410, 0.6));
            ctx.fillRect(bw / 2 - 5 * s, -bh * 0.5, 10 * s, bh * 0.5);
            ctx.fillStyle = hex(color);
            for (let k = 0; k < 3; k++) {
              ctx.beginPath();
              ctx.arc(bw / 2 + (k - 1) * bw * 0.18, -bh * 0.55 - (k % 2) * bh * 0.15, bw * 0.24, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = detail(0.8);
            for (let k = 0; k < 4; k++) {
              ctx.beginPath();
              ctx.arc(rng.range(0, bw), -rng.range(2, 10) * s, 3 * s, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            // Twisting roots hanging from above and growing from below.
            ctx.lineWidth = rng.range(4, 9) * s;
            ctx.strokeStyle = hex(color);
            ctx.beginPath();
            ctx.moveTo(bw * 0.2, -h + GROUND_H * s);
            ctx.bezierCurveTo(bw * 0.9, -bh * 1.8, -bw * 0.2, -bh * 1.2, bw * 0.5, -bh * 0.6);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(bw * 0.1, 0);
            ctx.bezierCurveTo(bw * 0.4, -bh * 0.4, bw * 0.9, -bh * 0.2, bw, -bh * 0.7);
            ctx.stroke();
            ctx.fillStyle = detail(0.75);
            ctx.beginPath();
            ctx.arc(bw * 0.5, -bh * 0.6, 4 * s, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'clockwork': {
          const r = Math.min(bw, bh) * (far ? 0.5 : 0.38);
          const cy = far ? -bh * 0.6 : -r * 1.1;
          ctx.save();
          ctx.translate(bw / 2, cy);
          const teeth = 12;
          ctx.beginPath();
          for (let t = 0; t < teeth * 2; t++) {
            const a = (t / (teeth * 2)) * Math.PI * 2;
            const rr = t % 2 === 0 ? r : r * 0.86;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          if (shadow) {
            ctx.lineWidth = 3 * s;
            ctx.strokeStyle = detail(0.35);
            ctx.stroke();
            ctx.fillStyle = hex(color);
            ctx.fill();
            // Broken: a wedge missing.
            ctx.fillStyle = hex(p.skyBottom);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r * 1.05, 0.3, 0.9);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fill();
          }
          ctx.fillStyle = detail(far ? 0.3 : 0.6);
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (far) {
            ctx.fillStyle = hex(color);
            ctx.fillRect(bw * 0.38, -bh * 0.6, bw * 0.24, bh * 0.6);
          } else {
            ctx.fillRect(0, -12 * s, bw, 12 * s);
          }
          break;
        }
        case 'temple': {
          if (far && !shadow) {
            // Stepped temple.
            for (let k = 0; k < 4; k++) ctx.fillRect(bw * (0.08 * k), -bh * (0.25 * (k + 1)), bw * (1 - 0.16 * k), bh * 0.25);
          } else if (!shadow) {
            for (let k = 0; k < 2; k++) {
              ctx.fillRect(k * bw * 0.6, -bh, bw * 0.22, bh);
              ctx.fillRect(k * bw * 0.6 - 6 * s, -bh - 10 * s, bw * 0.22 + 12 * s, 12 * s);
            }
            ctx.fillRect(-6 * s, -bh - 22 * s, bw * 0.82 + 12 * s, 14 * s);
          } else {
            // Kelp and drowned ruins.
            ctx.lineWidth = 6 * s;
            ctx.strokeStyle = hex(color);
            for (let k = 0; k < 3; k++) {
              ctx.beginPath();
              const kx = k * bw * 0.35;
              ctx.moveTo(kx, 0);
              for (let yy = 0; yy < bh * 1.4; yy += 14 * s) ctx.lineTo(kx + Math.sin(yy * 0.05 + k) * 10 * s, -yy);
              ctx.stroke();
            }
            if (far) ctx.fillRect(bw * 0.5, -bh * 0.5, bw * 0.3, bh * 0.5);
            ctx.fillStyle = detail(0.5);
            for (let k = 0; k < 5; k++) {
              ctx.beginPath();
              ctx.arc(rng.range(0, bw), -rng.range(0, bh * 1.5), rng.range(2, 5) * s, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          break;
        }
        case 'eclipse': {
          // Floating fragments of the world.
          const fy = far ? -bh * 0.9 : -bh * 0.6;
          ctx.beginPath();
          ctx.moveTo(0, fy);
          ctx.lineTo(bw * 0.8, fy - bh * 0.1);
          ctx.lineTo(bw * 0.6, fy + bh * 0.25);
          ctx.lineTo(bw * 0.2, fy + bh * 0.3);
          ctx.closePath();
          ctx.fill();
          if (!far) ctx.fillRect(bw * 0.2, -bh * 0.3, bw * 0.5, bh * 0.3);
          ctx.strokeStyle = detail(shadow ? 0.6 : 0.4);
          ctx.lineWidth = 2 * s;
          ctx.beginPath();
          ctx.moveTo(bw * 0.1, fy + bh * 0.05);
          ctx.lineTo(bw * 0.5, fy + bh * 0.12);
          ctx.lineTo(bw * 0.45, fy + bh * 0.22);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    });
  }
  if (shadow && !far) {
    // Distorted silhouettes walking in the mist.
    ctx.fillStyle = rgba(mix(p.mid, 0x000000, 0.3), 0.8);
    for (let i = 0; i < 3; i++) {
      const x = rng.range(0, w);
      const fh = rng.range(60, 110) * s;
      wrap(w, x, 40 * s, (xx) => {
        ctx.beginPath();
        ctx.ellipse(xx, base - fh, fh * 0.12, fh * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(xx - fh * 0.16, base);
        ctx.quadraticCurveTo(xx - fh * 0.22, base - fh * 0.6, xx, base - fh * 0.86);
        ctx.quadraticCurveTo(xx + fh * 0.3, base - fh * 0.5, xx + fh * 0.12, base);
        ctx.fill();
        ctx.fillStyle = detail(0.9);
        ctx.fillRect(xx + fh * 0.02, base - fh * 1.02, 3 * s, 2 * s);
        ctx.fillStyle = rgba(mix(p.mid, 0x000000, 0.3), 0.8);
      });
    }
  }
}

function drawGround(ctx: Ctx, w: number, h: number, p: LanePalette, side: Side, kind: string, s: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hex(p.ground));
  g.addColorStop(1, hex(mix(p.ground, 0x000000, 0.4)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (side === 'real') {
    ctx.fillStyle = hex(p.groundTop);
    ctx.fillRect(0, 0, w, 9 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, 0, w, 3 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    if (kind === 'park') {
      for (let x = 0; x < w; x += 20 * s) ctx.fillRect(x, 9 * s, 10 * s, 6 * s);
    } else {
      // Paving / bricks.
      for (let row = 0; row < 3; row++) {
        const y = 16 * s + row * 15 * s;
        ctx.fillRect(0, y, w, 2 * s);
        for (let x = (row % 2) * 20 * s; x < w; x += 40 * s) ctx.fillRect(x, y, 2 * s, 15 * s);
      }
    }
  } else {
    ctx.fillStyle = hex(p.groundTop);
    ctx.fillRect(0, 0, w, 3 * s);
    const glow = ctx.createLinearGradient(0, 0, 0, 16 * s);
    glow.addColorStop(0, rgba(p.groundTop, 0.45));
    glow.addColorStop(1, rgba(p.groundTop, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, 16 * s);
    ctx.strokeStyle = rgba(p.detail, 0.35);
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, 8 * s);
    ctx.lineTo(w * 0.3, 22 * s);
    ctx.lineTo(w * 0.25, 40 * s);
    ctx.moveTo(w * 0.62, 10 * s);
    ctx.lineTo(w * 0.7, 30 * s);
    ctx.lineTo(w * 0.86, 36 * s);
    ctx.stroke();
  }
}

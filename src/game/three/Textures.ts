import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, THREE.Texture>();

/** Small deterministic random generator for texture details. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function canvas(w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx, w, h);
  return c;
}

function texture(key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void, opts: { repeat?: boolean; color?: boolean } = {}): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(canvas(w, h, draw));
  if (opts.color !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, tex);
  return tex;
}

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function noise(ctx: Ctx, w: number, h: number, r: () => number, count: number, colors: string[], size: [number, number]): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

export interface RoadStyle {
  kind: 'asphalt' | 'cobble' | 'path' | 'stone' | 'rooftop';
  base: number;
  /** Lane markings (null = none). */
  line: number | null;
  /** Glowing cracks / seams (shadow worlds), drawn into the emissive map. */
  glow: number | null;
}

/**
 * Road surface, 6 m wide and 8 m long per repeat (u across, v along the run). Returns the colour map and,
 * for shadow worlds, an emissive map with glowing cracks.
 */
export function roadTextures(style: RoadStyle): { map: THREE.Texture; emissive: THREE.Texture | null } {
  const key = `road-${style.kind}-${style.base}-${style.line}-${style.glow}`;
  const W = 512;
  const H = 680;
  const map = texture(key, W, H, (ctx, w, h) => {
    const r = rng(style.base + 7);
    ctx.fillStyle = css(style.base);
    ctx.fillRect(0, 0, w, h);
    const light = css(0xffffff, 0.05);
    const dark = css(0x000000, 0.12);
    switch (style.kind) {
      case 'asphalt': {
        noise(ctx, w, h, r, 9000, [light, dark, css(0x000000, 0.06)], [1, 3]);
        // Patches and tyre wear.
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = css(0x000000, 0.06 + r() * 0.05);
          ctx.beginPath();
          ctx.ellipse(r() * w, r() * h, 30 + r() * 60, 40 + r() * 90, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = css(0x000000, 0.08);
        ctx.fillRect(w * 0.2, 0, w * 0.1, h);
        ctx.fillRect(w * 0.7, 0, w * 0.1, h);
        // Cracks.
        ctx.strokeStyle = css(0x000000, 0.35);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          let x = r() * w;
          let y = r() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 6; k++) {
            x += (r() - 0.5) * 40;
            y += r() * 30;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'cobble':
      case 'stone': {
        const cw = style.kind === 'cobble' ? 42 : 96;
        const ch = style.kind === 'cobble' ? 34 : 64;
        for (let y = 0; y < h; y += ch) {
          const off = (y / ch) % 2 ? cw / 2 : 0;
          for (let x = -cw; x < w + cw; x += cw) {
            const t = r();
            ctx.fillStyle = css(style.base, 1);
            ctx.fillRect(x + off, y, cw, ch);
            ctx.fillStyle = t > 0.5 ? css(0xffffff, 0.04 + r() * 0.06) : css(0x000000, 0.05 + r() * 0.08);
            ctx.fillRect(x + off + 2, y + 2, cw - 4, ch - 4);
            ctx.fillStyle = css(0xffffff, 0.06);
            ctx.fillRect(x + off + 3, y + 3, cw - 6, 3);
            ctx.fillStyle = css(0x000000, 0.35);
            ctx.fillRect(x + off, y, cw, 2);
            ctx.fillRect(x + off, y, 2, ch);
          }
        }
        noise(ctx, w, h, r, 3000, [light, dark], [1, 2]);
        break;
      }
      case 'path': {
        noise(ctx, w, h, r, 12000, [css(0xffffff, 0.06), css(0x5a3a1a, 0.12), css(0x000000, 0.08)], [1, 4]);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = css(0x8a7a6a, 0.5);
          ctx.beginPath();
          ctx.ellipse(r() * w, r() * h, 3 + r() * 6, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'rooftop': {
        // Gravel roof with seams.
        noise(ctx, w, h, r, 14000, [css(0xffffff, 0.07), css(0x000000, 0.12)], [1, 3]);
        ctx.fillStyle = css(0x000000, 0.25);
        for (let y = 0; y < h; y += h / 4) ctx.fillRect(0, y, w, 3);
        ctx.fillRect(w / 2 - 1, 0, 3, h);
        break;
      }
    }
    if (style.line !== null) {
      // Dashed lines between the three lanes, 3 m dash per 8 m, plus solid edge lines.
      ctx.fillStyle = css(style.line, 0.92);
      for (const u of [1 / 3, 2 / 3]) ctx.fillRect(w * u - 5, h * 0.1, 10, h * 0.38);
      ctx.fillStyle = css(style.line, 0.75);
      ctx.fillRect(14, 0, 8, h);
      ctx.fillRect(w - 22, 0, 8, h);
      ctx.fillStyle = css(0x000000, 0.15);
      noise(ctx, w, h, r, 1500, [css(0x000000, 0.15)], [1, 3]);
    } else {
      // Unpainted roads still show the lanes: a row of pale studs between them.
      ctx.fillStyle = css(0xffffff, 0.38);
      for (const u of [1 / 3, 2 / 3]) {
        for (let y = h * 0.06; y < h; y += h / 4) {
          ctx.beginPath();
          ctx.ellipse(w * u, y, 7, 12, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
  map.repeat.set(1, 1);
  let emissive: THREE.Texture | null = null;
  if (style.glow !== null) {
    const glow = style.glow;
    emissive = texture(`${key}-glow`, W, H, (ctx, w, h) => {
      const r = rng(glow);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css(glow, 1);
      ctx.shadowColor = css(glow, 1);
      ctx.shadowBlur = 10;
      for (let i = 0; i < 4; i++) {
        let x = r() * w;
        let y = r() * h;
        ctx.lineWidth = 2 + r() * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 8; k++) {
          x += (r() - 0.5) * 70;
          y += 10 + r() * 40;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(10, h);
      ctx.moveTo(w - 10, 0);
      ctx.lineTo(w - 10, h);
      ctx.stroke();
      // Faint glowing dashes between the lanes.
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const u of [1 / 3, 2 / 3]) {
        ctx.moveTo(w * u, h * 0.1);
        ctx.lineTo(w * u, h * 0.48);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }
  return { map, emissive };
}

/** Pavement slabs for the sidewalks (2.5 m wide per repeat across, 2.5 m along). */
export function pavingTexture(base: number, kind: 'slab' | 'grass' | 'sand' | 'dark'): THREE.Texture {
  return texture(`paving-${base}-${kind}`, 256, 256, (ctx, w, h) => {
    const r = rng(base + 3);
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, w, h);
    if (kind === 'grass') {
      noise(ctx, w, h, r, 6000, [css(0x2f7a32, 0.4), css(0x9be06b, 0.35), css(0x1e5a22, 0.3)], [1, 3]);
      return;
    }
    if (kind === 'sand') {
      noise(ctx, w, h, r, 6000, [css(0xffffff, 0.1), css(0x8a6a3a, 0.15)], [1, 2]);
      return;
    }
    const n = 4;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = r() > 0.5 ? css(0xffffff, 0.05 + r() * 0.05) : css(0x000000, 0.04 + r() * 0.06);
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
    }
    ctx.fillStyle = css(0x000000, kind === 'dark' ? 0.5 : 0.25);
    for (let i = 0; i <= n; i++) {
      ctx.fillRect(i * s - 1, 0, 2, h);
      ctx.fillRect(0, i * s - 1, w, 2);
    }
    noise(ctx, w, h, r, 2500, [css(0xffffff, 0.05), css(0x000000, 0.08)], [1, 2]);
  });
}

/** Red brick (walls): one repeat is 2 m × 2 m. */
export function brickTexture(base: number, mortar: number): THREE.Texture {
  return texture(`brick-${base}-${mortar}`, 512, 512, (ctx, w, h) => {
    const r = rng(base);
    ctx.fillStyle = css(mortar);
    ctx.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 26;
    for (let row = 0; row * bh < h; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const v = r();
        const c = new THREE.Color(base).offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.1, (v - 0.5) * 0.12);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
        ctx.fillStyle = css(0xffffff, 0.08);
        ctx.fillRect(x + off + 3, row * bh + 3, bw - 6, 3);
        ctx.fillStyle = css(0x000000, 0.18);
        ctx.fillRect(x + off + 3, row * bh + bh - 6, bw - 6, 3);
      }
    }
    noise(ctx, w, h, r, 5000, [css(0xffffff, 0.05), css(0x000000, 0.1)], [1, 2]);
  });
}

/** A painted warning cross for the front of walls the physical form cannot pass. */
export function crossDecal(): THREE.Texture {
  return texture(
    'cross-decal',
    256,
    256,
    (ctx, w) => {
      ctx.clearRect(0, 0, w, w);
      ctx.strokeStyle = 'rgba(214,62,62,0.85)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(56, 56);
      ctx.lineTo(200, 200);
      ctx.moveTo(200, 56);
      ctx.lineTo(56, 200);
      ctx.stroke();
      // Spray drips.
      ctx.fillStyle = 'rgba(214,62,62,0.7)';
      for (const [x, y, l] of [[70, 200, 30], [190, 210, 22], [128, 150, 34]]) ctx.fillRect(x - 3, y, 6, l);
    },
    { repeat: false },
  );
}

/** Black and yellow hazard stripes. */
export function hazardTexture(): THREE.Texture {
  return texture('hazard', 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d1838';
    for (let x = -h; x < w + h; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 32, h);
      ctx.lineTo(x + 32 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.fill();
    }
  });
}

/** Soft round glow for sprites (additive). */
export function glowTexture(): THREE.Texture {
  return texture(
    'glow',
    128,
    128,
    (ctx, w) => {
      const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
    },
    { repeat: false },
  );
}

/** Vertical light shaft: bright at the bottom, fading upwards, with streaks. */
export function shaftTexture(): THREE.Texture {
  return texture(
    'shaft',
    128,
    256,
    (ctx, w, h) => {
      const r = rng(11);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.25})`;
        ctx.fillRect(r() * w, 0, 2 + r() * 6, h);
      }
      // Fade the side edges.
      const e = ctx.createLinearGradient(0, 0, w, 0);
      e.addColorStop(0, 'rgba(0,0,0,1)');
      e.addColorStop(0.15, 'rgba(0,0,0,0)');
      e.addColorStop(0.85, 'rgba(0,0,0,0)');
      e.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = e;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );
}

/** Puffy cloud sprite. */
export function cloudTexture(): THREE.Texture {
  return texture(
    'cloud',
    256,
    128,
    (ctx, w, h) => {
      const r = rng(5);
      for (let i = 0; i < 16; i++) {
        const x = w * 0.15 + r() * w * 0.7;
        const y = h * 0.45 + (r() - 0.5) * h * 0.35;
        const rad = 18 + r() * 30;
        const g = ctx.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.7, 'rgba(250,246,240,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      // Slightly shaded base.
      ctx.globalCompositeOperation = 'source-atop';
      const s = ctx.createLinearGradient(0, 0, 0, h);
      s.addColorStop(0, 'rgba(255,255,255,0)');
      s.addColorStop(1, 'rgba(180,170,200,0.45)');
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );
}

/** Crescent moon with a halo. */
export function moonTexture(): THREE.Texture {
  return texture(
    'moon',
    256,
    256,
    (ctx, w) => {
      const c = w / 2;
      const halo = ctx.createRadialGradient(c, c, w * 0.12, c, c, w / 2);
      halo.addColorStop(0, 'rgba(200,190,255,0.5)');
      halo.addColorStop(1, 'rgba(200,190,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, w);
      ctx.fillStyle = '#eef0ff';
      ctx.beginPath();
      ctx.arc(c, c, w * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(c + w * 0.09, c - w * 0.05, w * 0.18, 0, Math.PI * 2);
      ctx.fill();
    },
    { repeat: false },
  );
}

/** Spiral for portals (additive, rotated in the shader / per frame). */
export function swirlTexture(): THREE.Texture {
  return texture(
    'swirl',
    256,
    256,
    (ctx, w) => {
      const c = w / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineCap = 'round';
      for (let arm = 0; arm < 4; arm++) {
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let t = 0; t < 1; t += 0.02) {
          const a = arm * (Math.PI / 2) + t * 5;
          const rr = t * c * 0.95;
          const x = c + Math.cos(a) * rr;
          const y = c + Math.sin(a) * rr;
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
    { repeat: false },
  );
}

/** Purple crystal coin face with a lightning mark (the shadow world's currency). */
export function crystalFaceTexture(): THREE.Texture {
  return texture(
    'crystal-face',
    128,
    128,
    (ctx, w) => {
      const c = w / 2;
      const g = ctx.createRadialGradient(c, c * 0.8, 0, c, c, c);
      g.addColorStop(0, '#b9a2ff');
      g.addColorStop(0.7, '#6b47e8');
      g.addColorStop(1, '#3a1f9e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, c, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e4dcff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c, c, c - 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(c + 8, 22);
      ctx.lineTo(c - 18, c + 6);
      ctx.lineTo(c - 2, c + 6);
      ctx.lineTo(c - 8, w - 22);
      ctx.lineTo(c + 18, c - 6);
      ctx.lineTo(c + 2, c - 6);
      ctx.closePath();
      ctx.fill();
    },
    { repeat: false },
  );
}

/** Chevron arrows painted on the road (boost zones). */
export function chevronTexture(): THREE.Texture {
  return texture(
    'chevron',
    128,
    128,
    (ctx, w) => {
      ctx.clearRect(0, 0, w, w);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const y of [20, 70]) {
        ctx.beginPath();
        ctx.moveTo(14, y + 40);
        ctx.lineTo(64, y);
        ctx.lineTo(114, y + 40);
        ctx.lineTo(96, y + 50);
        ctx.lineTo(64, y + 24);
        ctx.lineTo(32, y + 50);
        ctx.closePath();
        ctx.fill();
      }
    },
    { repeat: false },
  );
}

/** Striped awning cloth. */
export function awningTexture(a: number, b: number): THREE.Texture {
  return texture(`awning-${a}-${b}`, 128, 64, (ctx, w, h) => {
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = css(a);
      ctx.fillRect(x, 0, 16, h);
      ctx.fillStyle = css(b);
      ctx.fillRect(x + 16, 0, 16, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, h - 8, w, 8);
  });
}

/** A shadow-world wall face: dark bricks with a glowing breach in the middle. */
export function breachTexture(glow: number): THREE.Texture {
  return texture(
    `breach-${glow}`,
    256,
    256,
    (ctx, w) => {
      const c = w / 2;
      ctx.clearRect(0, 0, w, w);
      const g = ctx.createRadialGradient(c, c * 1.15, 0, c, c * 1.15, c * 0.8);
      g.addColorStop(0, css(0xffffff, 0.95));
      g.addColorStop(0.3, css(glow, 0.85));
      g.addColorStop(0.75, css(glow, 0.25));
      g.addColorStop(1, css(glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
      // Jagged rim.
      const r = rng(glow);
      ctx.strokeStyle = css(glow, 1);
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = c * (0.42 + r() * 0.12);
        const x = c + Math.cos(a) * rr * 0.8;
        const y = c * 1.15 + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
    { repeat: false },
  );
}

/** Night sky stars as a texture for a sky dome band. */
export function starsTexture(): THREE.Texture {
  return texture('stars', 1024, 256, (ctx, w, h) => {
    const r = rng(99);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      const a = 0.2 + r() * 0.8;
      ctx.fillStyle = `rgba(230,225,255,${a})`;
      const s = r() < 0.92 ? 1 : 2;
      ctx.fillRect(r() * w, r() * h, s, s);
    }
  });
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

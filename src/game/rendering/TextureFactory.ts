import type Phaser from 'phaser';


type Ctx = CanvasRenderingContext2D;


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

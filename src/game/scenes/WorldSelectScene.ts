import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import type { WorldDefinition } from '../levels/LevelDefinition';
import { WORLDS } from '../levels/WorldDefinitions';
import { lanePalette } from '../rendering/Themes';
import { isWorldUnlocked, worldCompleted, worldProgress, worldStars } from '../systems/LevelManager';
import { drawIcon } from '../ui/Icons';
import { ProgressBar } from '../ui/ProgressBar';
import { Tile } from '../ui/Tile';
import { addText } from '../ui/Typography';
import { worldSnapshot } from '../three/Portraits';
import { COLORS } from '../utils/Constants';
import { BaseScene } from './BaseScene';

/** Six world cards with a two-world preview, stars, best progress and lock state. */
export class WorldSelectScene extends BaseScene {
  constructor() {
    super('WorldSelect');
  }

  create(): void {
    this.setupScene('World select');
    this.addTwinBackground('city', false, this.H * 0.5);
    this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.55).setOrigin(0);
    const top = this.addHeader('Worlds', () => this.go('Menu'));
    const save = GameContext.save;
    const cardW = 320;
    const avail = this.H - top - this.safeBottom - 30;
    const cardH = Math.min(300, Math.floor(avail / 3) - 18);
    WORLDS.forEach((world, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = this.W / 2 + (col === 0 ? -(cardW + 20) / 2 : (cardW + 20) / 2);
      const y = top + 10 + cardH / 2 + row * (cardH + 18);
      const unlocked = isWorldUnlocked(save, world.id);
      const tile = new Tile(this, {
        x,
        y,
        width: cardW,
        height: cardH,
        name: `World ${world.id + 1} ${world.name}${unlocked ? '' : ' (locked)'}`,
        focus: this.focus,
        onClick: () => (unlocked ? this.go('LevelSelect', { world: world.id }) : this.lockedNotice(world)),
      });
      this.fillCard(tile, world, cardW, cardH, unlocked);
    });
  }

  private fillCard(tile: Tile, world: WorldDefinition, w: number, h: number, unlocked: boolean): void {
    const save = GameContext.save;
    const previewH = Math.round(h * 0.42);
    const g = this.add.graphics();
    drawWorldPreview(g, world, -w / 2 + 12, -h / 2 + 12, w - 24, previewH);
    tile.add(g);
    // Replace the flat preview with a 3D snapshot of the world (one card per frame, no freeze).
    this.time.delayedCall(60 + world.id * 40, () => {
      const key = worldSnapshot(this, world.theme, world.theme, w - 24, previewH, world.id * 7 + 1);
      if (!key || !tile.active) return;
      const img = this.add.image(-w / 2 + 12, -h / 2 + 12, key).setOrigin(0).setDisplaySize(w - 24, previewH);
      const frame = this.add.graphics();
      frame.lineStyle(3, world.color, 1);
      frame.strokeRoundedRect(-w / 2 + 12, -h / 2 + 12, w - 24, previewH, 6);
      tile.addAt(img, tile.getIndex(g) + 1);
      tile.addAt(frame, tile.getIndex(img) + 1);
      g.destroy();
    });
    let y = -h / 2 + 12 + previewH + 24;
    tile.add(addText(this, -w / 2 + 20, y, `${world.id + 1}  ${world.name}`, { size: 27, weight: '700', color: COLORS.creamText, origin: [0, 0.5] }));
    y += 32;
    tile.add(addText(this, -w / 2 + 20, y, world.tagline, { size: 19, weight: '500', color: COLORS.muted, origin: [0, 0.5] }));
    y += 36;
    if (unlocked) {
      const stars = worldStars(save, world.id);
      const icons = this.add.graphics();
      drawIcon(icons, 'star', -w / 2 + 34, y, 26, COLORS.star, 1);
      tile.add(icons);
      tile.add(addText(this, -w / 2 + 54, y, `${stars}/15`, { size: 22, weight: '700', color: COLORS.creamText, origin: [0, 0.5] }));
      tile.add(addText(this, w / 2 - 20, y, `${worldCompleted(save, world.id)}/5 levels`, { size: 20, weight: '500', color: COLORS.muted, origin: [1, 0.5] }));
      const bar = new ProgressBar(this, 0, y + 30, { width: w - 40, height: 12, fill: world.color, track: 0xffffff, trackAlpha: 0.15 });
      bar.setValue(worldProgress(save, world.id), true);
      tile.add(bar);
    } else {
      const lock = this.add.graphics();
      drawIcon(lock, 'lock', -w / 2 + 34, y + 8, 30, 0xfff8ec, 1);
      tile.add(lock);
      tile.add(addText(this, -w / 2 + 60, y + 8, `Finish ${WORLDS[world.id - 1].name}`, { size: 20, weight: '600', color: COLORS.creamText, origin: [0, 0.5] }));
      const dim = this.add.graphics();
      dim.fillStyle(0x000000, 0.45);
      dim.fillRoundedRect(-w / 2 + 12, -h / 2 + 12, w - 24, previewH, 14);
      tile.add(dim);
    }
  }

  private lockedNotice(world: WorldDefinition): void {
    const t = addText(this, this.W / 2, this.H - this.safeBottom - 60, `Finish ${WORLDS[world.id - 1].name} to open ${world.name}`, {
      size: 25,
      weight: '600',
      color: COLORS.creamText,
      stroke: '#1d1838',
      strokeThickness: 6,
    });
    this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 400, onComplete: () => t.destroy() });
  }
}

/** Small two-world preview: the reality palette above, the shadow palette below, a glowing seam. */
export function drawWorldPreview(g: Phaser.GameObjects.Graphics, world: WorldDefinition, x: number, y: number, w: number, h: number): void {
  const real = lanePalette(world.theme, 'real');
  const shadow = lanePalette(world.theme, 'shadow');
  const half = h / 2;
  g.fillGradientStyle(real.skyTop, real.skyTop, real.skyBottom, real.skyBottom, 1);
  g.fillRect(x, y, w, half);
  g.fillGradientStyle(shadow.skyTop, shadow.skyTop, shadow.skyBottom, shadow.skyBottom, 1);
  g.fillRect(x, y + half, w, half);
  // Skyline silhouettes.
  for (let i = 0; i < 7; i++) {
    const bw = w / 7;
    const bh = half * (0.3 + ((i * 37) % 50) / 100);
    g.fillStyle(real.mid, 1);
    g.fillRect(x + i * bw + 2, y + half - bh, bw - 4, bh);
    g.fillStyle(shadow.mid, 1);
    g.fillRect(x + i * bw + 2, y + half, bw - 4, bh * 0.8);
    g.fillStyle(shadow.detail, 0.7);
    g.fillRect(x + i * bw + bw / 2 - 2, y + half + bh * 0.3, 4, 4);
  }
  g.fillStyle(0xffffff, 0.95);
  g.fillRect(x, y + half - 2, w, 4);
  g.lineStyle(3, world.color, 1);
  g.strokeRoundedRect(x, y, w, h, 14);
}

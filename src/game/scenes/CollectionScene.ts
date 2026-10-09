import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import { drawRunner } from '../rendering/CharacterRenderer';
import { CATEGORY_LABELS, cosmeticsIn, describeRequirement, selectedColors, type CosmeticCategory, type CosmeticItem } from '../systems/Cosmetics';
import { levelName, requirementMet } from '../systems/LevelManager';
import { Button } from '../ui/Button';
import { drawIcon } from '../ui/Icons';
import { Tile } from '../ui/Tile';
import { addText } from '../ui/Typography';
import { COLORS } from '../utils/Constants';
import { BaseScene } from './BaseScene';

const CATEGORIES: CosmeticCategory[] = ['costume', 'shadowForm', 'trail', 'transition', 'portal'];

/**
 * Cosmetic collection: runner costumes, shadow forms, trails, switch effects and portal designs.
 * Everything unlocks through play and is purely visual.
 */
export class CollectionScene extends BaseScene {
  private category: CosmeticCategory = 'costume';

  constructor() {
    super('Collection');
  }

  init(data: { category?: CosmeticCategory }): void {
    this.category = data?.category ?? 'costume';
  }

  create(): void {
    this.setupScene('Collection');
    this.addTwinBackground('city', false, this.H * 0.5);
    this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.7).setOrigin(0);
    let y = this.addHeader('Collection', () => this.go('Menu'));
    const save = GameContext.save;

    // Live preview of the current look.
    const real = this.add.graphics().setPosition(this.W / 2 - 80, y + 120).setScale(1.3);
    const shade = this.add.graphics().setPosition(this.W / 2 + 80, y + 120).setScale(1.3);
    let t = 0;
    const draw = () => {
      real.clear();
      shade.clear();
      drawRunner(real, { side: 'real', anim: 'run', phase: t * 10, time: t, colors: selectedColors(GameContext.save.cosmetics.selected, 'costume'), glow: 0.6 });
      drawRunner(shade, { side: 'shadow', anim: 'run', phase: t * 10, time: t, colors: selectedColors(GameContext.save.cosmetics.selected, 'shadowForm'), glow: 0.6 });
    };
    draw();
    if (!GameContext.reducedMotion) {
      this.events.on('update', (_time: number, d: number) => {
        t += d / 1000;
        draw();
      });
    }
    const unlockedCount = save.cosmetics.unlocked.length;
    addText(this, this.W / 2, y + 160, `${unlockedCount} of 25 unlocked · cosmetic only`, { size: 20, weight: '500', color: COLORS.muted });
    y += 200;

    const tabW = 128;
    CATEGORIES.forEach((cat, i) => {
      new Button(this, {
        x: this.W / 2 + (i - 2) * (tabW + 10),
        y: y + 10,
        width: tabW,
        height: 66,
        label: CATEGORY_LABELS[cat],
        variant: cat === this.category ? 'primary' : 'secondary',
        fontSize: 20,
        focus: this.focus,
        onClick: () => this.go('Collection', { category: cat }),
      });
    });
    y += 64;

    const items = cosmeticsIn(this.category);
    const cols = 3;
    const tileW = 206;
    const avail = this.H - y - this.safeBottom - 20;
    const rows = Math.ceil(items.length / cols);
    const tileH = Math.min(230, Math.floor(avail / rows) - 14);
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = this.W / 2 + (col - 1) * (tileW + 14);
      const ty = y + tileH / 2 + row * (tileH + 14);
      this.itemTile(item, x, ty, tileW, tileH);
    });
  }

  private itemTile(item: CosmeticItem, x: number, y: number, w: number, h: number): void {
    const save = GameContext.save;
    const unlocked = save.cosmetics.unlocked.includes(item.id) || requirementMet(save, item.requirement);
    const selected = save.cosmetics.selected[item.category] === item.id;
    const tile = new Tile(this, {
      x,
      y,
      width: w,
      height: h,
      name: `${item.name}${unlocked ? (selected ? ' (selected)' : '') : ' (locked)'}`,
      selected,
      focus: this.focus,
      onClick: () => {
        if (!unlocked) return;
        GameContext.update({
          ...GameContext.save,
          cosmetics: {
            unlocked: GameContext.save.cosmetics.unlocked.includes(item.id) ? GameContext.save.cosmetics.unlocked : [...GameContext.save.cosmetics.unlocked, item.id],
            selected: { ...GameContext.save.cosmetics.selected, [item.category]: item.id },
          },
        });
        this.scene.restart({ category: this.category });
      },
    });
    tile.add(createCosmeticPreview(this, item, 0, -h * 0.12, Math.min(w, h) * 0.5));
    tile.add(addText(this, 0, h / 2 - 50, item.name, { size: 22, weight: '700', color: unlocked ? COLORS.creamText : COLORS.muted }));
    if (unlocked) {
      tile.add(addText(this, 0, h / 2 - 22, selected ? 'Selected' : 'Tap to use', { size: 18, weight: '600', color: selected ? '#ffd36b' : COLORS.muted }));
    } else {
      const dim = this.add.graphics();
      dim.fillStyle(0x000000, 0.45);
      dim.fillRoundedRect(-w / 2, -h / 2, w, h, 24);
      drawIcon(dim, 'lock', 0, -h * 0.12, 40, 0xfff8ec, 0.95);
      tile.add(dim);
      tile.add(addText(this, 0, h / 2 - 22, describeRequirement(item.requirement, levelName), { size: 17, weight: '600', color: COLORS.creamText, wrapWidth: w - 16 }));
    }
  }
}

/** Preview of a cosmetic item centred on (x, y), about `size` units tall. */
export function createCosmeticPreview(scene: Phaser.Scene, item: CosmeticItem, x: number, y: number, size: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const [a, b, c] = item.colors;
  switch (item.category) {
    case 'costume':
    case 'shadowForm':
      drawRunner(g, { side: item.category === 'costume' ? 'real' : 'shadow', anim: 'idle', phase: 0, time: 0, colors: item.colors, glow: 0.5 });
      g.setPosition(x, y + size * 0.5).setScale(size / 95);
      break;
    case 'trail':
      for (let i = 0; i < 7; i++) {
        g.fillStyle(i % 2 ? b : a, 1 - i * 0.12);
        g.fillCircle(x + size * 0.6 - i * size * 0.2, y + Math.sin(i) * size * 0.15, size * (0.16 - i * 0.015));
      }
      break;
    case 'transition':
      g.lineStyle(6, a, 1);
      g.strokeCircle(x, y, size * 0.5);
      g.lineStyle(4, b, 1);
      g.strokeCircle(x, y, size * 0.32);
      g.fillStyle(c, 1);
      g.fillCircle(x, y, size * 0.14);
      break;
    case 'portal':
      g.fillStyle(b, 0.35);
      g.fillEllipse(x, y, size * 0.6, size * 1.05);
      g.lineStyle(8, a, 1);
      g.strokeEllipse(x, y, size * 0.62, size * 1.1);
      g.lineStyle(3, c, 1);
      g.strokeEllipse(x, y, size * 0.4, size * 0.8);
      break;
  }
  return g;
}

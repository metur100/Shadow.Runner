import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import { levelsOfWorld } from '../levels/LevelData';
import type { LevelDefinition } from '../levels/LevelDefinition';
import { WORLDS } from '../levels/WorldDefinitions';
import { lanePalette } from '../rendering/Themes';
import { isLevelUnlocked, isWorldUnlocked, worldStars } from '../systems/LevelManager';
import { Button } from '../ui/Button';
import { drawIcon } from '../ui/Icons';
import { StarRating } from '../ui/StarRating';
import { Tile } from '../ui/Tile';
import { addText } from '../ui/Typography';
import { worldSnapshot } from '../three/Portraits';
import { COLORS } from '../utils/Constants';
import { formatTime } from '../utils/MathUtils';
import { BaseScene } from './BaseScene';

/** All 30 levels, one world per page: completion, stars, best score and time, a mini map and locks. */
export class LevelSelectScene extends BaseScene {
  private world = 0;

  constructor() {
    super('LevelSelect');
  }

  init(data: { world?: number }): void {
    this.world = Math.max(0, Math.min(WORLDS.length - 1, data?.world ?? 0));
  }

  create(): void {
    const world = WORLDS[this.world];
    this.setupScene(`Levels of ${world.name}`);
    this.addTwinBackground(world.theme, false, this.H * 0.5);
    this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.6).setOrigin(0);
    let y = this.addHeader(world.name, () => this.go('WorldSelect'));
    const save = GameContext.save;

    // World tabs 1–6.
    const tabW = 92;
    WORLDS.forEach((w, i) => {
      const unlocked = isWorldUnlocked(save, w.id);
      new Button(this, {
        x: this.W / 2 + (i - 2.5) * (tabW + 12),
        y: y + 10,
        width: tabW,
        height: 70,
        label: unlocked ? String(i + 1) : undefined,
        icon: unlocked ? undefined : 'lock',
        variant: i === this.world ? 'primary' : 'secondary',
        fontSize: 30,
        focus: this.focus,
        disabled: !unlocked,
        onClick: () => this.go('LevelSelect', { world: i }),
      });
    });
    y += 74;
    addText(this, this.W / 2, y, `${world.tagline}  ·  ★ ${worldStars(save, world.id)}/15`, { size: 22, weight: '500', color: COLORS.muted });
    y += 30;

    const levels = levelsOfWorld(this.world);
    const avail = this.H - y - this.safeBottom - 20;
    const cardH = Math.min(170, Math.floor(avail / levels.length) - 14);
    levels.forEach((level, i) => {
      const cy = y + cardH / 2 + i * (cardH + 14);
      this.levelCard(level, cy, 660, cardH);
    });
  }

  private levelCard(level: LevelDefinition, y: number, w: number, h: number): void {
    const save = GameContext.save;
    const record = save.levels[level.id];
    const unlocked = isLevelUnlocked(save, level.index);
    const number = (level.index % 5) + 1;
    const tile = new Tile(this, {
      x: this.W / 2,
      y,
      width: w,
      height: h,
      name: `Level ${number} ${level.name}${unlocked ? '' : ' (locked)'}`,
      focus: this.focus,
      onClick: () => {
        if (unlocked) this.go('Gameplay', { mode: 'campaign', index: level.index });
      },
    });
    const previewW = 210;
    const previewH = h - 24;
    const g = this.add.graphics();
    drawLevelPreview(g, level, -w / 2 + 12, -previewH / 2, previewW, previewH);
    tile.add(g);
    this.time.delayedCall(60 + (level.index % 5) * 40, () => {
      const key = worldSnapshot(this, level.theme, level.shadowTheme ?? level.theme, previewW, previewH, level.index * 3 + 2);
      if (!key || !tile.active) return;
      const img = this.add.image(-w / 2 + 12, -previewH / 2, key).setOrigin(0).setDisplaySize(previewW, previewH);
      tile.addAt(img, tile.getIndex(g) + 1);
      g.destroy();
    });
    const tx = -w / 2 + previewW + 30;
    tile.add(addText(this, tx, -h / 2 + 30, `${number}. ${level.name}`, { size: 28, weight: '700', color: unlocked ? COLORS.creamText : COLORS.muted, origin: [0, 0.5] }));
    if (unlocked) {
      const stars = new StarRating(this, tx + 52, 4, 30, 8, 0x5a5478);
      stars.setStars(record?.stars ?? 0);
      tile.add(stars);
      const info = record?.completed
        ? `Best ${record.bestScore}  ·  ${formatTime(record.bestTime)}`
        : record?.bestProgress
          ? `Best progress ${Math.round(record.bestProgress * 100)} %`
          : level.tutorialText;
      tile.add(addText(this, tx, h / 2 - 28, info, { size: 19, weight: '500', color: COLORS.muted, origin: [0, 0.5], wrapWidth: w - previewW - 60 }));
      if (record?.completed) {
        const check = this.add.graphics();
        check.fillStyle(COLORS.good, 1);
        check.fillCircle(w / 2 - 34, -h / 2 + 30, 18);
        drawIcon(check, 'check', w / 2 - 34, -h / 2 + 30, 22, 0xffffff, 1);
        tile.add(check);
      }
      // Difficulty dots.
      const dots = this.add.graphics();
      for (let i = 0; i < 10; i++) {
        dots.fillStyle(i < level.difficulty ? 0xff8a3d : 0xffffff, i < level.difficulty ? 1 : 0.15);
        dots.fillCircle(w / 2 - 30 - (9 - i) * 13, 6, 4.5);
      }
      tile.add(dots);
    } else {
      const lock = this.add.graphics();
      drawIcon(lock, 'lock', tx + 16, 8, 28, 0xfff8ec, 0.8);
      tile.add(lock);
      tile.add(addText(this, tx + 42, 8, 'Finish the previous level', { size: 21, weight: '500', color: COLORS.muted, origin: [0, 0.5] }));
      const dim = this.add.graphics();
      dim.fillStyle(0x000000, 0.5);
      dim.fillRoundedRect(-w / 2 + 12, -previewH / 2, previewW, previewH, 12);
      tile.add(dim);
    }
  }
}

/**
 * Mini map of a level: the first part of both lanes, scaled down, with walls, lights, pits, spikes and
 * gates marked in simple shapes.
 */
export function drawLevelPreview(g: Phaser.GameObjects.Graphics, level: LevelDefinition, x: number, y: number, w: number, h: number): void {
  const real = lanePalette(level.theme, 'real');
  const shadow = lanePalette(level.shadowTheme ?? level.theme, 'shadow');
  const half = h / 2;
  g.fillGradientStyle(real.skyTop, real.skyTop, real.skyBottom, real.skyBottom, 1);
  g.fillRect(x, y, w, half);
  g.fillGradientStyle(shadow.skyTop, shadow.skyTop, shadow.skyBottom, shadow.skyBottom, 1);
  g.fillRect(x, y + half, w, half);
  const span = 3600;
  const sx = w / span;
  const ground = half * 0.82;
  g.fillStyle(real.ground, 1);
  g.fillRect(x, y + ground, w, half - ground);
  g.fillStyle(shadow.ground, 1);
  g.fillRect(x, y + half + ground, w, half - ground);
  for (const o of level.obstacles) {
    const ox = o.x - 400;
    if (ox < 0 || ox > span) continue;
    const px = x + ox * sx;
    const pw = Math.max(4, o.w * sx);
    const base = o.side === 'real' ? y + ground : y + half + ground;
    switch (o.kind) {
      case 'wall':
        g.fillStyle(o.side === 'real' ? real.solidEdge : shadow.solidEdge, 1);
        g.fillRect(px, base - ((o.h ?? 300) / 300) * ground * 0.8, pw + 1, ((o.h ?? 300) / 300) * ground * 0.8);
        break;
      case 'lightZone':
        g.fillStyle(0xfff1a8, 0.75);
        g.fillRect(px, base - ground, pw, ground);
        break;
      case 'pit':
        g.fillStyle(0x000000, 0.7);
        g.fillRect(px, base, pw, half - ground);
        break;
      case 'spikes':
      case 'blade':
        g.fillStyle(0xff4d5e, 1);
        g.fillTriangle(px, base, px + pw, base, px + pw / 2, base - 5);
        break;
      case 'gate':
      case 'laser':
        g.fillStyle(0xff4d5e, 0.9);
        g.fillRect(px, base - ground, 2, ground);
        break;
      case 'shadowWall':
        g.fillStyle(shadow.solidEdge, 0.5);
        g.fillRect(px, base - ground * 0.8, pw, ground * 0.8);
        break;
      default:
        break;
    }
  }
  g.fillStyle(0xffffff, 0.9);
  g.fillRect(x, y + half - 1, w, 2);
  g.lineStyle(2, 0xffffff, 0.35);
  g.strokeRoundedRect(x, y, w, h, 12);
}

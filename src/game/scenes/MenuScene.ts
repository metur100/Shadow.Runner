import { GameContext } from '../GameContext';
import { LEVELS } from '../levels/LevelData';
import { WORLDS } from '../levels/WorldDefinitions';
import { AudioManager } from '../systems/AudioManager';
import { dailyLabel, todayKey } from '../systems/DailyChallenge';
import { isEndlessUnlocked, nextLevelIndex, totalStars } from '../systems/LevelManager';
import { Button } from '../ui/Button';
import { drawIcon } from '../ui/Icons';
import { drawLogo } from '../ui/Logo';
import { addText } from '../ui/Typography';
import { COLORS } from '../utils/Constants';
import { BaseScene } from './BaseScene';

/** Main menu over an animated two-world background. */
export class MenuScene extends BaseScene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.setupScene('Main menu');
    AudioManager.playMusic(true);
    AudioManager.setMood('real');
    const { W, H } = this;
    const save = GameContext.save;
    const next = LEVELS[nextLevelIndex(save)];
    // A tall 3D view of both worlds: the logo above, the runner below it, the menu under the seam.
    const seam = Math.round(H * 0.44);
    this.addTwinBackground(WORLDS[next.worldId].theme, true, seam);

    const logoY = this.safeTop + 104;
    drawLogo(this, W / 2, logoY, 0.64);

    // Stars counter.
    const stars = totalStars(save);
    const chip = this.add.graphics();
    chip.fillStyle(0x000000, 0.35);
    chip.fillRoundedRect(20, this.safeTop + 18, 170, 52, 26);
    drawIcon(chip, 'star', 50, this.safeTop + 44, 32, COLORS.star, 1);
    addText(this, 118, this.safeTop + 44, `${stars} / 90`, { size: 26, weight: '700', color: COLORS.creamText });

    const done = save.levels[next.id]?.completed;
    const playLabel = save.stats.runs === 0 ? 'Play' : done ? 'Play again' : 'Continue';
    // Centre the button block in the space below the seam (it is about 560 units tall).
    let y = seam + Math.max(110, (H - seam - this.safeBottom - 560) / 2 + 74);
    new Button(this, {
      x: W / 2,
      y,
      width: 520,
      height: 128,
      label: playLabel,
      subLabel: `World ${next.worldId + 1} · Level ${(next.index % 5) + 1} – ${next.name}`,
      icon: 'play',
      variant: 'primary',
      fontSize: 44,
      focus: this.focus,
      onClick: () => this.go('Gameplay', { mode: 'campaign', index: next.index }),
    });
    y += 128;

    const gridW = 250;
    const gap = 20;
    const rows: [string, Parameters<typeof drawIcon>[1], () => void, string?][] = [
      ['Worlds', 'home', () => this.go('WorldSelect')],
      ['Levels', 'levels', () => this.go('LevelSelect', { world: next.worldId })],
      ['Daily', 'calendar', () => this.go('Gameplay', { mode: 'daily' }), this.dailySub()],
      ['Endless', 'infinity', () => this.endless(), isEndlessUnlocked(save) ? `Best ${save.endless.bestDistance} m` : 'Finish World 1'],
      ['Collection', 'shirt', () => this.go('Collection')],
      ['Settings', 'gear', () => this.go('Settings', { from: 'Menu' })],
    ];
    rows.forEach(([label, icon, onClick, sub], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      new Button(this, {
        x: W / 2 + (col === 0 ? -(gridW + gap) / 2 : (gridW + gap) / 2),
        y: y + row * 112,
        width: gridW,
        height: 96,
        label,
        subLabel: sub,
        icon: label === 'Endless' && !isEndlessUnlocked(save) ? 'lock' : icon,
        variant: 'secondary',
        fontSize: 30,
        focus: this.focus,
        onClick,
      });
    });
    y += 3 * 112 + 10;
    new Button(this, {
      x: W / 2,
      y,
      width: 300,
      height: 72,
      label: 'How to play',
      icon: 'hint',
      variant: 'ghost',
      fontSize: 26,
      focus: this.focus,
      onClick: () => this.go('Tutorial'),
    });
    addText(this, W / 2, H - this.safeBottom - 26, 'Made by Medin Turkes', { size: 20, weight: '500', color: COLORS.muted });
  }

  private dailySub(): string {
    const best = GameContext.save.daily.best[todayKey()];
    return best ? `Best ${best}` : dailyLabel(todayKey());
  }

  private endless(): void {
    if (isEndlessUnlocked(GameContext.save)) {
      this.go('Endless');
      return;
    }
    const toast = addText(this, this.W / 2, this.H - this.safeBottom - 70, 'Finish World 1 to unlock Endless mode', {
      size: 26,
      weight: '600',
      color: COLORS.creamText,
      stroke: '#1d1838',
      strokeThickness: 6,
    });
    this.tweens.add({ targets: toast, alpha: 0, delay: 1600, duration: 400, onComplete: () => toast.destroy() });
  }
}

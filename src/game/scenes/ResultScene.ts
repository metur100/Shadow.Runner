import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import { LEVELS } from '../levels/LevelData';
import type { Side } from '../levels/LevelDefinition';
import { WORLDS } from '../levels/WorldDefinitions';
import { Monetization } from '../monetization/MonetizationManager';
import { drawRunner } from '../rendering/CharacterRenderer';
import { AudioManager } from '../systems/AudioManager';
import { selectedColors } from '../systems/Cosmetics';
import { todayKey } from '../systems/DailyChallenge';
import { isLevelUnlocked } from '../systems/LevelManager';
import type { FailReason } from '../systems/RunSession';
import type { RunStats, ScoreBreakdown } from '../systems/ScoreSystem';
import { Button } from '../ui/Button';
import { drawIcon, type IconName } from '../ui/Icons';
import { Modal } from '../ui/Modal';
import { StarRating } from '../ui/StarRating';
import { addText } from '../ui/Typography';
import { COLORS } from '../utils/Constants';
import { formatTime } from '../utils/MathUtils';
import { BaseScene } from './BaseScene';
import { FAIL_TEXT, formName, type GameMode } from './GameplayScene';

export interface ResultData {
  mode: GameMode;
  levelIndex: number;
  levelName: string;
  stats: RunStats;
  score: ScoreBreakdown | null;
  required: number;
  failReason: FailReason | null;
  failForm: Side | null;
  failX: number;
  newBest: boolean;
  unlockedLevel: string | null;
  unlockedWorld: number | null;
  newCosmetics: string[];
  distance?: number;
  bestDistance?: number;
}

export const HINTS: Record<FailReason, string> = {
  wall: 'Tall walls stop your physical self. Tap to switch to your shadow just before the wall – the shadow phases straight through.',
  light: 'Light destroys your shadow. Switch back to your physical self before the bright cone – watch for the LIGHT AHEAD warning.',
  spikes: 'Swipe up to jump the spikes, a little before you reach them. Each form only fears the spikes in its own world.',
  ceiling: 'Swipe down to slide under low barriers and roots. A slide in the air drops you to the ground quickly.',
  fell: 'Jump gaps just before the edge. Gaps that are too wide need a bridge or a platform – look for a switch in the other world.',
  gate: 'Closed gates need their switch: run into the lever, plate or key first – it is usually in the other world.',
  laser: 'Lasers blink on and off. If one is on when you arrive, switch to the shadow below and jump its spikes.',
  blade: 'Jump over low blades and slide under hanging gears – or pass that spot in the other world.',
  pendulum: 'Pendulums swing in a steady rhythm. Jump just as the weight swings towards you.',
  falling: 'Crates drop when you get close. Let them land, then jump over them.',
  train: 'Trains only run in the reality world. Be your shadow while the train passes.',
  missedPortal: 'Required portals must be entered. The arrow above a portal shows which world it sends you to – be in the other one when you reach it.',
  time: 'Respawning costs time. Reach checkpoints and keep moving!',
};

/** Success, failure, daily, endless and tutorial results. */
export class ResultScene extends BaseScene {
  private result!: ResultData;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.result = data;
  }

  create(): void {
    const r = this.result;
    const success = r.stats.completed;
    const level = r.levelIndex >= 0 ? LEVELS[r.levelIndex] : null;
    const theme = level ? WORLDS[level.worldId].theme : 'eclipse';
    this.setupScene(success ? `${r.levelName} complete` : `Run over. ${r.failReason ? FAIL_TEXT[r.failReason] : ''}`);
    AudioManager.playMusic(true);
    this.addTwinBackground(theme, false, this.H * 0.3);
    this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.45).setOrigin(0);
    const { W } = this;
    let y = this.safeTop + 74;

    const title =
      r.mode === 'tutorial' ? 'Tutorial complete!' : r.mode === 'endless' ? 'Run over' : success ? (r.mode === 'daily' ? 'Daily complete!' : 'Level complete!') : 'Run failed';
    addText(this, W / 2, y, title, { size: 56, weight: '700', color: success || r.mode === 'endless' ? COLORS.creamText : '#ffb3bb', shadow: true });
    y += 56;
    addText(this, W / 2, y, r.mode === 'daily' ? `Daily challenge · ${todayKey()}` : r.levelName, { size: 28, weight: '500', color: COLORS.muted });
    y += 160;

    this.addCharacters(y, success);
    y += 100;

    if (r.mode === 'tutorial') {
      y = this.tutorialBody(y);
    } else if (!success && r.mode !== 'endless') {
      y = this.failureBody(y);
    } else {
      y = this.scoreBody(y);
    }
    this.buttons(y + 20);
  }

  private addCharacters(y: number, success: boolean): void {
    const save = GameContext.save;
    const colors = { real: selectedColors(save.cosmetics.selected, 'costume'), shadow: selectedColors(save.cosmetics.selected, 'shadowForm') };
    const g1 = this.add.graphics().setPosition(this.W / 2 - 70, y);
    const g2 = this.add.graphics().setPosition(this.W / 2 + 70, y);
    const failed = this.result.failForm;
    let t = 0;
    const draw = () => {
      for (const [g, side] of [
        [g1, 'real'],
        [g2, 'shadow'],
      ] as [Phaser.GameObjects.Graphics, Side][]) {
        g.clear();
        const hurt = !success && failed === side;
        drawRunner(g, {
          side,
          anim: hurt ? 'hit' : success ? 'jump' : 'idle',
          phase: 0,
          time: t,
          colors: colors[side],
          cheer: success,
          glow: hurt ? 0 : 0.6,
        });
        // Celebrating forms bounce.
        g.y = y - (success && !GameContext.reducedMotion ? Math.abs(Math.sin(t * 5 + (side === 'real' ? 0 : 1.2))) * 26 : 0);
        g.setAlpha(hurt ? 0.6 : 1);
      }
    };
    draw();
    if (!GameContext.reducedMotion) {
      this.events.on('update', (_time: number, delta: number) => {
        t += delta / 1000;
        draw();
      });
    }
    if (!success && failed) {
      addText(this, failed === 'real' ? this.W / 2 - 70 : this.W / 2 + 70, y + 26, formName(failed), { size: 20, weight: '700', color: '#ffb3bb' });
    }
  }

  private scoreBody(y: number): number {
    const r = this.result;
    const { W } = this;
    const score = r.score!;
    if (r.mode === 'endless') {
      addText(this, W / 2, y, `${r.distance ?? 0} m`, { size: 76, weight: '700', color: COLORS.creamText });
      y += 66;
      addText(this, W / 2, y, r.newBest ? 'New best distance!' : `Best: ${r.bestDistance ?? 0} m`, { size: 28, weight: '600', color: r.newBest ? '#ffd36b' : COLORS.muted });
      if (r.failReason) {
        y += 44;
        addText(this, W / 2, y, `${r.failForm ? formName(r.failForm) + ': ' : ''}${FAIL_TEXT[r.failReason]}`, { size: 22, weight: '500', color: '#ffb3bb', wrapWidth: 600 });
      }
      y += 60;
    } else {
      const stars = new StarRating(this, W / 2, y, 86, 26, 0x5a5478);
      stars.setStars(score.stars, !GameContext.reducedMotion, (i) => AudioManager.star(i));
      y += 92;
      const total = addText(this, W / 2, y, '0', { size: 64, weight: '700', color: COLORS.creamText });
      const counter = { v: 0 };
      this.tweens.add({ targets: counter, v: score.total, duration: GameContext.reducedMotion ? 1 : 1100, ease: 'Cubic.easeOut', onUpdate: () => total.setText(String(Math.round(counter.v))) });
      if (r.newBest) {
        y += 50;
        addText(this, W / 2, y, 'New best score!', { size: 26, weight: '700', color: '#ffd36b' });
      }
      y += 54;
      const goals = addText(this, W / 2, y, this.starGoals(), { size: 20, weight: '500', color: COLORS.muted, wrapWidth: 620 });
      y += goals.height / 2 + 20;
    }
    y = this.statsPanel(y);
    const notes: string[] = [];
    if (r.unlockedLevel) notes.push(`Unlocked: ${r.unlockedLevel}`);
    if (r.unlockedWorld !== null) notes.push(`New world: ${WORLDS[r.unlockedWorld].name}`);
    for (const c of r.newCosmetics) notes.push(`New in your collection: ${c}`);
    for (const n of notes.slice(0, 3)) {
      addText(this, W / 2, y, n, { size: 23, weight: '600', color: '#7affd4' });
      y += 34;
    }
    return y;
  }

  private starGoals(): string {
    const r = this.result;
    const collected = r.stats.coins + r.stats.crystals;
    const two = collected >= r.required ? '✓' : '✗';
    const three = r.stats.damage === 0 ? '✓' : '✗';
    return `★ finish ✓   ★★ ${r.required} coins + crystals ${two}   ★★★ no damage ${three} and efficient switching`;
  }

  private statsPanel(y: number): number {
    const r = this.result;
    const s = r.stats;
    const rows: [IconName, string, string][] = [
      ['clock', 'Time', formatTime(s.timeUsed)],
      ['coin', 'Coins', String(s.coins)],
      ['crystal', 'Crystals', String(s.crystals)],
      ['swap', 'Switches', String(s.switches)],
      ['heart', 'Damage', `${s.damage} ${s.damage === 1 ? 'hit' : 'hits'}`],
      ['star', 'Near misses', String(s.nearMisses)],
    ];
    const { W } = this;
    const panelW = 600;
    const rowH = 46;
    const cols = 2;
    const h = Math.ceil(rows.length / cols) * rowH + 24;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(W / 2 - panelW / 2, y, panelW, h, 22);
    rows.forEach(([icon, label, value], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = W / 2 - panelW / 2 + 30 + col * (panelW / 2);
      const yy = y + 12 + rowH / 2 + row * rowH;
      drawIcon(g, icon, x + 12, yy, 24, icon === 'coin' ? COLORS.coin : icon === 'crystal' ? COLORS.crystal : 0xfff8ec, 1);
      addText(this, x + 36, yy, label, { size: 22, weight: '500', color: COLORS.muted, origin: [0, 0.5] });
      addText(this, x + panelW / 2 - 60, yy, value, { size: 24, weight: '700', color: COLORS.creamText, origin: [1, 0.5] });
    });
    return y + h + 20;
  }

  private failureBody(y: number): number {
    const r = this.result;
    const { W } = this;
    const reason = r.failReason ? FAIL_TEXT[r.failReason] : 'The run ended';
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(W / 2 - 300, y - 10, 600, 120, 24);
    g.lineStyle(3, 0xff5d73, 1);
    g.strokeRoundedRect(W / 2 - 300, y - 10, 600, 120, 24);
    addText(this, W / 2, y + 26, reason, { size: 32, weight: '700', color: '#ffb3bb', wrapWidth: 560 });
    addText(this, W / 2, y + 72, `${r.failForm ? formName(r.failForm) : ''} · reached ${Math.round(r.stats.progress * 100)} %`, { size: 22, weight: '500', color: COLORS.muted });
    y += 150;
    return this.statsPanel(y);
  }

  private tutorialBody(y: number): number {
    const lines = ['Tap: switch between your physical self and your shadow', 'Swipe up: jump · Swipe down: slide', 'Shadows pass walls · light destroys shadows', 'Switches change the other world'];
    for (const line of lines) {
      addText(this, this.W / 2, y, line, { size: 25, weight: '600', color: COLORS.creamText, wrapWidth: 620 });
      y += 48;
    }
    return y + 20;
  }

  private buttons(y: number): void {
    const r = this.result;
    const { W } = this;
    const level = r.levelIndex >= 0 ? LEVELS[r.levelIndex] : null;
    const success = r.stats.completed;
    const actions: { label: string; icon: IconName; variant: 'primary' | 'secondary'; onClick: () => void }[] = [];
    if (r.mode === 'tutorial') {
      actions.push({ label: 'Start World 1', icon: 'play', variant: 'primary', onClick: () => this.go('Gameplay', { mode: 'campaign', index: 0 }) });
      actions.push({ label: 'Menu', icon: 'home', variant: 'secondary', onClick: () => this.go('Menu') });
    } else if (r.mode === 'campaign' && level) {
      const next = LEVELS[level.index + 1];
      if (success && next && isLevelUnlocked(GameContext.save, next.index)) {
        actions.push({ label: 'Next level', icon: 'next', variant: 'primary', onClick: () => this.go('Gameplay', { mode: 'campaign', index: next.index }) });
      }
      actions.push({ label: 'Retry', icon: 'retry', variant: success && next ? 'secondary' : 'primary', onClick: () => this.go('Gameplay', { mode: 'campaign', index: level.index }) });
      if (!success && r.failReason) actions.push({ label: 'Hint', icon: 'hint', variant: 'secondary', onClick: () => this.showHint() });
      actions.push({ label: success ? 'Level select' : 'Exit', icon: 'levels', variant: 'secondary', onClick: () => this.go('LevelSelect', { world: level.worldId }) });
    } else if (r.mode === 'daily') {
      actions.push({ label: 'Retry daily', icon: 'retry', variant: 'primary', onClick: () => this.go('Gameplay', { mode: 'daily' }) });
      if (!success && r.failReason) actions.push({ label: 'Hint', icon: 'hint', variant: 'secondary', onClick: () => this.showHint() });
      actions.push({ label: 'Menu', icon: 'home', variant: 'secondary', onClick: () => this.go('Menu') });
    } else {
      actions.push({ label: 'Run again', icon: 'retry', variant: 'primary', onClick: () => this.go('Endless') });
      if (r.failReason) actions.push({ label: 'Hint', icon: 'hint', variant: 'secondary', onClick: () => this.showHint() });
      actions.push({ label: 'Menu', icon: 'home', variant: 'secondary', onClick: () => this.go('Menu') });
    }
    const primary = actions.filter((a) => a.variant === 'primary');
    const rest = actions.filter((a) => a.variant !== 'primary');
    for (const a of primary) {
      new Button(this, { x: W / 2, y: y + 48, width: 460, height: 100, label: a.label, icon: a.icon, variant: 'primary', fontSize: 36, focus: this.focus, onClick: a.onClick });
      y += 116;
    }
    const w = rest.length === 3 ? 200 : 260;
    rest.forEach((a, i) => {
      const x = W / 2 + (i - (rest.length - 1) / 2) * (w + 16);
      new Button(this, { x, y: y + 44, width: w, height: 84, label: a.label, icon: a.icon, variant: 'secondary', fontSize: 26, focus: this.focus, onClick: a.onClick });
    });
    this.focus.onBack = () => (r.mode === 'campaign' && level ? this.go('LevelSelect', { world: level.worldId }) : this.go('Menu'));
  }

  private showHint(): void {
    const r = this.result;
    if (!r.failReason) return;
    const actions: { label: string; variant?: 'primary' | 'secondary'; icon?: IconName; onClick: () => void }[] = [
      { label: 'Got it', variant: 'primary', icon: 'check', onClick: () => modal.close() },
    ];
    // Optional rewarded hint – only offered when an ad provider is configured (never by default).
    if (Monetization.rewardedHintAvailable(GameContext.save.entitlements)) {
      actions.push({ label: 'Watch for an extra tip', icon: 'play', onClick: () => void Monetization.showRewardedHint() });
    }
    const modal = new Modal(this, this.focus, { title: 'Hint', message: HINTS[r.failReason], actions }, { width: this.W, height: this.H });
  }
}

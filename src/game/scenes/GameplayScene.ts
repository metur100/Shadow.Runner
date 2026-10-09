import Phaser from 'phaser';

import { nextLightDistance } from '../entities/LightZone';
import { GameContext } from '../GameContext';
import { LEVELS } from '../levels/LevelData';
import type { Form, LevelDefinition, Side, TutorialStep } from '../levels/LevelDefinition';
import { drawRunnerBack } from '../rendering/CharacterRenderer';
import { FxPool } from '../rendering/FxPool';
import { gameplayLayout, type GameplayLayout } from '../rendering/Layout';
import { LaneView } from '../rendering/LaneView';
import { backgroundScale, trimLaneTextures } from '../rendering/TextureFactory';
import { AudioManager } from '../systems/AudioManager';
import { selectedColors } from '../systems/Cosmetics';
import { buildDailyLevel, todayKey } from '../systems/DailyChallenge';
import { recordDailyResult, recordLevelResult } from '../systems/LevelManager';
import { RunSession, type FailReason, type SimEvent } from '../systems/RunSession';
import { computeScore } from '../systems/ScoreSystem';
import { Modal } from '../ui/Modal';
import { addText } from '../ui/Typography';
import { MAX_SIM_STEPS_PER_FRAME, SIM_STEP } from '../utils/Constants';
import { Haptics } from '../utils/Haptics';
import { announce, BaseScene } from './BaseScene';
import { GameplayHud } from './gameplay/GameplayHud';
import { RunEffects } from './gameplay/RunEffects';
import { RunInput } from './gameplay/RunInput';
import type { ResultData } from './ResultScene';

export type GameMode = 'campaign' | 'daily' | 'endless' | 'tutorial';

export interface GameplayData {
  mode: GameMode;
  /** Campaign level index. */
  index?: number;
}

export const FAIL_TEXT: Record<FailReason, string> = {
  wall: 'Crashed into a wall',
  spikes: 'Ran into spikes',
  ceiling: 'Hit a low barrier',
  light: 'The light destroyed your shadow',
  laser: 'Zapped by a laser',
  blade: 'Caught by a spinning blade',
  pendulum: 'Hit by a pendulum',
  falling: 'Crushed by a falling crate',
  train: 'Hit by a train',
  gate: 'Blocked by a closed gate',
  fell: 'Fell into a gap',
  missedPortal: 'Missed a required portal',
  time: 'Ran out of time',
};

export const formName = (side: Side): string => (side === 'real' ? 'Physical form' : 'Shadow form');

/**
 * The run: two lanes (reality above, shadow below) scrolling in sync, the two forms, the HUD and the
 * controls. The simulation (RunSession) advances in fixed 60 Hz steps; this scene feeds it input,
 * renders its state and turns its events into sound, haptics and effects.
 */
export class GameplayScene extends BaseScene {
  data0!: GameplayData;
  mode: GameMode = 'campaign';
  level!: LevelDefinition;
  session!: RunSession;
  layout!: GameplayLayout;
  lanes!: Record<Side, LaneView>;
  hud!: GameplayHud;
  protected input2!: RunInput;
  private effects!: RunEffects;
  private fx!: FxPool;
  private chars!: Record<Side, Phaser.GameObjects.Graphics>;
  private colors!: Record<Side, [number, number, number]>;
  private trailCosmetic = 'sparks';
  private trailColors: [number, number, number] = [0xffffff, 0xffffff, 0xffffff];
  private acc = 0;
  private phase = 0;
  private lastStride = 0;
  private trailTimer = 0;
  private warnTimer = 0;
  private visualTime = 0;
  /** Frozen before the start countdown, while paused and during tutorial prompts. */
  protected frozen = true;
  paused = false;
  /** Set by automation (screenshots / smoke test): stops the clock without any UI. */
  private held = false;
  private finished = false;
  private pauseModal: Modal | null = null;
  private tipIndex = 0;
  private lastTrigger: { x: number; y: number; color: number } | null = null;
  private hitForm: Side | null = null;
  private readonly onBlur = () => this.pause();
  /** State at the start of the run (used by the screenshot / test automation). */
  initialSnapshot!: ReturnType<RunSession['fullSnapshot']>;

  constructor(key = 'Gameplay') {
    super(key);
  }

  init(data: GameplayData): void {
    this.data0 = { mode: data?.mode ?? 'campaign', index: data?.index ?? 0 };
    this.mode = this.data0.mode;
    this.acc = 0;
    this.phase = 0;
    this.frozen = true;
    this.paused = false;
    this.finished = false;
    this.pauseModal = null;
    this.tipIndex = 0;
    this.lastTrigger = null;
    this.hitForm = null;
    this.visualTime = 0;
    this.held = false;
  }

  /** Builds the level for this mode (overridden by the tutorial and endless scenes). */
  protected buildLevel(data: GameplayData): LevelDefinition {
    if (data.mode === 'daily') return buildDailyLevel(todayKey());
    return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, data.index ?? 0))];
  }

  protected createSession(level: LevelDefinition): RunSession {
    return new RunSession(level);
  }

  protected get tag(): string {
    if (this.mode === 'daily') return 'Daily';
    if (this.mode === 'tutorial') return '';
    if (this.mode === 'endless') return 'Endless';
    return `${this.level.worldId + 1}-${(this.level.index % 5) + 1}`;
  }

  create(): void {
    this.level = this.buildLevel(this.data0);
    this.setupScene(`${this.level.name}. ${this.level.tutorialText}`);
    this.focus.gameplayKeys = true;
    this.layout = gameplayLayout(this.H, this.safeTop, this.safeBottom);
    this.session = this.createSession(this.level);
    this.initialSnapshot = this.session.fullSnapshot();
    const save = GameContext.save;
    const settings = save.settings;
    const profile = GameContext.profile;
    const realTheme = this.level.theme;
    const shadowTheme = this.level.shadowTheme ?? this.level.theme;
    trimLaneTextures(this, ['city', realTheme, shadowTheme]);
    const scale = backgroundScale(this.k, profile.lowEnd);
    const portalColors = selectedColors(save.cosmetics.selected, 'portal');
    const ambient = Math.round(profile.maxParticles * 0.15);
    const laneOpts = {
      height: this.layout.laneH,
      width: this.W,
      textureScale: scale,
      highContrast: settings.highContrast,
      reducedMotion: settings.reducedMotion,
      portalColors,
      ambientParticles: settings.reducedMotion ? 0 : ambient,
      detail: !profile.lowEnd,
    };
    this.lanes = {
      real: new LaneView(this, this.session, { ...laneOpts, side: 'real', theme: realTheme, top: this.layout.realTop }),
      shadow: new LaneView(this, this.session, { ...laneOpts, side: 'shadow', theme: shadowTheme, top: this.layout.shadowTop }),
    };
    this.colors = { real: selectedColors(save.cosmetics.selected, 'costume'), shadow: selectedColors(save.cosmetics.selected, 'shadowForm') };
    this.trailCosmetic = save.cosmetics.selected.trail;
    this.trailColors = selectedColors(save.cosmetics.selected, 'trail');
    this.chars = { real: this.add.graphics(), shadow: this.add.graphics() };
    for (const side of ['real', 'shadow'] as const) this.lanes[side].actors.add(this.chars[side]);

    const fxLayer = this.add.container(0, 0).setDepth(44);
    this.fx = new FxPool(this, fxLayer, settings.reducedMotion ? 20 : profile.maxParticles);
    this.effects = new RunEffects(
      this,
      this.fx,
      {
        layout: this.layout,
        width: this.W,
        reducedMotion: settings.reducedMotion,
        transition: save.cosmetics.selected.transition,
        transitionColors: selectedColors(save.cosmetics.selected, 'transition'),
      },
      this.level.chase === true,
    );
    this.hud = new GameplayHud(this, {
      layout: this.layout,
      level: this.level,
      tag: this.tag,
      endless: this.mode === 'endless',
      leftHanded: settings.leftHanded,
      reducedMotion: settings.reducedMotion,
      onPause: () => this.pause(),
      onSwitch: () => this.playerSwitch(),
      onJump: () => this.playerJump(0.6),
      onSlide: () => this.playerSlide(),
    });
    this.input2 = new RunInput(
      this,
      {
        switchForm: () => this.playerSwitch(),
        jump: (s) => this.playerJump(s),
        extendJump: (s) => this.session.extendJump(s),
        releaseJump: () => this.session.releaseJump(),
        slide: () => this.playerSlide(),
        tap: (x, y) => this.playerTap(x, y),
        interact: () => this.playerInteract(),
        pause: () => this.pause(),
        restart: () => this.restart(),
      },
      (pointer) => ({ x: pointer.worldX, y: pointer.worldY }),
    );

    this.applyForm(this.session.active, false);
    this.hud.update(this.session, 0);
    for (const side of ['real', 'shadow'] as const) this.lanes[side].update(this.session.x, this.session.t, 0);

    AudioManager.playMusic(true);
    window.addEventListener('blur', this.onBlur);
    this.game.events.on('hidden', this.onBlur);
    this.events.once('shutdown', () => {
      window.removeEventListener('blur', this.onBlur);
      this.game.events.off('hidden', this.onBlur);
      this.lanes.real.destroy();
      this.lanes.shadow.destroy();
    });
    this.events.on('resume', () => this.afterSettings());
    this.startIntro();
  }

  /** Level banner, then "Ready – Go!". */
  protected startIntro(): void {
    this.hud.banner(this.level.name, this.level.tutorialText, this.mode === 'daily' ? 0xffc83d : 0x9fe8ff, 1300);
    const delay = GameContext.reducedMotion ? 900 : 1500;
    this.time.delayedCall(delay, () => {
      this.hud.toast('GO!', 0x9fe8ff, 500);
      this.frozen = false;
    });
  }

  // ───────────────────────────── player actions ─────────────────────────────

  /** Hook for the tutorial: return false to swallow the action. */
  protected allowAction(_action: 'switch' | 'jump' | 'slide' | 'tap'): boolean {
    return !this.frozen;
  }

  protected playerSwitch(): void {
    if (this.paused || !this.allowAction('switch')) return;
    this.session.switchForm();
    this.processEvents();
  }

  protected playerJump(strength: number): void {
    if (this.paused || !this.allowAction('jump')) return;
    this.session.jump(strength);
  }

  protected playerSlide(): void {
    if (this.paused || !this.allowAction('slide')) return;
    this.session.slide();
    this.processEvents();
  }

  private playerInteract(): void {
    if (this.paused || this.frozen) return;
    this.session.interact();
    this.processEvents();
  }

  /** Tap: on the active character it uses a nearby switch; anywhere else it switches form. */
  protected playerTap(x: number, y: number): void {
    if (this.paused) return;
    if (!this.allowAction('tap')) return;
    const form = this.session.activeForm;
    const lane = this.lanes[form.side];
    const cy = lane.screenY(form.h + 50);
    if (Math.abs(x - lane.runnerX) < 70 && Math.abs(y - cy) < 90 && this.session.interact()) {
      this.processEvents();
      return;
    }
    this.playerSwitch();
  }

  // ───────────────────────────── loop ─────────────────────────────

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    GameContext.governor.record(delta);
    this.input2.update(dt);
    if (!this.frozen && !this.paused && !this.finished && !this.held) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM_STEP && steps < MAX_SIM_STEPS_PER_FRAME) {
        if (this.beforeStep()) {
          this.acc = 0;
          break;
        }
        this.session.step(SIM_STEP);
        this.processEvents();
        this.acc -= SIM_STEP;
        steps++;
      }
      if (steps === MAX_SIM_STEPS_PER_FRAME) this.acc = 0;
    }
    this.render(dt);
  }

  /** Hook for the tutorial: return true to freeze before this step. */
  protected beforeStep(): boolean {
    const steps = this.level.tutorialSteps;
    if (this.mode !== 'tutorial' && steps && this.tipIndex < steps.length && this.session.x >= steps[this.tipIndex].x) {
      this.showTip(steps[this.tipIndex++]);
    }
    return false;
  }

  protected showTip(step: TutorialStep): void {
    this.hud.toast(step.text, 0xfff1a8, 2800);
    announce(step.text);
  }

  private render(dt: number): void {
    const s = this.session;
    const paused = this.paused || this.frozen || this.held;
    const vdt = paused ? 0 : dt;
    this.visualTime += dt;
    if (s.state === 'running' && !paused) this.phase += (s.speed * vdt) / 24;
    const scroll = s.x;
    this.lanes.real.update(scroll, s.t, vdt);
    this.lanes.shadow.update(scroll, s.t, vdt);
    this.drawCharacters(vdt);
    this.hud.update(s, dt);
    this.effects.update(vdt, this.visualTime);
    this.fx.update(vdt);

    // Footsteps of the active form.
    const stride = Math.floor(this.phase / Math.PI);
    if (stride !== this.lastStride) {
      this.lastStride = stride;
      const f = s.activeForm;
      if (f.onGround && s.state === 'running' && !paused) AudioManager.footstep(f.side);
    }

    // Light-ahead warning while the shadow is solid.
    let warn = false;
    if (s.isSolid('shadow') && s.state === 'running') {
      warn = nextLightDistance(s.obstacles, s.obstacleStates, s.x, s.t, 300) < 300;
    }
    this.hud.setWarning(warn, this.visualTime);
    if (warn && !paused) {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0) {
        this.warnTimer = 0.55;
        AudioManager.lightWarning();
        Haptics.play('light');
      }
    } else {
      this.warnTimer = 0;
    }
  }

  private drawCharacters(dt: number): void {
    const s = this.session;
    for (const side of ['real', 'shadow'] as const) {
      const form = s.form(side);
      const lane = this.lanes[side];
      const g = this.chars[side];
      const solid = s.isSolid(side);
      g.clear();
      const anim = form.dead || (this.hitForm === side && s.state === 'hit') ? 'hit' : form.animation;
      drawRunnerBack(g, {
        side,
        anim,
        phase: this.phase,
        time: this.visualTime,
        colors: this.colors[side],
        glow: solid ? 1 : 0,
        cheer: s.state === 'complete',
      });
      g.setPosition(lane.runnerX, lane.cam.runnerY(form.h));
      const base = lane.runnerScale;
      const targetScale = base * (solid ? 1 : 0.9);
      g.setScale(g.scaleX + (targetScale - g.scaleX) * Math.min(1, dt * 14 || 1));
      const hitFlicker = anim === 'hit' && !GameContext.reducedMotion ? (Math.sin(this.visualTime * 40) > 0 ? 1 : 0.3) : 1;
      g.setAlpha((solid ? 1 : 0.45) * hitFlicker);
      g.setRotation(anim === 'hit' && !GameContext.reducedMotion ? Math.sin(this.visualTime * 30) * 0.15 : 0);

      // Cosmetic trail particles from the solid form's feet.
      if (solid && s.state === 'running' && dt > 0 && form.onGround) {
        this.trailTimer -= dt;
        if (this.trailTimer <= 0) {
          this.trailTimer = 0.06;
          this.emitTrail(lane, form.h);
        }
      }
    }
  }

  private emitTrail(lane: LaneView, h: number): void {
    if (GameContext.reducedMotion) return;
    const x = lane.runnerX + (Math.random() - 0.5) * 30;
    const y = lane.screenY(h) - 6;
    const [c0, c1] = this.trailColors;
    // "Behind" the runner is towards the camera: particles fall back and down the screen.
    const drift = (Math.random() - 0.5) * 60;
    switch (this.trailCosmetic) {
      case 'ribbon':
        this.fx.burst(x, y, { count: 1, color: c0, speed: 10, life: 0.4, scale: 0.55, drift, angle: Math.PI / 2, spread: 1.4 });
        this.fx.burst(x, y, { count: 1, color: c1, speed: 10, life: 0.4, scale: 0.45, drift, angle: Math.PI / 2, spread: 1.4 });
        break;
      case 'stars':
        this.fx.burst(x, y, { count: 1, color: Math.random() > 0.5 ? c0 : c1, texture: 'spark', speed: 40, life: 0.6, scale: 0.45, drift, angle: Math.PI / 2, spread: 1.4 });
        break;
      case 'petals':
        this.fx.burst(x, y, { count: 1, color: c0, speed: 60, life: 0.8, scale: 0.4, drift, angle: Math.PI / 2, spread: 1.4, gravity: 160, additive: false });
        break;
      case 'pixels':
        this.fx.burst(x, y, { count: 2, color: Math.random() > 0.5 ? c0 : c1, speed: 50, life: 0.35, scale: 0.25, drift, angle: Math.PI / 2, spread: 1.4 });
        break;
      default:
        this.fx.burst(x, y, { count: 1, color: c0, speed: 90, life: 0.3, scale: 0.35, drift, angle: Math.PI / 2, spread: 1.2 });
    }
  }

  // ───────────────────────────── events ─────────────────────────────

  private processEvents(): void {
    for (const e of this.session.events) this.handle(e);
    this.session.events.length = 0;
  }

  private handle(e: SimEvent): void {
    const s = this.session;
    switch (e.type) {
      case 'switch': {
        this.applyForm(e.to, true);
        AudioManager.switchTo(e.to);
        Haptics.play('switch');
        const from = this.lanes[e.to === 'real' ? 'shadow' : 'real'];
        const to = this.lanes[e.to];
        this.effects.switched(e.to, to.runnerX, from.screenY(s.form(from.side).h + 50), to.screenY(s.form(e.to).h + 50));
        if (!GameContext.reducedMotion) to.flash(e.to === 'real' ? 0xfff1d6 : 0x9a7bff, 0.25, 200);
        if (e.forced) this.hud.toast(e.to === 'real' ? 'The portal pulls you into reality!' : 'The portal pulls you into the shadows!', 0x9fe8ff);
        announce(e.to === 'real' ? 'Physical form' : 'Shadow form');
        break;
      }
      case 'switchBlocked':
        AudioManager.switchBlocked();
        break;
      case 'jump':
        AudioManager.jump(e.form);
        this.dust(e.form, 0xffffff);
        break;
      case 'land':
        this.dust(e.form, this.lanes[e.form].pal.groundTop);
        break;
      case 'slide':
      case 'drop':
        AudioManager.slide();
        break;
      case 'collect': {
        const item = s.collectibles[e.index];
        const lane = this.lanes[e.side];
        const { x, y } = lane.project(item.x, item.y);
        if (e.kind === 'coin') AudioManager.coin();
        else if (e.kind === 'crystal') AudioManager.crystal();
        else {
          AudioManager.key();
          this.hud.toast('Key found!', 0xffd36b);
          this.lastTrigger = { x, y, color: 0xffd36b };
        }
        Haptics.play('collect');
        this.fx.burst(x, y, { count: e.kind === 'key' ? 14 : 6, color: e.kind === 'coin' ? 0xffd36b : 0x9fe8ff, texture: 'spark', speed: 140, life: 0.35, scale: 0.4 });
        break;
      }
      case 'trigger': {
        const sw = s.switches[e.index];
        const lane = this.lanes[e.side];
        AudioManager.lever();
        Haptics.play('tap');
        const at = lane.project(sw.x, 60);
        this.lastTrigger = { x: at.x + 120, y: at.y, color: e.side === 'real' ? 0xffc96b : 0x9a7bff };
        const text = s.interactions.describe(sw.id)[0];
        if (text) this.hud.toast(text, 0xfff1d6, 2400);
        break;
      }
      case 'effect': {
        const o = s.obstacles[e.target];
        const lane = this.lanes[o.side];
        if (this.lastTrigger) {
          const to = lane.project(o.x, 100);
          this.effects.link(this.lastTrigger.x, this.lastTrigger.y, to.x, to.y, this.lastTrigger.color);
        }
        break;
      }
      case 'portal': {
        AudioManager.portal();
        this.lanes.real.flash(0xffffff, 0.35);
        this.lanes.shadow.flash(0xffffff, 0.35);
        break;
      }
      case 'checkpoint':
        AudioManager.checkpoint();
        this.hud.toast('Checkpoint!', 0x7affd4, 1200);
        break;
      case 'nearMiss': {
        AudioManager.nearMiss();
        const lane = this.lanes[e.form];
        const txt = addText(this, lane.runnerX + 110, lane.screenY(s.form(e.form).h + 90), 'Close!', {
          size: 26,
          weight: '700',
          color: '#ffffff',
          stroke: '#1d1838',
          strokeThickness: 6,
        }).setDepth(70);
        this.tweens.add({ targets: txt, y: txt.y - 40, alpha: 0, duration: 700, onComplete: () => txt.destroy() });
        break;
      }
      case 'hit': {
        this.hitForm = e.form;
        AudioManager.hit();
        Haptics.play('hit');
        if (!GameContext.reducedMotion) this.cameras.main.shake(220, 0.008);
        this.lanes[e.form].flash(0xff3048, 0.45, 450);
        const lives = s.lives;
        const more = lives > 0 && s.maxLives < 50 ? ` · ${lives} ${lives === 1 ? 'life' : 'lives'} left` : '';
        this.hud.banner(e.form === 'real' ? 'OUCH!' : 'POOF!', `${formName(e.form)}: ${FAIL_TEXT[e.reason]}${more}`, 0xff5d73, 900);
        announce(`${formName(e.form)} hit. ${FAIL_TEXT[e.reason]}`);
        break;
      }
      case 'respawn':
        this.hitForm = null;
        this.lanes.real.rewind();
        this.lanes.shadow.rewind();
        this.fx.clear();
        this.applyForm(s.active, false);
        this.hud.toast(s.checkpointIndex >= 0 ? 'Back to the checkpoint' : 'Back to the start', 0x9fe8ff, 1100);
        this.afterRespawn();
        // A short breather after respawning.
        this.frozen = true;
        this.time.delayedCall(450, () => (this.frozen = false));
        break;
      case 'complete':
        this.onComplete();
        break;
      case 'fail':
        this.onFail();
        break;
      case 'eclipse':
        this.effects.setEclipse(e.on);
        this.hud.setEclipse(e.on);
        if (!e.on) this.applyForm(s.active, false);
        else {
          this.lanes.real.setActive(true);
          this.lanes.shadow.setActive(true);
        }
        break;
    }
  }

  /** Hook for subclasses (the tutorial re-arms its prompts). */
  protected afterRespawn(): void {}

  private dust(side: Side, color: number): void {
    const lane = this.lanes[side];
    if (!this.session.isSolid(side)) return;
    this.fx.burst(lane.runnerX, lane.screenY(this.session.form(side).h), { count: 6, color, speed: 120, life: 0.3, scale: 0.4, angle: -Math.PI / 2, spread: 3 });
  }

  protected applyForm(form: Form, animate: boolean): void {
    const eclipse = this.session.eclipse;
    this.lanes.real.setActive(eclipse || form === 'real', !animate);
    this.lanes.shadow.setActive(eclipse || form === 'shadow', !animate);
    this.hud.setForm(form, animate);
    AudioManager.setMood(form);
  }

  /** Re-syncs every visual with the simulation (after automation skipped ahead). */
  syncVisuals(): void {
    this.effects.setEclipse(this.session.eclipse);
    this.applyForm(this.session.active, false);
    if (this.session.eclipse) {
      this.lanes.real.setActive(true, true);
      this.lanes.shadow.setActive(true, true);
    }
    this.lanes.real.rewind();
    this.lanes.shadow.rewind();
    this.fx.clear();
  }

  /** Freezes / unfreezes the simulation without the pause menu (automation, screenshots). */
  hold(on: boolean): void {
    this.held = on;
    if (!on) this.frozen = false;
  }

  // ───────────────────────────── end of run ─────────────────────────────

  private onComplete(): void {
    if (this.finished) return;
    this.finished = true;
    this.input2.enabled = false;
    AudioManager.complete();
    Haptics.play('success');
    this.lanes.real.flash(0xffffff, 0.5, 600);
    this.lanes.shadow.flash(0xffffff, 0.5, 600);
    this.fx.burst(this.lanes.real.runnerX, this.lanes.real.screenY(60), { count: 24, color: 0xffd36b, texture: 'spark', speed: 300, life: 0.8, scale: 0.6 });
    this.fx.burst(this.lanes.shadow.runnerX, this.lanes.shadow.screenY(60), { count: 24, color: 0x9fe8ff, texture: 'spark', speed: 300, life: 0.8, scale: 0.6 });
    this.time.delayedCall(1300, () => this.finish());
  }

  private onFail(): void {
    if (this.finished) return;
    this.finished = true;
    this.input2.enabled = false;
    AudioManager.failure();
    Haptics.play('failure');
    this.time.delayedCall(700, () => this.finish());
  }

  /** Scores the run, saves progress and opens the result screen. */
  protected finish(): void {
    const stats = this.session.stats();
    const score = computeScore(stats, this.level);
    const failure = this.session.failure;
    const base: ResultData = {
      mode: this.mode,
      levelIndex: this.level.index,
      levelName: this.level.name,
      stats,
      score,
      required: this.level.required,
      failReason: stats.completed ? null : (failure?.reason ?? null),
      failForm: stats.completed ? null : (failure?.form ?? null),
      failX: failure && !stats.completed ? Math.round(this.session.x) : 0,
      newBest: false,
      unlockedLevel: null,
      unlockedWorld: null,
      newCosmetics: [],
    };
    let save = GameContext.save;
    save = { ...save, stats: { ...save.stats, jumps: save.stats.jumps + this.session.physical.jumps + this.session.shadow.jumps } };
    if (this.mode === 'campaign') {
      const u = recordLevelResult(save, this.level, stats, score);
      GameContext.update(u.save);
      Object.assign(base, {
        newBest: u.newBest,
        unlockedLevel: u.unlockedLevel?.name ?? null,
        unlockedWorld: u.unlockedWorld,
        newCosmetics: u.newCosmetics.map((c) => c.name),
      });
    } else if (this.mode === 'daily') {
      const u = recordDailyResult(save, todayKey(), stats, score);
      GameContext.update(u.save);
      Object.assign(base, { newBest: u.newBest, newCosmetics: u.newCosmetics.map((c) => c.name) });
    } else {
      GameContext.update(save);
    }
    this.go('Result', base);
  }

  // ───────────────────────────── pause ─────────────────────────────

  pause(): void {
    if (this.paused || this.finished) return;
    this.paused = true;
    this.input2.enabled = false;
    AudioManager.playMusic(false);
    announce('Paused');
    this.pauseModal = new Modal(
      this,
      this.focus,
      {
        title: 'Paused',
        message: `${this.tag} · ${this.level.name}`,
        onDismiss: () => this.resume(),
        actions: [
          { label: 'Resume', icon: 'play', variant: 'primary', onClick: () => this.resume() },
          { label: 'Restart', icon: 'retry', onClick: () => this.restart() },
          { label: 'Settings', icon: 'gear', onClick: () => this.openSettings() },
          { label: this.mode === 'campaign' ? 'Exit to levels' : 'Exit to menu', icon: 'levels', onClick: () => this.exit() },
        ],
      },
      { width: this.W, height: this.H },
    );
    this.pauseModal.setDepth(1000);
  }

  resume(): void {
    if (!this.paused) return;
    this.pauseModal?.close();
    this.pauseModal = null;
    this.paused = false;
    this.input2.enabled = !this.finished;
    AudioManager.playMusic(true);
    this.acc = 0;
  }

  private openSettings(): void {
    this.scene.launch('Settings', { overlay: true, from: this.scene.key });
    this.scene.pause();
  }

  /** Back from the settings overlay: apply what can change mid-run. */
  private afterSettings(): void {
    this.focus.gameplayKeys = true;
    this.hud.setLeftHanded(GameContext.settings.leftHanded);
  }

  restart(): void {
    this.go(this.scene.key, this.data0);
  }

  protected exit(): void {
    if (this.mode === 'campaign') this.go('LevelSelect', { world: this.level.worldId });
    else this.go('Menu');
  }
}

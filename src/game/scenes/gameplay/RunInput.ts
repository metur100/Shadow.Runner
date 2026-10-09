import type Phaser from 'phaser';

import { AudioManager } from '../../systems/AudioManager';

export interface RunInputHandlers {
  switchForm(): void;
  /** strength 0..1 */
  jump(strength: number): void;
  extendJump(strength: number): void;
  releaseJump(): void;
  slide(): void;
  /** A tap that was not a swipe, in design coordinates. */
  tap(x: number, y: number): void;
  interact(): void;
  pause(): void;
  restart(): void;
}

/** Minimum vertical travel (design units) that counts as a swipe. */
const SWIPE = 38;
/** Extra travel after the swipe threshold that gives the full-height jump. */
const SWIPE_FULL = 110;
const TAP_MOVE = 24;
const TAP_TIME = 420;

/**
 * Gameplay input on top of Phaser's pointer and keyboard events:
 *   touch / mouse / trackpad – tap: switch form (or use a switch next to the character);
 *                              swipe up: jump (longer swipe = higher); swipe down: slide / drop
 *   keyboard                 – Space / ↑ / W jump (hold for higher), ↓ / S slide, Tab / Shift / X switch,
 *                              E / Enter use a switch, R restart, Esc / P pause
 * Swipes fire as soon as the finger has moved far enough, not on release, so jumps feel immediate.
 * Pointers that start on a UI button are ignored here (the button handles them).
 */
export class RunInput {
  enabled = true;
  private start: { x: number; y: number; time: number; id: number } | null = null;
  private swiped: 'jump' | 'slide' | null = null;
  private jumpKeyDown = false;
  private jumpKeyTime = 0;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly handlers: RunInputHandlers,
    private readonly toDesign: (pointer: Phaser.Input.Pointer) => { x: number; y: number },
  ) {
    scene.input.on('pointerdown', this.pointerDown, this);
    scene.input.on('pointermove', this.pointerMove, this);
    scene.input.on('pointerup', this.pointerUp, this);
    scene.input.on('pointerupoutside', this.pointerUp, this);
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keyUp(e);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    scene.events.once('shutdown', () => this.destroy());
  }

  /** Called every frame: a held jump key raises the jump during the first 0.2 s. */
  update(dt: number): void {
    if (!this.jumpKeyDown || !this.enabled) return;
    this.jumpKeyTime += dt;
    if (this.jumpKeyTime < 0.22) this.handlers.extendJump(0.3 + (this.jumpKeyTime / 0.22) * 0.7);
  }

  private pointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    AudioManager.unlock();
    if (!this.enabled || over.length > 0) {
      this.start = null;
      return;
    }
    const p = this.toDesign(pointer);
    this.start = { x: p.x, y: p.y, time: performance.now(), id: pointer.id };
    this.swiped = null;
  }

  private pointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !this.start || pointer.id !== this.start.id || !pointer.isDown) return;
    const p = this.toDesign(pointer);
    const dy = p.y - this.start.y;
    const dx = p.x - this.start.x;
    if (!this.swiped) {
      if (dy < -SWIPE && Math.abs(dy) > Math.abs(dx) * 0.7) {
        this.swiped = 'jump';
        this.handlers.jump(0.25);
      } else if (dy > SWIPE && Math.abs(dy) > Math.abs(dx) * 0.7) {
        this.swiped = 'slide';
        this.handlers.slide();
      }
    } else if (this.swiped === 'jump') {
      this.handlers.extendJump(0.25 + Math.min(1, (-dy - SWIPE) / SWIPE_FULL) * 0.75);
    }
  }

  private pointerUp(pointer: Phaser.Input.Pointer): void {
    const start = this.start;
    this.start = null;
    if (!this.enabled || !start || pointer.id !== start.id || this.swiped) return;
    const p = this.toDesign(pointer);
    const moved = Math.hypot(p.x - start.x, p.y - start.y);
    if (moved < TAP_MOVE && performance.now() - start.time < TAP_TIME) this.handlers.tap(p.x, p.y);
  }

  private keyDown(e: KeyboardEvent): void {
    if (!this.scene.scene.isActive()) return;
    // While paused the pause dialog's own focus manager handles Escape (resume).
    if (!this.enabled) return;
    const key = e.key;
    if (key === 'Escape' || key === 'p' || key === 'P') {
      e.preventDefault();
      this.handlers.pause();
      return;
    }
    if (e.repeat && key !== 'ArrowDown') return;
    switch (key) {
      case ' ':
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        AudioManager.unlock();
        this.jumpKeyDown = true;
        this.jumpKeyTime = 0;
        this.handlers.jump(0.3);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        if (!e.repeat) this.handlers.slide();
        break;
      case 'Tab':
      case 'Shift':
      case 'x':
      case 'X':
        e.preventDefault();
        AudioManager.unlock();
        this.handlers.switchForm();
        break;
      case 'e':
      case 'E':
      case 'Enter':
        e.preventDefault();
        this.handlers.interact();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        this.handlers.restart();
        break;
    }
  }

  private keyUp(e: KeyboardEvent): void {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      if (this.jumpKeyDown && this.jumpKeyTime < 0.12 && this.enabled) this.handlers.releaseJump();
      this.jumpKeyDown = false;
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.scene.input.off('pointerdown', this.pointerDown, this);
    this.scene.input.off('pointermove', this.pointerMove, this);
    this.scene.input.off('pointerup', this.pointerUp, this);
    this.scene.input.off('pointerupoutside', this.pointerUp, this);
  }
}

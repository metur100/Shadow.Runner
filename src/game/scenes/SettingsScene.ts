import { GameContext } from '../GameContext';
import { AudioManager } from '../systems/AudioManager';
import type { Settings } from '../systems/SaveManager';
import { Button } from '../ui/Button';
import type { IconName } from '../ui/Icons';
import { Modal } from '../ui/Modal';
import { Toggle } from '../ui/Toggle';
import { addText } from '../ui/Typography';
import { COLORS } from '../utils/Constants';
import { BaseScene } from './BaseScene';

interface SettingsData {
  /** Opened from the pause menu on top of a running level. */
  overlay?: boolean;
  from?: string;
}

const ROWS: [keyof Settings, string, string, IconName][] = [
  ['sound', 'Sound effects', 'Footsteps, switches, pickups', 'sound'],
  ['music', 'Music', 'Generated soundtrack', 'music'],
  ['vibration', 'Vibration', 'Haptic feedback on supported phones', 'vibrate'],
  ['reducedMotion', 'Reduced motion', 'No shaking, flashes or parallax', 'motion'],
  ['leftHanded', 'Left-handed mode', 'Jump and slide buttons on the left', 'hand'],
  ['highContrast', 'High contrast', 'Calmer backgrounds, outlined hazards', 'contrast'],
];

/** Settings: sound, music, vibration, accessibility options and resetting progress. */
export class SettingsScene extends BaseScene {
  private opts: SettingsData = {};

  constructor() {
    super('Settings');
  }

  init(data: SettingsData): void {
    this.opts = data ?? {};
  }

  create(): void {
    this.setupScene('Settings');
    if (this.opts.overlay) {
      this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.97).setOrigin(0);
    } else {
      this.addTwinBackground('city', false, this.H * 0.5);
      this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.72).setOrigin(0);
    }
    let y = this.addHeader('Settings', () => this.back());
    y += 20;
    const w = 640;
    for (const [key, label, desc, icon] of ROWS) {
      new Toggle(this, this.W / 2, y + 48, w, label, desc, icon, GameContext.settings[key], (value) => {
        GameContext.updateSettings({ [key]: value });
        if (key === 'sound' && value) AudioManager.button();
      }, this.focus);
      y += 108;
    }
    if (this.opts.overlay) {
      addText(this, this.W / 2, y + 20, 'High contrast and reduced motion fully apply from the next run.', { size: 19, weight: '500', color: COLORS.muted, wrapWidth: 600 });
      y += 50;
    }
    y += 30;
    if (!this.opts.overlay) {
      new Button(this, {
        x: this.W / 2,
        y: y + 40,
        width: 420,
        height: 84,
        label: 'Reset progress',
        icon: 'trash',
        variant: 'danger',
        fontSize: 28,
        focus: this.focus,
        onClick: () => this.confirmReset(),
      });
      y += 110;
    }
    new Button(this, {
      x: this.W / 2,
      y: y + 40,
      width: 420,
      height: 84,
      label: this.opts.overlay ? 'Back to the game' : 'Back',
      icon: 'back',
      variant: 'secondary',
      fontSize: 28,
      focus: this.focus,
      onClick: () => this.back(),
    });
    addText(this, this.W / 2, this.H - this.safeBottom - 60, 'Twinshade 1.0 · Made by Medin Turkes', { size: 20, weight: '500', color: COLORS.muted });
    addText(this, this.W / 2, this.H - this.safeBottom - 30, 'Works offline. No accounts, no tracking – progress stays on this device.', {
      size: 17,
      weight: '500',
      color: COLORS.muted,
    });
  }

  private back(): void {
    if (this.opts.overlay && this.opts.from) {
      this.scene.stop();
      this.scene.resume(this.opts.from);
      return;
    }
    this.go(this.opts.from && this.opts.from !== 'Settings' ? this.opts.from : 'Menu');
  }

  private confirmReset(): void {
    const modal = new Modal(
      this,
      this.focus,
      {
        title: 'Reset progress?',
        message: 'All levels, stars, scores, unlocked worlds and cosmetics will be deleted. Your settings are kept. This cannot be undone.',
        actions: [
          {
            label: 'Delete my progress',
            icon: 'trash',
            variant: 'danger',
            onClick: () => {
              GameContext.resetProgress();
              modal.close();
              this.scene.restart(this.opts);
            },
          },
          { label: 'Cancel', icon: 'back', onClick: () => modal.close() },
        ],
      },
      { width: this.W, height: this.H },
    );
  }
}

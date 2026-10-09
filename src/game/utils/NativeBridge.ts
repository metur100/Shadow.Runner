import type Phaser from 'phaser';

import type { BaseScene } from '../scenes/BaseScene';
import { AudioManager } from '../systems/AudioManager';
import { Haptics } from './Haptics';

interface NativeWindow extends Window {
  ReactNativeWebView?: { postMessage(message: string): void };
  /** Called by the app shell (mobile/App.tsx). */
  __srNative?: {
    /** Android back button. Returns false when the game has nothing to go back to (the app then closes). */
    back(): boolean;
    /** App moved to the background / foreground. */
    setActive(active: boolean): void;
  };
}

/**
 * Connects the game to the Expo app shell in mobile/ when it runs inside its WebView:
 * native haptics, app background / foreground and the Android back button. Does nothing in a browser.
 */
export function installNativeBridge(game: Phaser.Game): void {
  const w = window as NativeWindow;
  const native = w.ReactNativeWebView;
  if (!native) return;

  const post = (message: object) => native.postMessage(JSON.stringify(message));
  Haptics.setBackend((kind) => post({ type: 'haptic', kind }));

  w.__srNative = {
    back() {
      for (const scene of game.scene.getScenes(true) as BaseScene[]) {
        const key = scene.scene.key;
        if (key === 'Gameplay' || key === 'Endless' || key === 'Tutorial') {
          // In a run, back opens (or closes) the pause menu.
          const run = scene as unknown as { paused: boolean; pause(): void; resume(): void };
          if (run.paused) run.resume();
          else run.pause();
          return true;
        }
        const focus = scene.focus;
        if (focus && (focus.hasModal || focus.onBack)) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
          return true;
        }
      }
      return false;
    },
    setActive(active) {
      if (active) {
        AudioManager.resume();
        game.events.emit('visible');
      } else {
        AudioManager.suspend();
        game.events.emit('hidden');
      }
    },
  };
  post({ type: 'ready' });
}

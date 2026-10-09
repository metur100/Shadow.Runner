import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles/global.css';

import Phaser from 'phaser';

import { createGameConfig } from './game/GameConfig';
import { GameContext } from './game/GameContext';
import { AudioManager } from './game/systems/AudioManager';
import { installNativeBridge } from './game/utils/NativeBridge';
import { installTestHooks } from './game/utils/TestHooks';

async function start(): Promise<void> {
  // Wait for the bundled font so canvas text is measured with it from the first frame.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('600 32px Fredoka'), document.fonts.load('700 32px Fredoka'), document.fonts.load('500 32px Fredoka')]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* fonts API unavailable – fall back to the system font */
  }
  GameContext.init();
  const game = new Phaser.Game(createGameConfig('game'));

  // Stop all sound (and pause runs, see GameplayScene) when the page is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      AudioManager.suspend();
      game.events.emit('hidden');
    } else {
      AudioManager.resume();
    }
  });

  installNativeBridge(game);

  // Automation hooks for the smoke test and screenshots – only in dev builds or with ?debug in the URL.
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) installTestHooks(game);
}

void start();

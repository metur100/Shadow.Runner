import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import { solveLevel } from '../levels/LevelSolver';
import type { BaseScene } from '../scenes/BaseScene';
import type { GameplayScene } from '../scenes/GameplayScene';
import { SIM_STEP } from './Constants';

interface ButtonInfo {
  label: string;
  /** Page (CSS pixel) coordinates of the button centre. */
  x: number;
  y: number;
  scene: string;
}

const RUN_SCENES = ['Gameplay', 'Endless', 'Tutorial'];

/**
 * Small automation API used by scripts/smoke.mjs and the store screenshot tool (Playwright). It reads
 * state and reports where things are on the page – the smoke test still taps and swipes with real
 * pointer events. `fastForward` replays the auto-player's solution to reach a point of a level quickly
 * (used for screenshots and for checking that every level loads and runs).
 */
export function installTestHooks(game: Phaser.Game): void {
  const canvasRect = () => game.canvas.getBoundingClientRect();
  const run = (): GameplayScene | null => {
    for (const key of RUN_SCENES) if (game.scene.isActive(key)) return game.scene.getScene(key) as GameplayScene;
    return null;
  };
  const toPage = (x: number, y: number) => {
    const rect = canvasRect();
    const scale = rect.width / GameContext.profile.width;
    return { x: rect.left + x * scale, y: rect.top + y * scale };
  };
  const hooks = {
    game,
    activeScenes: () => game.scene.getScenes(true).map((s) => s.scene.key),
    buttons: (): ButtonInfo[] => {
      const out: ButtonInfo[] = [];
      for (const scene of game.scene.getScenes(true) as BaseScene[]) {
        if (typeof scene.listButtons !== 'function') continue;
        for (const button of scene.listButtons()) {
          const m = button.getWorldTransformMatrix();
          // The camera is zoomed by the render scale around the screen centre.
          const cam = scene.cameras.main;
          const zoom = cam.zoom / GameContext.profile.renderScale;
          const sx = (m.tx - cam.midPoint.x) * zoom + GameContext.profile.width / 2;
          const sy = (m.ty - cam.midPoint.y) * zoom + GameContext.profile.height / 2;
          const p = toPage(sx, sy);
          out.push({ label: button.accessibleName, x: p.x, y: p.y, scene: scene.scene.key });
        }
      }
      return out;
    },
    /** Design coordinates → page coordinates. */
    toPage,
    /** Layout of the running level (lane positions in design units). */
    layout: () => run()?.layout ?? null,
    run: () => {
      const scene = run();
      if (!scene?.session) return null;
      const s = scene.session;
      return {
        scene: scene.scene.key,
        levelId: s.level.id,
        state: s.state,
        x: s.x,
        length: s.level.length,
        active: s.active,
        physicalH: s.physical.h,
        shadowH: s.shadow.h,
        sliding: s.activeForm.sliding,
        coins: s.coins,
        crystals: s.crystals,
        switches: s.switcher.count,
        lives: s.lives,
        damage: s.damage,
        failure: s.failure,
        paused: scene.paused,
        eclipse: s.eclipse,
        switchesOn: Array.from(s.switchesOn),
        portalsUsed: Array.from(s.portalsUsed),
        checkpoint: s.checkpointIndex,
      };
    },
    /** Obstacles, switches and portals of the running level (for targeted checks). */
    level: () => {
      const s = run()?.session;
      if (!s) return null;
      return {
        obstacles: s.obstacles.map((o) => ({ kind: o.kind, side: o.side, x: o.x, w: o.w, h: o.h, id: o.def.id ?? null, open: s.obstacleStates[o.index].open, off: s.obstacleStates[o.index].off })),
        switches: s.switches.map((w) => ({ id: w.id, kind: w.kind, side: w.side, x: w.x })),
        portals: s.portals.map((p) => ({ id: p.id, side: p.side, x: p.x, kind: p.def.kind })),
      };
    },
    /** Jump straight to a scene. */
    start: (key: string, data?: object) => {
      for (const scene of game.scene.getScenes(true)) if (scene.scene.key !== key) scene.scene.stop();
      game.scene.start(key, data);
    },
    /**
     * Plays the running level with the auto-player's inputs until the runner reaches `untilX`,
     * without rendering the frames in between.
     */
    fastForward: (untilX: number) => {
      const scene = run();
      if (!scene) return false;
      const s = scene.session;
      const plan = solveLevel(s.level);
      if (!plan.solved) return false;
      s.fullRestore(scene.initialSnapshot);
      let i = 0;
      while (s.x < untilX && s.state === 'running' && i < plan.actions.length) {
        const action = plan.actions[i++];
        if (action === 'switch' || action === 'switchJump') s.switchForm();
        if (action === 'jump' || action === 'switchJump') s.jump(0);
        if (action === 'jumpHigh') s.jump(1);
        if (action === 'slide') s.slide();
        for (let k = 0; k < 5; k++) {
          s.step(SIM_STEP);
          if (k === 1 && (action === 'jump' || action === 'switchJump')) s.releaseJump();
        }
        s.events.length = 0;
      }
      scene.syncVisuals();
      return s.state === 'running';
    },
    /** Makes `form` the active form right now (ignores the switch cooldown). */
    setForm: (form: 'real' | 'shadow') => {
      const scene = run();
      if (!scene) return;
      const s = scene.session;
      if (s.active !== form) {
        s.switcher.cooldown = 0;
        s.switchForm();
        s.events.length = 0;
      }
      scene.syncVisuals();
    },
    /** Freeze / unfreeze the running level (no pause menu). */
    hold: (on: boolean) => run()?.hold(on),
    save: () => GameContext.save,
    profile: () => GameContext.profile,
  };
  (window as unknown as { __SR__: typeof hooks }).__SR__ = hooks;
}

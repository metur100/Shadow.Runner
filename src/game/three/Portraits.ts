import type Phaser from 'phaser';
import * as THREE from 'three';

import type { Side, ThemeId } from '../levels/LevelDefinition';
import { Renderer3D } from './Renderer3D';
import { Runner3D, type ActionName } from './Runner3D';
import { World3D } from './World3D';

let stage: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; target: THREE.WebGLRenderTarget; size: [number, number] } | null = null;

function getStage(w: number, h: number) {
  if (stage && stage.size[0] === w && stage.size[1] === h) return stage;
  stage?.target.dispose();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a5a, 1.1));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 2.4);
  rim.position.set(-3, 2, -3);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
  camera.position.set(1.2, 1.1, 3.6);
  camera.lookAt(0, 0.88, 0);
  const target = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  stage = { scene, camera, target, size: [w, h] };
  return stage;
}

/**
 * A 3D portrait of the runner (front three-quarter view, transparent background) as a Phaser texture.
 * Used where the game shows the character on a flat screen: the collection and the result screen.
 * Returns the texture key, or null when 3D is unavailable.
 */
export function runnerPortrait(
  scene: Phaser.Scene,
  side: Side,
  colors: [number, number, number],
  pose: ActionName = 'idle',
  time = 0.4,
  w = 256,
  h = 320,
): string | null {
  const key = `portrait-${side}-${colors.join('-')}-${pose}-${time}-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const renderer = Renderer3D.raw;
  if (!renderer) return null;
  const st = getStage(w, h);
  const runner = new Runner3D(side, colors);
  // Face the camera (the in-game model is turned away from it).
  runner.root.rotation.y = Math.PI + 0.35;
  runner.pose(pose, time);
  st.scene.add(runner.root);
  const prevTarget = renderer.getRenderTarget();
  const prevScissor = renderer.getScissorTest();
  renderer.setScissorTest(false);
  renderer.setRenderTarget(st.target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(st.scene, st.camera);
  const pixels = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(st.target, 0, 0, w, h, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setScissorTest(prevScissor);
  renderer.setClearColor(0x000000, 1);
  st.scene.remove(runner.root);
  runner.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  // WebGL rows run bottom-up.
  for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * A 3D snapshot of a level's two worlds – reality on top, shadow below, split by a white seam – as a
 * Phaser texture (world and level select cards). Returns the texture key, or null without 3D.
 */
export function worldSnapshot(scene: Phaser.Scene, theme: ThemeId, shadowTheme: ThemeId, w: number, h: number, seed = 3): string | null {
  const key = `snap-${theme}-${shadowTheme}-${w}x${h}-${seed}`;
  if (scene.textures.exists(key)) return key;
  const renderer = Renderer3D.raw;
  if (!renderer) return null;
  const k = 2;
  const W = w * k;
  const H = h * k;
  const target = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = renderer.getRenderTarget();
  const prevScissor = renderer.getScissorTest();
  renderer.setRenderTarget(target);
  renderer.setScissorTest(true);
  const half = Math.floor(H / 2);
  for (const [side, th, y] of [
    ['real', theme, half],
    ['shadow', shadowTheme, 0],
  ] as [Side, ThemeId, number][]) {
    const world = new World3D({
      side,
      theme: th,
      session: null,
      runnerColors: side === 'real' ? [0xff6a2b, 0x2ec4b6, 0xfff1d6] : [0x2b1f5c, 0x9a7bff, 0x9fe8ff],
      portalColors: [0x7b5cff, 0x5aa8ff, 0x9fe8ff],
      highContrast: false,
      reducedMotion: true,
      detail: true,
      seed: seed + (side === 'real' ? 0 : 1),
    });
    world.update(40 * 42, 1, 0.3, { anim: 'run', h: 0, solid: true, speed: 7, cheer: false, reducedMotion: true }, true);
    world.setAspect(W / half);
    // Show the lower part of the lane, like the game does.
    world.camera.setViewOffset(W, half / 0.82, 0, (half / 0.82) * 0.12, W, half);
    // Render targets use their own viewport / scissor (not the renderer's).
    target.viewport.set(0, y, W, half);
    target.scissor.set(0, y, W, half);
    target.scissorTest = true;
    renderer.setRenderTarget(target);
    renderer.render(world.scene, world.camera);
    world.dispose();
  }
  const pixels = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setScissorTest(prevScissor);
  target.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(159,232,255,0.6)';
  ctx.fillRect(0, half - 5, W, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, half - 2, W, 4);
  scene.textures.addCanvas(key, canvas);
  return key;
}

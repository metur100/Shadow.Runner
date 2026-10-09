import * as THREE from 'three';

import type { World3D } from './World3D';

export interface Viewport {
  world: World3D;
  /** Rectangle in design units (the Phaser coordinate space). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The single WebGL canvas for the 3D worlds. It sits underneath the (transparent) Phaser canvas and is
 * kept exactly on top of it, so design coordinates line up with the HUD. Each frame the gameplay scene
 * hands it the worlds and the screen rectangles to draw them in.
 */
class Renderer3DImpl {
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private host: HTMLCanvasElement | null = null;
  private designW = 720;
  private designH = 1280;
  private lastRect = '';
  private visible = false;
  private pixelRatio = 1;
  private shadows = true;
  /** Adaptive quality: frame times are averaged and resolution / shadows step down when too slow. */
  private lastFrame = 0;
  private frameSum = 0;
  private frameCount = 0;
  private level = 0;

  /** Creates the canvas behind `phaserCanvas`. Returns false when WebGL is unavailable. */
  init(phaserCanvas: HTMLCanvasElement, designW: number, designH: number, opts: { lowEnd: boolean }): boolean {
    this.host = phaserCanvas;
    this.designW = designW;
    this.designH = designH;
    if (this.renderer) return true;
    try {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '0', pointerEvents: 'none', display: 'none' });
      phaserCanvas.style.position = 'relative';
      phaserCanvas.style.zIndex = '1';
      phaserCanvas.parentElement?.insertBefore(canvas, phaserCanvas);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowEnd, powerPreference: opts.lowEnd ? 'low-power' : 'high-performance', alpha: false });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = !opts.lowEnd;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setScissorTest(true);
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, opts.lowEnd ? 1.25 : 2);
      this.shadows = !opts.lowEnd;
      this.renderer = renderer;
      this.canvas = canvas;
      return true;
    } catch {
      return false;
    }
  }

  /** The underlying renderer (portraits), or null without WebGL. */
  get raw(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  get available(): boolean {
    return this.renderer !== null;
  }

  get shadowsEnabled(): boolean {
    return this.shadows;
  }

  private owner: object | null = null;

  /** Shows the 3D canvas for `owner` (a scene). */
  show(owner: object): void {
    this.owner = owner;
    this.visible = true;
    if (this.canvas) this.canvas.style.display = 'block';
  }

  /** Hides the canvas – unless another owner has taken it over in the meantime. */
  hide(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.visible = false;
    if (this.canvas) this.canvas.style.display = 'none';
  }

  /** Keeps the canvas aligned with the Phaser canvas (which FIT-scales and centres itself). */
  private syncRect(): void {
    if (!this.host || !this.canvas || !this.renderer) return;
    const r = this.host.getBoundingClientRect();
    const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
    if (key === this.lastRect) return;
    this.lastRect = key;
    Object.assign(this.canvas.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), false);
  }

  /**
   * Steps quality down when the average frame time over ~2 s is above 20 ms (below ~50 fps):
   * 1) render scale 1.5, 2) 1.25 without shadows, 3) 1.0.
   */
  private adapt(): void {
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    // Ignore pauses (scene changes, backgrounding).
    if (dt <= 0 || dt > 250) return;
    this.frameSum += dt;
    this.frameCount++;
    if (this.frameCount < 120) return;
    const avg = this.frameSum / this.frameCount;
    this.frameSum = 0;
    this.frameCount = 0;
    if (avg <= 20 || this.level >= 3 || !this.renderer) return;
    this.level++;
    const ratios = [this.pixelRatio, Math.min(this.pixelRatio, 1.5), Math.min(this.pixelRatio, 1.25), 1];
    this.pixelRatio = ratios[this.level];
    // Worlds read shadowsEnabled and stop casting shadows (see World3D.update).
    if (this.level >= 2) this.shadows = false;
    this.lastRect = '';
  }

  render(views: Viewport[]): void {
    const renderer = this.renderer;
    if (!renderer || !this.visible) return;
    this.adapt();
    this.syncRect();
    const size = renderer.getSize(new THREE.Vector2());
    const kx = size.x / this.designW;
    const ky = size.y / this.designH;
    for (const v of views) {
      // The full rectangle of the view in canvas pixels (y from the top)…
      const fx = v.x * kx;
      const fy = v.y * ky;
      const fw = v.w * kx;
      const fh = v.h * ky;
      // …clamped to the canvas: viewports or scissor boxes outside the canvas crash some GPU drivers.
      const x0 = Math.max(0, fx);
      const y0 = Math.max(0, fy);
      const x1 = Math.min(size.x, fx + fw);
      const y1 = Math.min(size.y, fy + fh);
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      const cam = v.world.camera;
      v.world.setAspect(fw / Math.max(1, fh));
      if (x0 !== fx || y0 !== fy || x1 !== fx + fw || y1 !== fy + fh) cam.setViewOffset(fw, fh, x0 - fx, y0 - fy, x1 - x0, y1 - y0);
      else cam.clearViewOffset();
      // WebGL's viewport origin is the bottom-left corner.
      const gy = size.y - y1;
      renderer.setViewport(x0, gy, x1 - x0, y1 - y0);
      renderer.setScissor(x0, gy, x1 - x0, y1 - y0);
      renderer.render(v.world.scene, cam);
    }
  }

  /** Releases GPU resources of programs / render lists between scenes. */
  clear(): void {
    this.renderer?.renderLists.dispose();
  }
}

export const Renderer3D = new Renderer3DImpl();

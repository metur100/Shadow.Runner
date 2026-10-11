import * as THREE from 'three';

import type { Side, ThemeId } from '../levels/LevelDefinition';
import type { RunSession } from '../systems/RunSession';
import { environment, type EnvironmentDef } from './Environment';
import { LevelObjects } from './LevelObjects';
import { Renderer3D } from './Renderer3D';
import { Runner3D, type RunnerVisual } from './Runner3D';
import { Sky } from './Sky';
import { LANE_M, S, Street } from './Street';

export interface WorldOptions {
  side: Side;
  theme: ThemeId;
  session: RunSession | null;
  runnerColors: [number, number, number];
  portalColors: [number, number, number];
  highContrast: boolean;
  reducedMotion: boolean;
  /** Windows, shadows and other details (off on weak devices). */
  detail: boolean;
  seed: number;
}

/** Camera rig, relative to the runner (metres). */
const CAM_BACK = 4.7;
const CAM_UP = 2.55;
const LOOK_AHEAD = 7.5;
const LOOK_UP = 1.15;

/**
 * One of the two worlds as a 3D scene: sky, lights and fog of its theme, the street, the level's
 * objects and the runner, seen by a chase camera behind the runner. The gameplay scene renders the
 * reality world into the top half of the screen and the shadow world into the bottom half.
 */
export class World3D {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly env: EnvironmentDef;
  readonly runner: Runner3D;
  private readonly sky: Sky;
  private readonly street: Street;
  readonly objects: LevelObjects | null;
  private readonly sun: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private lift = 0;
  private groundH = 0;
  private time = 0;
  private readonly tmp = new THREE.Vector3();
  private shake = 0;
  /** Camera x: follows the runner across the lanes, a little behind. */
  private camX = 0;
  private nudgeTime = 0;
  private nudgeDir = 0;

  constructor(readonly opts: WorldOptions) {
    const env = environment(opts.theme, opts.side);
    this.env = env;
    this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    this.scene.background = new THREE.Color(env.fog.color);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);

    const hemi = new THREE.HemisphereLight(env.light.hemiSky, env.light.hemiGround, env.light.hemi);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(env.light.sunColor, env.light.sun);
    this.sun.castShadow = opts.detail;
    if (opts.detail) {
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = -14;
      c.right = 14;
      c.top = 14;
      c.bottom = -14;
      c.near = 1;
      c.far = 90;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    this.scene.add(this.sun, this.sun.target);
    // A light from in front of the runner outlines it against the street (stronger in shadow worlds).
    this.rim = new THREE.DirectionalLight(env.light.rimColor, env.light.rim);
    this.scene.add(this.rim, this.rim.target);

    this.sky = new Sky(env, opts.seed, opts.detail);
    this.scene.add(this.sky.group);

    const gaps: [number, number][] = [];
    if (opts.session) {
      for (const o of opts.session.obstacles) if (o.kind === 'pit' && o.side === opts.side) gaps.push([o.x * S, (o.x + o.w) * S]);
    }
    this.street = new Street(env, opts.side, gaps, opts.seed, opts.detail);
    this.scene.add(this.street.group);

    const glow = env.windowGlow ?? (opts.side === 'shadow' ? 0x9a7bff : 0xffc96b);
    this.objects = opts.session
      ? new LevelObjects(opts.session, {
          side: opts.side,
          glow: opts.side === 'shadow' ? glow : 0xffc96b,
          portalColors: opts.portalColors,
          highContrast: opts.highContrast,
          reducedMotion: opts.reducedMotion,
          detail: opts.detail,
        })
      : null;
    if (this.objects) this.scene.add(this.objects.group);

    this.runner = new Runner3D(opts.side, opts.runnerColors);
    this.scene.add(this.runner.root);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    // Keep the street equally wide on narrow phones and wider tablets.
    this.camera.fov = aspect < 1 ? 50 + (1 - aspect) * 18 : 50;
    this.camera.updateProjectionMatrix();
  }

  /** A small sideways bump of the camera (trying to leave the road). */
  nudge(dir: number): void {
    if (this.opts.reducedMotion) return;
    this.nudgeTime = 0.2;
    this.nudgeDir = dir;
  }

  /** A short camera shake (hits). */
  bump(strength = 1): void {
    if (!this.opts.reducedMotion) this.shake = 0.25 * strength;
  }

  /**
   * Advances the world to sim distance `scroll` (units) and level time `t`. `visual` describes the
   * runner of this world.
   */
  update(scroll: number, t: number, dt: number, visual: RunnerVisual, onGround: boolean): void {
    this.time += dt;
    const d = scroll * S;
    const z = -d;
    const h = visual.h;
    if (onGround) this.groundH = Math.max(0, h);
    else if (h < 0) this.groundH = 0;
    // The camera rises with the runner onto platforms and follows jumps part of the way, so the runner
    // stays in frame at the top of a jump.
    const air = Math.max(0, h - this.groundH);
    const target = this.groundH * 0.7 + air * 0.6;
    this.lift += (target - this.lift) * Math.min(1, dt * (air > 0 ? 7 : 4));

    this.street.update(d);
    this.objects?.update(scroll, t, dt);
    const rx = visual.lx * LANE_M;
    this.runner.root.position.set(rx, 0, z);
    this.runner.update(dt, visual, this.groundH);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
    }
    this.camX += (rx * 0.72 - this.camX) * Math.min(1, dt * 9);
    let nx = 0;
    if (this.nudgeTime > 0) {
      this.nudgeTime = Math.max(0, this.nudgeTime - dt);
      nx = this.nudgeDir * 0.18 * Math.sin((this.nudgeTime / 0.2) * Math.PI);
    }
    this.camera.position.set(this.camX + sx + nx, CAM_UP + this.lift + sy, z + CAM_BACK);
    this.camera.lookAt(this.camX * 0.6 + nx, LOOK_UP + this.lift * 0.85, z - LOOK_AHEAD);

    const castShadow = this.opts.detail && Renderer3D.shadowsEnabled;
    if (this.sun.castShadow !== castShadow) this.sun.castShadow = castShadow;
    const dir = this.tmp.set(...this.env.sky.sunDir).normalize();
    this.sun.target.position.set(0, 0, z - 6);
    this.sun.position.set(dir.x * 40, Math.max(dir.y, 0.35) * 40, z - 6 + dir.z * 40);
    this.rim.target.position.set(0, 1, z);
    this.rim.position.set(-2, 4, z - 10);
    this.sky.update(this.camera, this.time, dt);
  }

  /** After a respawn the run jumps back. */
  rewind(): void {
    this.street.reset();
    this.objects?.reset();
    this.lift = 0;
    this.camX = this.lastRunnerX;
  }

  private get lastRunnerX(): number {
    return this.runner.root.position.x;
  }

  /** NDC position of a sim point (x units ahead, h units up, lx lanes across) in this world's camera. */
  projectSim(x: number, h: number, out: THREE.Vector3, lx = 0): THREE.Vector3 {
    return out.set(lx * LANE_M, h * S, -x * S).project(this.camera);
  }

  dispose(): void {
    this.street.dispose();
    this.objects?.dispose();
    this.sky.dispose();
    this.runner.dispose();
    this.scene.clear();
  }
}

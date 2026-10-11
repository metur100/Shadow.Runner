import * as THREE from 'three';

import type { AnimationState } from '../entities/RunnerForm';
import type { Side } from '../levels/LevelDefinition';
import { glowMaterial, rimMaterial } from './Materials';
import { skinnedInstance } from './Models';
import { glowTexture } from './Textures';

export type ActionName = 'run' | 'roll' | 'idle' | 'hit' | 'wave';

const CLIP: Record<ActionName, string> = {
  run: 'Run',
  roll: 'Roll',
  idle: 'Idle',
  hit: 'HitRecieve',
  wave: 'Wave',
};

/** Keeps a clip in place: the hip bone keeps its height but loses forward / sideways drift. */
function inPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  for (const track of c.tracks) {
    if (!track.name.endsWith('.position')) continue;
    if (!/hips|root|torso|body/i.test(track.name)) continue;
    const v = track.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
  return c;
}

export interface RunnerVisual {
  anim: AnimationState;
  /** Height above the ground (metres). */
  h: number;
  /** Lateral position in lane units (−1 left … 1 right); the world places the runner there. */
  lx: number;
  /** Solid (active) form: full colour / glow; otherwise a faint echo. */
  solid: boolean;
  /** Run speed in m/s (drives the stride rate). */
  speed: number;
  cheer: boolean;
  reducedMotion: boolean;
}

/**
 * The runner, seen from behind: the hoodie character (CC0, Quaternius) with run / roll / idle / hit /
 * wave animations. The physical form wears the selected costume colours; the shadow form is a dark
 * silhouette with a glowing fresnel rim, glowing eyes, a halo and a light that tints the street.
 */
export class Runner3D {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ActionName, THREE.AnimationAction>();
  private current: ActionName = 'run';
  private readonly materials: THREE.Material[] = [];
  private readonly rim: ReturnType<typeof rimMaterial> | null = null;
  private readonly halo: THREE.Sprite | null = null;
  private readonly light: THREE.PointLight | null = null;
  private readonly blob: THREE.Mesh;
  private lastAnim: AnimationState = 'run';
  private alpha = 1;
  private time = 0;
  private lastLx = 0;

  constructor(
    readonly side: Side,
    colors: [number, number, number],
  ) {
    const { root, clips } = skinnedInstance('runner');
    this.model = root;
    // The model faces +z; the run goes towards −z and the camera looks at its back.
    this.model.rotation.y = Math.PI;
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, key] of Object.entries(CLIP) as [ActionName, string][]) {
      const clip = clips.find((c) => c.name.endsWith(`|${key}`) || c.name === key);
      if (!clip) continue;
      const action = this.mixer.clipAction(inPlace(clip));
      if (name === 'roll' || name === 'hit') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    this.actions.get('run')?.play();

    if (side === 'shadow') {
      this.rim = rimMaterial(0x0c0720, colors[1]);
      const eye = new THREE.MeshBasicMaterial({ color: colors[2], toneMapped: false });
      this.model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const name = (mesh.material as THREE.Material).name;
        mesh.material = /Eye$/i.test(name) ? eye : (this.rim as THREE.Material);
        mesh.castShadow = false;
      });
      this.materials.push(this.rim, eye);
      this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colors[1], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.halo.scale.set(2.6, 3.2, 1);
      this.halo.position.y = 1.0;
      this.root.add(this.halo);
      this.light = new THREE.PointLight(colors[1], 6, 7, 1.6);
      this.light.position.set(0, 1.4, 0.6);
      this.root.add(this.light);
    } else {
      this.recolor(colors);
    }

    // Soft contact shadow (in addition to the shadow map, which may be off on weak devices).
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), glowMaterial(0x000000, 0.0));
    const bm = this.blob.material as THREE.MeshBasicMaterial;
    bm.blending = THREE.NormalBlending;
    bm.map = glowTexture();
    bm.color.set(side === 'shadow' ? 0x7b5cff : 0x000000);
    bm.opacity = side === 'shadow' ? 0.45 : 0.35;
    if (side === 'shadow') bm.blending = THREE.AdditiveBlending;
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.scale.set(1, 1.5, 1);
    this.root.add(this.blob);
  }

  /** Costume colours: [hoodie, trim / scarf, face] for the physical form. */
  recolor(colors: [number, number, number]): void {
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const m = src.clone();
      switch (src.name) {
        case 'Purple':
          m.color.set(colors[0]);
          break;
        case 'White':
          m.color.set(colors[1]).lerp(new THREE.Color(0xffffff), 0.35);
          break;
        case 'LightBlue':
          m.color.set(0x23242f);
          break;
        case 'Hair':
          m.color.set(0x15111a);
          break;
        default:
          break;
      }
      m.roughness = 0.7;
      mesh.material = m;
      this.materials.push(m);
    });
  }

  private play(name: ActionName, fade = 0.12, timeScale = 1): void {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (name === this.current) {
      next.paused = false;
      return;
    }
    const prev = this.actions.get(this.current);
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, fade, false);
    this.current = name;
  }

  /** A still pose (portraits): the given clip at `time` seconds. */
  pose(name: ActionName, time: number): void {
    this.mixer.stopAllAction();
    const action = this.actions.get(name) ?? this.actions.get('idle');
    if (!action) return;
    action.reset().play();
    action.paused = false;
    this.mixer.setTime(time);
    this.blob.visible = false;
    if (this.halo) this.halo.visible = false;
    if (this.rim) this.rim.userData.uniforms.uGlow.value = 1;
  }

  update(dt: number, v: RunnerVisual, groundH: number): void {
    this.time += dt;
    const anim = v.cheer ? 'idle' : v.anim;
    if (anim !== this.lastAnim) {
      switch (anim) {
        case 'slide': {
          const roll = this.actions.get('roll');
          const dur = roll ? roll.getClip().duration : 1;
          this.play('roll', 0.08, dur / 0.7);
          break;
        }
        case 'hit':
          this.play('hit', 0.08, 1.2);
          break;
        case 'idle':
          this.play(v.cheer ? 'wave' : 'idle', 0.25);
          break;
        default:
          this.play('run', anim === 'run' ? 0.15 : 0.08);
      }
      this.lastAnim = anim;
    }
    const run = this.actions.get('run');
    if (run && this.current === 'run') {
      // Stride rate follows the speed; in the air the legs freeze mid-stride.
      run.timeScale = anim === 'jump' || anim === 'fall' ? 0.15 : Math.max(0.8, v.speed / 8.5);
    }
    this.mixer.update(dt);

    this.root.position.y = v.h;
    // Lean into lane changes (a jump in lx after a respawn is not a move).
    const vel = dt > 0 ? (v.lx - this.lastLx) / dt : 0;
    this.lastLx = v.lx;
    const roll = Math.abs(vel) > 12 || v.reducedMotion ? 0 : Math.max(-0.32, Math.min(0.32, -vel * 0.05));
    this.root.rotation.z += (roll - this.root.rotation.z) * Math.min(1, dt * 14);
    // Lean into jumps, tuck on the way down.
    const targetTilt = anim === 'jump' ? -0.18 : anim === 'fall' ? 0.12 : 0;
    this.model.rotation.x += (targetTilt - this.model.rotation.x) * Math.min(1, dt * 10);
    this.blob.position.y = groundH - v.h + 0.02;
    const k = Math.max(0.35, 1 - (v.h - groundH) / 3);
    this.blob.scale.set(k, k * 1.5, 1);

    const target = v.solid ? 1 : 0.38;
    this.alpha += (target - this.alpha) * Math.min(1, dt * 10);
    this.setOpacity(this.alpha);
    if (this.rim) {
      this.rim.userData.uniforms.uGlow.value = v.solid ? 1 : 0.2;
      this.rim.userData.uniforms.uTime.value = this.time;
    }
    if (this.halo) {
      const flicker = v.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(this.time * 5);
      (this.halo.material as THREE.SpriteMaterial).opacity = (v.solid ? 0.55 : 0.18) * flicker;
    }
    if (this.light) this.light.intensity = v.solid ? 6 : 1.5;
  }

  private setOpacity(a: number): void {
    const transparent = a < 0.99;
    for (const m of this.materials) {
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = a;
      m.depthWrite = !transparent;
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const m of this.materials) m.dispose();
    this.blob.geometry.dispose();
    (this.blob.material as THREE.Material).dispose();
    (this.halo?.material as THREE.Material | undefined)?.dispose();
  }
}

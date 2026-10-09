import * as THREE from 'three';

import type { EnvironmentDef } from './Environment';
import { hash } from './Street';
import { cloudTexture, glowTexture, moonTexture } from './Textures';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uSunSize;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h * 1.6, 0.0, 1.0), 0.6)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6);
  col = mix(col, uSun * 1.4, smoothstep(1.0 - uSunSize * 0.02, 1.0 - uSunSize * 0.012, s));
  if (uStars > 0.0 && h > 0.05) {
    vec3 cell = floor(d * 220.0);
    float r = hash3(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0);
    col += vec3(0.9, 0.88, 1.0) * step(0.9965, r) * uStars * tw * smoothstep(0.05, 0.4, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Everything far away: a gradient sky dome with a sun or moon glow and stars, drifting clouds, a moon
 * sprite, a distant skyline at the end of the street and floating motes around the camera. The whole
 * group follows the camera along the run.
 */
export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly clouds: THREE.Sprite[] = [];
  private readonly skyline: THREE.Mesh;
  private readonly motes: THREE.Points | null = null;
  private readonly moteSpeed: Float32Array | null = null;
  private lastCamZ = Number.NaN;

  constructor(private readonly env: EnvironmentDef, seed: number, detail: boolean) {
    const s = env.sky;
    this.uniforms = {
      uTop: { value: new THREE.Color(s.top) },
      uHorizon: { value: new THREE.Color(s.horizon) },
      uBottom: { value: new THREE.Color(s.bottom) },
      uSun: { value: new THREE.Color(s.sun) },
      uSunDir: { value: new THREE.Vector3(...s.sunDir).normalize() },
      uSunSize: { value: s.sunSize * 40 },
      uStars: { value: env.stars ? 1 : 0 },
      uTime: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    if (env.moon) {
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), color: 0xffffff, fog: false, depthWrite: false, transparent: true }));
      const dir = new THREE.Vector3(...s.sunDir).normalize();
      moon.position.copy(dir.multiplyScalar(300));
      moon.scale.setScalar(70);
      this.group.add(moon);
    }
    if (env.clouds) {
      const tex = cloudTexture();
      const n = detail ? 9 : 5;
      for (let i = 0; i < n; i++) {
        const m = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, fog: false, depthWrite: false, transparent: true, opacity: 0.9 });
        m.color.lerp(new THREE.Color(s.horizon), 0.25);
        const c = new THREE.Sprite(m);
        const a = (hash(seed + i) - 0.5) * 2.2;
        const dist = 220 + hash(seed + i * 3) * 120;
        c.position.set(Math.sin(a) * dist, 45 + hash(seed + i * 7) * 70, -Math.cos(a) * dist);
        const w = 70 + hash(seed + i * 11) * 70;
        c.scale.set(w, w * 0.45, 1);
        c.userData.speed = 1 + hash(seed + i * 13) * 2;
        this.clouds.push(c);
        this.group.add(c);
      }
    }

    // Distant skyline: a ring of block silhouettes behind the end of the street.
    this.skyline = this.buildSkyline(env.skyline, seed);
    this.group.add(this.skyline);

    if (env.particles) {
      const n = Math.round(env.particles.count * (detail ? 1 : 0.5));
      const pos = new Float32Array(n * 3);
      this.moteSpeed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (hash(seed + i * 17) - 0.5) * 16;
        pos[i * 3 + 1] = hash(seed + i * 19) * 7;
        pos[i * 3 + 2] = -hash(seed + i * 23) * 40;
        this.moteSpeed[i] = 0.4 + hash(seed + i * 29);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.motes = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: env.particles.color, size: env.particles.size, map: glowTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      this.motes.frustumCulled = false;
      this.group.add(this.motes);
    }
  }

  private buildSkyline(color: number, seed: number): THREE.Mesh {
    const pos: number[] = [];
    const R = 260;
    let a = -1.2;
    let i = 0;
    while (a < 1.2) {
      const w = 0.03 + hash(seed + i * 31) * 0.05;
      const h = 12 + hash(seed + i * 37) * 38;
      const x0 = Math.sin(a) * R;
      const z0 = -Math.cos(a) * R;
      const x1 = Math.sin(a + w) * R;
      const z1 = -Math.cos(a + w) * R;
      pos.push(x0, -2, z0, x1, -2, z1, x1, h, z1, x0, -2, z0, x1, h, z1, x0, h, z0);
      a += w * (0.9 + hash(seed + i * 41) * 0.4);
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -9;
    return mesh;
  }

  update(camera: THREE.Camera, t: number, dt: number): void {
    this.group.position.set(camera.position.x, 0, camera.position.z);
    // Motes stay put in the world while the camera runs through them.
    const dz = Number.isNaN(this.lastCamZ) ? 0 : camera.position.z - this.lastCamZ;
    this.lastCamZ = camera.position.z;
    this.uniforms.uTime.value = t;
    for (const c of this.clouds) {
      c.position.x += (c.userData.speed as number) * dt;
      if (c.position.x > 320) c.position.x -= 640;
    }
    if (this.motes && this.moteSpeed && this.env.particles) {
      const attr = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
      const p = attr.array as Float32Array;
      const rise = this.env.particles.rise;
      for (let i = 0; i < this.moteSpeed.length; i++) {
        p[i * 3 + 1] += rise * this.moteSpeed[i] * dt;
        p[i * 3] += Math.sin(t * 0.7 + i) * 0.15 * dt;
        p[i * 3 + 2] -= dz;
        if (p[i * 3 + 1] > 7) p[i * 3 + 1] -= 7;
        if (p[i * 3 + 1] < 0) p[i * 3 + 1] += 7;
        if (p[i * 3 + 2] > 2) p[i * 3 + 2] -= 42;
        if (p[i * 3 + 2] < -40) p[i * 3 + 2] += 42;
      }
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.skyline.geometry.dispose();
    (this.skyline.material as THREE.Material).dispose();
    for (const c of this.clouds) c.material.dispose();
    this.motes?.geometry.dispose();
    (this.motes?.material as THREE.Material | undefined)?.dispose();
  }
}

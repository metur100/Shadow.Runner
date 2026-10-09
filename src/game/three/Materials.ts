import * as THREE from 'three';

const cache = new Map<string, THREE.Material>();

/** Material names in the Quaternius models that are glass / window panes / lamps. */
const GLASS = /^(DarkGrey|Glass|Window|Light)$/i;

function key(m: THREE.Material, tag: string): string {
  return `${m.uuid}|${tag}`;
}

/** The same material with its colour multiplied by `tint` (cached). */
export function tinted(m: THREE.MeshStandardMaterial, tint: number): THREE.Material {
  if (tint === 0xffffff) return m;
  const k = key(m, `tint-${tint}`);
  let out = cache.get(k);
  if (!out) {
    const c = m.clone();
    c.color.multiply(new THREE.Color(tint));
    out = c;
    cache.set(k, out);
  }
  return out;
}

/**
 * The shadow-world version of a material: the colour drained to a dark violet silhouette, and window
 * panes / lamps turned into glowing emissive surfaces of the world's glow colour.
 */
export function shadowed(m: THREE.MeshStandardMaterial, glow: number, glowWindows = true): THREE.Material {
  const k = key(m, `shadow-${glow}-${glowWindows}`);
  let out = cache.get(k);
  if (out) return out;
  const c = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1, map: m.map ?? null, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side });
  const hsl = { h: 0, s: 0, l: 0 };
  m.color.getHSL(hsl);
  const base = new THREE.Color(0x221a46);
  const g = new THREE.Color(glow);
  // Lighter originals stay a little lighter so shapes still read.
  c.color.copy(base).lerp(g, 0.05 + hsl.l * 0.1).multiplyScalar(0.4 + hsl.l * 0.45);
  if (glowWindows && GLASS.test(m.name)) {
    c.color.copy(g).multiplyScalar(0.2);
    c.emissive.copy(g);
    c.emissiveIntensity = 1.6;
  } else {
    c.emissive.copy(g);
    c.emissiveIntensity = 0.04;
  }
  out = c;
  cache.set(k, out);
  return out;
}

/** Emissive look for lamp heads etc. in a daylight world (unchanged otherwise). */
export function lit(m: THREE.MeshStandardMaterial, glow: number, intensity: number): THREE.Material {
  const k = key(m, `lit-${glow}-${intensity}`);
  let out = cache.get(k);
  if (!out) {
    const c = m.clone();
    c.emissive.set(glow);
    c.emissiveIntensity = intensity;
    out = c;
    cache.set(k, out);
  }
  return out;
}

/**
 * Dark body with a glowing fresnel rim – the shadow form. The rim brightens with `uGlow` (active form)
 * and pulses slowly.
 */
export function rimMaterial(body: number, rim: number): THREE.MeshStandardMaterial & { userData: { uniforms: { uGlow: { value: number }; uTime: { value: number } } } } {
  const m = new THREE.MeshStandardMaterial({ color: body, roughness: 0.7, metalness: 0.1, emissive: new THREE.Color(rim), emissiveIntensity: 0.05 });
  const uniforms = { uGlow: { value: 1 }, uTime: { value: 0 }, uRim: { value: new THREE.Color(rim) } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uTime;\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fr = pow(1.0 - abs(dot(normalize(-vViewPosition), normal)), 3.0);
        totalEmissiveRadiance += uRim * fr * (0.85 + 0.2 * sin(uTime * 3.0)) * (0.35 + uGlow * 0.9);`,
      );
  };
  m.customProgramCacheKey = () => 'rim';
  (m as unknown as { userData: { uniforms: typeof uniforms } }).userData.uniforms = uniforms;
  return m as ReturnType<typeof rimMaterial>;
}

/** Additive glowing material (light shafts, beams, halos). */
export function glowMaterial(color: number, opacity: number, map: THREE.Texture | null = null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Bundled CC0 models (see src/assets/models/CREDITS.md), keyed by file name without extension. */
const URLS = import.meta.glob('../../assets/models/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type ModelName =
  | 'runner'
  | 'house-brick'
  | 'house-big'
  | 'house-large'
  | 'house-tall'
  | 'house-grey'
  | 'house-wide'
  | 'cottage'
  | 'street-light'
  | 'street-light-2'
  | 'traffic-light'
  | 'hydrant'
  | 'bench'
  | 'trashcan'
  | 'dumpster'
  | 'cone'
  | 'road-barrier'
  | 'fence'
  | 'car'
  | 'car-2'
  | 'suv'
  | 'police-car'
  | 'broken-car'
  | 'tree'
  | 'tree-wide'
  | 'tree-tall'
  | 'palm'
  | 'bush'
  | 'bush-flowers'
  | 'hedge'
  | 'dead-tree'
  | 'column'
  | 'arch'
  | 'arch-round'
  | 'stone-wall'
  | 'water-tower'
  | 'dish'
  | 'pipes'
  | 'antenna'
  | 'neon-signs'
  | 'crate'
  | 'barrel'
  | 'spike-trap'
  | 'spiky-ball'
  | 'coin'
  | 'crystal'
  | 'crystal-small'
  | 'gem'
  | 'flag';

export interface ModelInfo {
  gltf: GLTF;
  /** Bounding box of the untransformed model. */
  box: THREE.Box3;
  size: THREE.Vector3;
}

const cache = new Map<string, ModelInfo>();
let loading: Promise<void> | null = null;

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -4);
}

/** Loads every bundled model once. Safe to call repeatedly. */
export function loadModels(onProgress?: (fraction: number) => void): Promise<void> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const entries = Object.entries(URLS);
  let done = 0;
  loading = Promise.all(
    entries.map(async ([path, url]) => {
      const gltf = await loader.loadAsync(url);
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const sm = m as THREE.MeshStandardMaterial;
          if (sm.isMeshStandardMaterial) {
            // Low-poly art reads best fairly matte.
            sm.roughness = Math.max(sm.roughness, 0.55);
            sm.metalness = Math.min(sm.metalness, 0.3);
          }
        }
      });
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      cache.set(nameOf(path), { gltf, box, size: box.getSize(new THREE.Vector3()) });
      done++;
      onProgress?.(done / entries.length);
    }),
  ).then(() => undefined);
  return loading;
}

export function modelsReady(): boolean {
  return cache.size === Object.keys(URLS).length;
}

export function info(name: ModelName): ModelInfo {
  const m = cache.get(name);
  if (!m) throw new Error(`model ${name} not loaded`);
  return m;
}

/**
 * A copy of a model that shares geometry and materials with the original, wrapped in a group whose
 * origin is the centre of the model's footprint on the ground, scaled to `height` (metres) or `scale`.
 */
export function instance(name: ModelName, opts: { height?: number; width?: number; depth?: number; scale?: number } = {}): THREE.Group {
  const m = info(name);
  const inner = m.gltf.scene.clone(true);
  const group = new THREE.Group();
  let s = opts.scale ?? 1;
  if (opts.height) s = opts.height / m.size.y;
  else if (opts.width) s = opts.width / m.size.x;
  else if (opts.depth) s = opts.depth / m.size.z;
  const c = m.box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x * s, -m.box.min.y * s, -c.z * s);
  inner.scale.setScalar(s);
  group.add(inner);
  group.userData.model = name;
  group.userData.size = m.size.clone().multiplyScalar(s);
  return group;
}

/** A skinned copy (own skeleton) plus its animation clips. */
export function skinnedInstance(name: ModelName): { root: THREE.Object3D; clips: THREE.AnimationClip[]; size: THREE.Vector3 } {
  const m = info(name);
  return { root: cloneSkinned(m.gltf.scene), clips: m.gltf.animations, size: m.size.clone() };
}

/** Every distinct material used by a model (for recolouring). */
export function materialsOf(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) out.add(m as THREE.MeshStandardMaterial);
  });
  return [...out];
}

/** Replaces every material in a subtree through `map` (results are cached by the caller). */
export function remapMaterials(root: THREE.Object3D, map: (m: THREE.MeshStandardMaterial) => THREE.Material): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => map(m as THREE.MeshStandardMaterial))
      : map(mesh.material as THREE.MeshStandardMaterial);
  });
}

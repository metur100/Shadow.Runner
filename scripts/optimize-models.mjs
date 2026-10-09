/**
 * Optimises the CC0 source models (see src/assets/models/CREDITS.md) for the game:
 * dedupes, welds, simplifies heavy meshes, quantises and meshopt-compresses them.
 *
 *   node scripts/optimize-models.mjs <source-dir>
 *
 * <source-dir> holds the original .glb downloads named as in MODELS below. Output goes to
 * src/assets/models/<name>.glb.
 */
import fs from 'node:fs';
import path from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/** name → [source file, simplify ratio (1 = keep all triangles)] */
const MODELS = {
  runner: ['hoodie.glb', 1],
  'house-brick': ['q/townhouse2.glb', 1],
  'house-big': ['q/bigbuilding.glb', 1],
  'house-large': ['q/townhouse_large.glb', 0.8],
  'house-tall': ['q/townhouse3.glb', 0.7],
  'house-grey': ['q/building.glb', 0.8],
  'house-wide': ['q/townhouse1.glb', 0.35],
  cottage: ['q/house1.glb', 0.5],
  'street-light': ['q/streetlight1.glb', 1],
  'street-light-2': ['q/streetlight3.glb', 1],
  'traffic-light': ['q/trafficlight.glb', 1],
  hydrant: ['q/hydrant.glb', 1],
  bench: ['q/bench.glb', 1],
  trashcan: ['q/trashcan.glb', 1],
  dumpster: ['q/dumpster.glb', 1],
  cone: ['q/cone.glb', 1],
  'road-barrier': ['q/trafficbarrier.glb', 1],
  fence: ['q/barrierlarge.glb', 1],
  car: ['q/car1.glb', 1],
  'car-2': ['q/car2.glb', 1],
  suv: ['q/suv.glb', 1],
  'police-car': ['q/policecar.glb', 1],
  'broken-car': ['q/brokencar.glb', 1],
  tree: ['q/tree3.glb', 1],
  'tree-wide': ['q/tree2.glb', 1],
  'tree-tall': ['q/tree1.glb', 0.25],
  palm: ['q/palm1.glb', 1],
  bush: ['q/bush.glb', 0.6],
  'bush-flowers': ['q/bushflowers.glb', 0.3],
  hedge: ['q/hedge.glb', 0.6],
  'dead-tree': ['q/deadtree1.glb', 0.2],
  column: ['q/column2.glb', 1],
  arch: ['q/arch1.glb', 0.6],
  'arch-round': ['q/archround.glb', 1],
  'stone-wall': ['q/wallmodular.glb', 1],
  'water-tower': ['q/watertower.glb', 1],
  dish: ['q/roofradar.glb', 1],
  pipes: ['q/pipes.glb', 1],
  antenna: ['q/antenna.glb', 1],
  'neon-signs': ['q/cybersigns.glb', 0.8],
  crate: ['q/crate1.glb', 1],
  barrel: ['q/barrel.glb', 1],
  'spike-trap': ['q/spiketrap.glb', 1],
  'spiky-ball': ['q/spikyball.glb', 1],
  coin: ['q/coin1.glb', 1],
  crystal: ['q/bigcrystal.glb', 1],
  'crystal-small': ['q/crystal.glb', 1],
  gem: ['q/gempink.glb', 1],
  flag: ['q/goalflag.glb', 1],
};

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/optimize-models.mjs <source-dir>');
const out = path.resolve(import.meta.dirname, '../src/assets/models');
fs.mkdirSync(out, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

let total = 0;
for (const [name, [file, ratio]] of Object.entries(MODELS)) {
  const doc = await io.read(path.join(src, file));
  const steps = [dedup(), weld(), resample()];
  if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }));
  // Textures: at most 512 px, WebP (the WebViews and three.js support EXT_texture_webp).
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }));
  steps.push(prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  const bytes = await io.writeBinary(doc);
  fs.writeFileSync(path.join(out, `${name}.glb`), bytes);
  total += bytes.length;
  const before = fs.statSync(path.join(src, file)).size;
  console.log(`${name.padEnd(16)} ${(before / 1024).toFixed(0).padStart(6)} KB → ${(bytes.length / 1024).toFixed(0).padStart(5)} KB`);
}
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);

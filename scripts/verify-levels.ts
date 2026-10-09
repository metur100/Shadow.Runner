/**
 * Plays every campaign level (and a week of daily challenges and endless segments) with the beam-search
 * auto-player, using only switch / jump / slide inputs, and fails if any level cannot be finished without
 * taking damage.
 *
 *   npm run verify:levels            all levels
 *   npm run verify:levels -- w3-2    one level
 */
import { buildDailyLevel } from '../src/game/systems/DailyChallenge';
import { buildEndlessPreview } from '../src/game/systems/EndlessGenerator';
import { buildTutorialLevel, LEVELS } from '../src/game/levels/LevelData';
import type { LevelDefinition } from '../src/game/levels/LevelDefinition';
import { solveLevel } from '../src/game/levels/LevelSolver';

const only = process.argv[2];
const levels: LevelDefinition[] = [buildTutorialLevel(), ...LEVELS];
const today = new Date();
for (let d = 0; d < 7; d++) {
  const date = new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);
  levels.push(buildDailyLevel(date));
}
levels.push(buildEndlessPreview(12345));

let failures = 0;
const started = performance.now();
for (const level of levels) {
  if (only && level.id !== only) continue;
  const t0 = performance.now();
  const result = solveLevel(level);
  const ms = Math.round(performance.now() - t0);
  const total = level.collectibles.filter((c) => c.kind !== 'key').length;
  const collected = result.coins + result.crystals;
  const twoStars = collected >= level.required;
  if (result.solved) {
    console.log(
      `✔ ${level.id.padEnd(16)} ${level.name.padEnd(20)} ${(level.length / 1000).toFixed(1).padStart(5)}k  ` +
        `${result.switches} switches (par ${level.parSwitches})  items ${collected}/${total} (2★ needs ${level.required}${twoStars ? '' : ' – NOT reached by the bot'})  ${ms} ms`,
    );
  } else {
    failures++;
    console.log(`✘ ${level.id.padEnd(16)} ${level.name.padEnd(20)} stuck at ${Math.round(result.reached)} / ${level.length}  ${ms} ms`);
  }
}
console.log(`\n${failures === 0 ? 'All levels can be finished without damage.' : `${failures} level(s) failed.`} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
process.exit(failures === 0 ? 0 : 1);

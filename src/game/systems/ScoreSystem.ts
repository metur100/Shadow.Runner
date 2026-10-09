import type { LevelDefinition } from '../levels/LevelDefinition';
import { clamp01 } from '../utils/MathUtils';

/** Everything the score is computed from (produced by RunSession.stats()). */
export interface RunStats {
  completed: boolean;
  /** 0..1 share of the level completed. */
  progress: number;
  distance: number;
  coins: number;
  crystals: number;
  keys: number;
  totalCollectibles: number;
  timeUsed: number;
  timeLimit: number;
  switches: number;
  parSwitches: number;
  damage: number;
  checkpoints: number;
  nearMisses: number;
}

export interface ScoreBreakdown {
  distance: number;
  collectibles: number;
  time: number;
  efficiency: number;
  checkpoints: number;
  nearMisses: number;
  damage: number;
  total: number;
  stars: number;
}

/**
 * Switches allowed above the level's minimum before efficiency starts to drop. Generous on purpose:
 * collecting coins and crystals also takes switches.
 */
export const efficiencyAllowance = (par: number): number => Math.max(6, par);

/** 0..1: 1 = within the allowance, then dropping to 0 as extra switches pile up. */
export function switchEfficiency(switches: number, par: number): number {
  const allowed = par + efficiencyAllowance(par);
  if (switches <= allowed) return 1;
  return clamp01(1 - (switches - allowed) / Math.max(8, par + 8));
}

/**
 * Stars:
 *   one    finish the level
 *   two    finish with at least `level.required` coins + crystals
 *   three  the above, without taking damage and with a switch efficiency of at least 60 %
 */
export function starsFor(stats: RunStats, required: number): number {
  if (!stats.completed) return 0;
  const collected = stats.coins + stats.crystals;
  if (collected < required) return 1;
  if (stats.damage > 0 || switchEfficiency(stats.switches, stats.parSwitches) < 0.6) return 2;
  return 3;
}

/**
 *   distance      1 point per 10 units travelled
 *   collectibles  50 per coin, 60 per crystal, 150 per key
 *   time          10 per second left (completed runs only)
 *   efficiency    up to 500 for switching only as much as needed (completed runs only)
 *   checkpoints   100 each
 *   near misses   25 each
 *   damage        −250 per hit
 */
export function computeScore(stats: RunStats, level: Pick<LevelDefinition, 'required'>): ScoreBreakdown {
  const distance = Math.round(stats.distance / 10);
  const collectibles = stats.coins * 50 + stats.crystals * 60 + stats.keys * 150;
  const time = stats.completed ? Math.round(Math.max(0, stats.timeLimit - stats.timeUsed) * 10) : 0;
  const efficiency = stats.completed ? Math.round(500 * switchEfficiency(stats.switches, stats.parSwitches)) : 0;
  const checkpoints = stats.checkpoints * 100;
  const nearMisses = stats.nearMisses * 25;
  const damage = -250 * stats.damage;
  const total = Math.max(0, distance + collectibles + time + efficiency + checkpoints + nearMisses + damage);
  return { distance, collectibles, time, efficiency, checkpoints, nearMisses, damage, total, stars: starsFor(stats, level.required) };
}

import { LEVELS, LEVELS_PER_WORLD, levelById } from '../levels/LevelData';
import type { LevelDefinition } from '../levels/LevelDefinition';
import { WORLDS } from '../levels/WorldDefinitions';
import { COSMETICS, type CosmeticItem, type Requirement } from './Cosmetics';
import type { LevelRecord, SaveData } from './SaveManager';
import type { RunStats, ScoreBreakdown } from './ScoreSystem';

/**
 * Progression rules:
 *   – the first level is always open; every other level opens when the one before it is completed
 *   – a world opens when the last level of the previous world is completed
 *   – endless mode opens once World 1 is finished
 *   – cosmetics unlock from stars, lifetime coins / crystals, finished levels, dailies and endless distance
 */

export const levelRecord = (save: SaveData, id: string): LevelRecord | undefined => save.levels[id];

export function isLevelUnlocked(save: SaveData, index: number): boolean {
  if (index <= 0) return true;
  const previous = LEVELS[index - 1];
  return previous !== undefined && save.levels[previous.id]?.completed === true;
}

export function isWorldUnlocked(save: SaveData, worldId: number): boolean {
  if (worldId <= 0) return true;
  return isLevelUnlocked(save, worldId * LEVELS_PER_WORLD);
}

export function totalStars(save: SaveData): number {
  return Object.values(save.levels).reduce((sum, r) => sum + r.stars, 0);
}

export function worldStars(save: SaveData, worldId: number): number {
  return LEVELS.filter((l) => l.worldId === worldId).reduce((sum, l) => sum + (save.levels[l.id]?.stars ?? 0), 0);
}

export function worldCompleted(save: SaveData, worldId: number): number {
  return LEVELS.filter((l) => l.worldId === worldId && save.levels[l.id]?.completed).length;
}

/** Best progress through a world: completed levels plus the share of the furthest unfinished level. */
export function worldProgress(save: SaveData, worldId: number): number {
  const levels = LEVELS.filter((l) => l.worldId === worldId);
  const sum = levels.reduce((acc, l) => {
    const r = save.levels[l.id];
    return acc + (r?.completed ? 1 : (r?.bestProgress ?? 0));
  }, 0);
  return sum / levels.length;
}

export const isEndlessUnlocked = (save: SaveData): boolean => save.levels[`w1-${LEVELS_PER_WORLD}`]?.completed === true;

/** The level "Play" should start: the first unlocked level that is not completed yet (or the last one). */
export function nextLevelIndex(save: SaveData): number {
  for (let i = 0; i < LEVELS.length; i++) {
    if (!save.levels[LEVELS[i].id]?.completed) return isLevelUnlocked(save, i) ? i : Math.max(0, i - 1);
  }
  return LEVELS.length - 1;
}

export function requirementMet(save: SaveData, req: Requirement): boolean {
  switch (req.type) {
    case 'free':
      return true;
    case 'stars':
      return totalStars(save) >= req.count;
    case 'coins':
      return save.wallet.coins >= req.count;
    case 'crystals':
      return save.wallet.crystals >= req.count;
    case 'level':
      return save.levels[req.id]?.completed === true;
    case 'dailyPlays':
      return save.daily.plays >= req.count;
    case 'endless':
      return save.endless.bestDistance >= req.distance;
  }
}

/** Recomputes unlocked worlds and cosmetics. Returns a new save (and the newly unlocked cosmetics). */
export function refreshDerived(save: SaveData): { save: SaveData; newCosmetics: CosmeticItem[] } {
  const unlockedWorlds = WORLDS.filter((w) => isWorldUnlocked(save, w.id)).map((w) => w.id);
  const newCosmetics = COSMETICS.filter((c) => !save.cosmetics.unlocked.includes(c.id) && requirementMet(save, c.requirement));
  return {
    save: {
      ...save,
      unlockedWorlds,
      cosmetics: { ...save.cosmetics, unlocked: [...save.cosmetics.unlocked, ...newCosmetics.map((c) => c.id)] },
    },
    newCosmetics,
  };
}

export interface ResultUpdate {
  save: SaveData;
  newBest: boolean;
  newStars: number;
  unlockedLevel: LevelDefinition | null;
  unlockedWorld: number | null;
  newCosmetics: CosmeticItem[];
}

/** Applies a finished (or failed) campaign run to the save. */
export function recordLevelResult(save: SaveData, level: LevelDefinition, stats: RunStats, score: ScoreBreakdown): ResultUpdate {
  const before = save.levels[level.id];
  const wasUnlocked = level.index + 1 < LEVELS.length && isLevelUnlocked(save, level.index + 1);
  const worldsBefore = save.unlockedWorlds.length;
  const record: LevelRecord = {
    completed: (before?.completed ?? false) || stats.completed,
    stars: Math.max(before?.stars ?? 0, score.stars),
    bestScore: Math.max(before?.bestScore ?? 0, stats.completed ? score.total : 0),
    bestTime: stats.completed ? (before?.bestTime ? Math.min(before.bestTime, stats.timeUsed) : stats.timeUsed) : (before?.bestTime ?? 0),
    bestProgress: Math.max(before?.bestProgress ?? 0, stats.progress),
    plays: (before?.plays ?? 0) + 1,
  };
  let next: SaveData = {
    ...save,
    levels: { ...save.levels, [level.id]: record },
    wallet: { coins: save.wallet.coins + stats.coins, crystals: save.wallet.crystals + stats.crystals },
    stats: addRunStats(save, stats),
  };
  const derived = refreshDerived(next);
  next = derived.save;
  const nextLevel = LEVELS[level.index + 1] ?? null;
  return {
    save: next,
    newBest: stats.completed && score.total > (before?.bestScore ?? 0),
    newStars: Math.max(0, record.stars - (before?.stars ?? 0)),
    unlockedLevel: !wasUnlocked && nextLevel && isLevelUnlocked(next, nextLevel.index) ? nextLevel : null,
    unlockedWorld: next.unlockedWorlds.length > worldsBefore ? next.unlockedWorlds[next.unlockedWorlds.length - 1] : null,
    newCosmetics: derived.newCosmetics,
  };
}

/** Applies a daily-challenge run. */
export function recordDailyResult(save: SaveData, date: string, stats: RunStats, score: ScoreBreakdown): { save: SaveData; newBest: boolean; newCosmetics: CosmeticItem[] } {
  const previous = save.daily.best[date] ?? 0;
  const firstToday = save.daily.lastDate !== date;
  const derived = refreshDerived({
    ...save,
    daily: {
      best: { ...save.daily.best, [date]: Math.max(previous, score.total) },
      plays: save.daily.plays + (firstToday ? 1 : 0),
      lastDate: date,
    },
    wallet: { coins: save.wallet.coins + stats.coins, crystals: save.wallet.crystals + stats.crystals },
    stats: addRunStats(save, stats),
  });
  return { save: derived.save, newBest: score.total > previous, newCosmetics: derived.newCosmetics };
}

/** Applies an endless run (distance in metres = world units / 10). */
export function recordEndlessResult(save: SaveData, stats: RunStats, score: ScoreBreakdown): { save: SaveData; newBest: boolean; newCosmetics: CosmeticItem[] } {
  const metres = Math.round(stats.distance / 10);
  const derived = refreshDerived({
    ...save,
    endless: {
      bestDistance: Math.max(save.endless.bestDistance, metres),
      bestScore: Math.max(save.endless.bestScore, score.total),
      runs: save.endless.runs + 1,
    },
    wallet: { coins: save.wallet.coins + stats.coins, crystals: save.wallet.crystals + stats.crystals },
    stats: addRunStats(save, stats),
  });
  return { save: derived.save, newBest: metres > save.endless.bestDistance, newCosmetics: derived.newCosmetics };
}

function addRunStats(save: SaveData, stats: RunStats): SaveData['stats'] {
  return {
    runs: save.stats.runs + 1,
    switches: save.stats.switches + stats.switches,
    jumps: save.stats.jumps,
    hits: save.stats.hits + stats.damage,
    distance: save.stats.distance + stats.distance,
    playSeconds: save.stats.playSeconds + stats.timeUsed,
  };
}

export function levelName(id: string): string {
  return levelById(id)?.name ?? id;
}

import { describe, expect, it } from 'vitest';

import { LEVELS } from '../src/game/levels/LevelData';
import { buildDailyLevel, todayKey } from '../src/game/systems/DailyChallenge';
import {
  isEndlessUnlocked,
  isLevelUnlocked,
  isWorldUnlocked,
  nextLevelIndex,
  recordDailyResult,
  recordLevelResult,
  totalStars,
} from '../src/game/systems/LevelManager';
import { createDefaultSave, SAVE_VERSION, SaveManager, type SaveData, type StorageLike } from '../src/game/systems/SaveManager';
import { computeScore, type RunStats } from '../src/game/systems/ScoreSystem';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

const win = (coins = 50): RunStats => ({
  completed: true,
  progress: 1,
  distance: 15000,
  coins,
  crystals: 30,
  keys: 0,
  totalCollectibles: 100,
  timeUsed: 50,
  timeLimit: 90,
  switches: 5,
  parSwitches: 4,
  damage: 0,
  checkpoints: 3,
  nearMisses: 0,
});

function complete(save: SaveData, index: number): SaveData {
  const level = LEVELS[index];
  const stats = win();
  return recordLevelResult(save, level, stats, computeScore(stats, level)).save;
}

describe('level unlock rules', () => {
  it('starts with only the first level and world open', () => {
    const save = createDefaultSave();
    expect(isLevelUnlocked(save, 0)).toBe(true);
    expect(isLevelUnlocked(save, 1)).toBe(false);
    expect(isWorldUnlocked(save, 0)).toBe(true);
    expect(isWorldUnlocked(save, 1)).toBe(false);
    expect(nextLevelIndex(save)).toBe(0);
  });

  it('completing a level opens the next one', () => {
    const level = LEVELS[0];
    const stats = win();
    const result = recordLevelResult(createDefaultSave(), level, stats, computeScore(stats, level));
    expect(isLevelUnlocked(result.save, 1)).toBe(true);
    expect(result.unlockedLevel?.id).toBe('w1-2');
    expect(nextLevelIndex(result.save)).toBe(1);
  });

  it('a failed run does not unlock anything but remembers progress', () => {
    const level = LEVELS[0];
    const stats = { ...win(), completed: false, progress: 0.4 };
    const result = recordLevelResult(createDefaultSave(), level, stats, computeScore(stats, level));
    expect(isLevelUnlocked(result.save, 1)).toBe(false);
    expect(result.save.levels['w1-1'].bestProgress).toBeCloseTo(0.4);
  });

  it('finishing a world opens the next world and endless mode', () => {
    let save = createDefaultSave();
    for (let i = 0; i < 5; i++) save = complete(save, i);
    expect(isWorldUnlocked(save, 1)).toBe(true);
    expect(save.unlockedWorlds).toContain(1);
    expect(isEndlessUnlocked(save)).toBe(true);
    expect(totalStars(save)).toBe(15);
  });

  it('keeps the best stars, score and time', () => {
    let save = complete(createDefaultSave(), 0);
    const level = LEVELS[0];
    const worse = { ...win(0), crystals: 0, timeUsed: 80 };
    save = recordLevelResult(save, level, worse, computeScore(worse, level)).save;
    expect(save.levels['w1-1'].stars).toBe(3);
    expect(save.levels['w1-1'].bestTime).toBe(50);
    expect(save.levels['w1-1'].plays).toBe(2);
  });

  it('unlocks cosmetics from stars', () => {
    let save = createDefaultSave();
    save = complete(save, 0);
    save = complete(save, 1);
    expect(save.cosmetics.unlocked).toContain('sunrise');
  });
});

describe('save and load', () => {
  it('round-trips the save through storage', () => {
    const storage = new MemoryStorage();
    const manager = new SaveManager(storage);
    let save = complete(createDefaultSave(), 0);
    save = { ...save, settings: { ...save.settings, music: false, leftHanded: true } };
    manager.save(save);
    const loaded = manager.load();
    expect(loaded.levels['w1-1'].completed).toBe(true);
    expect(loaded.settings.music).toBe(false);
    expect(loaded.settings.leftHanded).toBe(true);
    expect(loaded.version).toBe(SAVE_VERSION);
  });

  it('backs up a corrupted save and starts fresh', () => {
    const storage = new MemoryStorage();
    storage.setItem('shadow-runner/save', '{not json');
    const loaded = new SaveManager(storage).load();
    expect(loaded.levels).toEqual({});
    expect(storage.getItem('shadow-runner/save.corrupt')).toBe('{not json');
  });

  it('migrates an old version and sanitises bad values', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'shadow-runner/save',
      JSON.stringify({
        version: 1,
        levels: { 'w1-1': { completed: true, stars: 7, bestScore: -5 } },
        stats: { deaths: 4 },
        entitlements: { skinPacks: ['a'] },
        settings: { sound: 'yes', music: false },
      }),
    );
    const loaded = new SaveManager(storage).load();
    expect(loaded.levels['w1-1'].stars).toBe(3);
    expect(loaded.levels['w1-1'].bestScore).toBe(0);
    expect(loaded.stats.hits).toBe(4);
    expect(loaded.entitlements.cosmeticPacks).toEqual(['a']);
    expect(loaded.settings.sound).toBe(true);
    expect(loaded.settings.music).toBe(false);
  });

  it('keeps the daily best per date', () => {
    const stats = win();
    const score = computeScore(stats, { required: 10 });
    let save = recordDailyResult(createDefaultSave(), '2026-10-09', stats, score).save;
    save = recordDailyResult(save, '2026-10-09', { ...stats, coins: 0 }, computeScore({ ...stats, coins: 0 }, { required: 10 })).save;
    expect(save.daily.best['2026-10-09']).toBe(score.total);
    expect(save.daily.plays).toBe(1);
  });
});

describe('daily challenge determinism', () => {
  it('builds the same level for the same date', () => {
    const a = buildDailyLevel('2026-10-09');
    const b = buildDailyLevel('2026-10-09');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('builds different levels on different dates', () => {
    const a = buildDailyLevel('2026-10-09');
    const b = buildDailyLevel('2026-10-10');
    expect(JSON.stringify(a.obstacles)).not.toBe(JSON.stringify(b.obstacles));
  });

  it('mixes two different worlds', () => {
    for (const date of ['2026-01-01', '2026-03-15', '2026-10-09', '2027-07-04']) {
      const level = buildDailyLevel(date);
      expect(level.shadowTheme).toBeDefined();
      expect(level.shadowTheme).not.toBe(level.theme);
    }
  });

  it('uses the local calendar date as the key', () => {
    expect(todayKey(new Date(2026, 9, 9, 23, 30))).toBe('2026-10-09');
  });
});

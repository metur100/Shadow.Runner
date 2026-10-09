import type { Entitlements } from '../monetization/MonetizationManager';
import { STORAGE_KEY } from '../utils/Constants';
import { DEFAULT_SELECTION, type CosmeticCategory } from './Cosmetics';

export const SAVE_VERSION = 2;

export interface LevelRecord {
  completed: boolean;
  stars: number;
  bestScore: number;
  /** Fastest completion in seconds (0 = none yet). */
  bestTime: number;
  /** Furthest share of the level reached (0..1). */
  bestProgress: number;
  plays: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  reducedMotion: boolean;
  leftHanded: boolean;
  highContrast: boolean;
}

export interface SaveData {
  version: number;
  tutorialDone: boolean;
  levels: Record<string, LevelRecord>;
  /** Lifetime coins and crystals collected (cosmetic unlocks – never spent). */
  wallet: { coins: number; crystals: number };
  unlockedWorlds: number[];
  cosmetics: { unlocked: string[]; selected: Record<CosmeticCategory, string> };
  settings: Settings;
  daily: { best: Record<string, number>; plays: number; lastDate: string | null };
  endless: { bestDistance: number; bestScore: number; runs: number };
  stats: { runs: number; switches: number; jumps: number; hits: number; distance: number; playSeconds: number };
  entitlements: Entitlements;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  vibration: true,
  reducedMotion: false,
  leftHanded: false,
  highContrast: false,
};

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    tutorialDone: false,
    levels: {},
    wallet: { coins: 0, crystals: 0 },
    unlockedWorlds: [0],
    cosmetics: { unlocked: Object.values(DEFAULT_SELECTION), selected: { ...DEFAULT_SELECTION } },
    settings: { ...DEFAULT_SETTINGS },
    daily: { best: {}, plays: 0, lastDate: null },
    endless: { bestDistance: 0, bestScore: 0, runs: 0 },
    stats: { runs: 0, switches: 0, jumps: 0, hits: 0, distance: 0, playSeconds: 0 },
    entitlements: { removeAds: false, cosmeticPacks: [], bonusDaily: false },
  };
}

const num = (v: unknown, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/**
 * Upgrades older save formats step by step.
 *   v1 → v2: `deaths` became `hits`, and entitlements gained `cosmeticPacks` (was `skinPacks`).
 */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const data = { ...raw };
  let version = num(data.version, 1);
  if (version < 2) {
    const stats = obj(data.stats);
    data.stats = { ...stats, hits: stats.hits ?? stats.deaths ?? 0 };
    const ent = obj(data.entitlements);
    data.entitlements = { ...ent, cosmeticPacks: ent.cosmeticPacks ?? ent.skinPacks ?? [] };
    version = 2;
  }
  data.version = version;
  return data;
}

/** Validates every field, so a damaged or hand-edited save can never crash the game. */
export function sanitize(raw: Record<string, unknown>): SaveData {
  const d = createDefaultSave();
  d.tutorialDone = bool(raw.tutorialDone, false);
  for (const [id, value] of Object.entries(obj(raw.levels))) {
    const r = obj(value);
    d.levels[id] = {
      completed: bool(r.completed, false),
      stars: Math.round(num(r.stars, 0, 0, 3)),
      bestScore: Math.round(num(r.bestScore)),
      bestTime: num(r.bestTime),
      bestProgress: num(r.bestProgress, 0, 0, 1),
      plays: Math.round(num(r.plays)),
    };
  }
  const wallet = obj(raw.wallet);
  d.wallet = { coins: Math.round(num(wallet.coins)), crystals: Math.round(num(wallet.crystals)) };
  const worlds = Array.isArray(raw.unlockedWorlds) ? raw.unlockedWorlds.filter((w): w is number => typeof w === 'number' && w >= 0 && w < 6) : [0];
  d.unlockedWorlds = [...new Set([0, ...worlds])].sort();
  const cosmetics = obj(raw.cosmetics);
  d.cosmetics.unlocked = [...new Set([...d.cosmetics.unlocked, ...strings(cosmetics.unlocked)])];
  const selected = obj(cosmetics.selected);
  for (const key of Object.keys(DEFAULT_SELECTION) as CosmeticCategory[]) {
    const id = selected[key];
    if (typeof id === 'string' && d.cosmetics.unlocked.includes(id)) d.cosmetics.selected[key] = id;
  }
  const settings = obj(raw.settings);
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) d.settings[key] = bool(settings[key], DEFAULT_SETTINGS[key]);
  const daily = obj(raw.daily);
  for (const [date, score] of Object.entries(obj(daily.best))) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) d.daily.best[date] = Math.round(num(score));
  }
  d.daily.plays = Math.round(num(daily.plays));
  d.daily.lastDate = typeof daily.lastDate === 'string' ? daily.lastDate : null;
  const endless = obj(raw.endless);
  d.endless = { bestDistance: num(endless.bestDistance), bestScore: Math.round(num(endless.bestScore)), runs: Math.round(num(endless.runs)) };
  const stats = obj(raw.stats);
  d.stats = {
    runs: Math.round(num(stats.runs)),
    switches: Math.round(num(stats.switches)),
    jumps: Math.round(num(stats.jumps)),
    hits: Math.round(num(stats.hits)),
    distance: num(stats.distance),
    playSeconds: num(stats.playSeconds),
  };
  const ent = obj(raw.entitlements);
  d.entitlements = { removeAds: bool(ent.removeAds, false), cosmeticPacks: strings(ent.cosmeticPacks), bonusDaily: bool(ent.bonusDaily, false) };
  return d;
}

/**
 * Versioned local save in localStorage. Damaged JSON is kept as a backup and the game starts fresh
 * instead of crashing; storage that is unavailable (private mode) silently keeps data in memory.
 */
export class SaveManager {
  constructor(
    private readonly storage: StorageLike | null,
    private readonly key = STORAGE_KEY,
  ) {}

  load(): SaveData {
    let text: string | null;
    try {
      text = this.storage?.getItem(this.key) ?? null;
    } catch {
      return createDefaultSave();
    }
    if (!text) return createDefaultSave();
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      return sanitize(migrate(parsed as Record<string, unknown>));
    } catch {
      try {
        this.storage?.setItem(`${this.key}.corrupt`, text);
      } catch {
        /* ignore */
      }
      return createDefaultSave();
    }
  }

  save(data: SaveData): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify({ ...data, version: SAVE_VERSION }));
    } catch {
      /* storage full or unavailable – progress stays in memory */
    }
  }

  reset(): SaveData {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* ignore */
    }
    return createDefaultSave();
  }
}

export function browserStorage(): StorageLike | null {
  try {
    const probe = '__shadow_runner_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

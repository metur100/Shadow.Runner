import { GameContext } from '../GameContext';
import type { LevelDefinition } from '../levels/LevelDefinition';
import { buildEndlessLevel } from '../systems/EndlessGenerator';
import { recordEndlessResult } from '../systems/LevelManager';
import { RunSession } from '../systems/RunSession';
import { computeScore } from '../systems/ScoreSystem';
import { GameplayScene, type GameplayData } from './GameplayScene';
import type { ResultData } from './ResultScene';

/**
 * Endless mode: one life, a long generated run that keeps getting faster. The best distance is saved
 * locally. Unlocked after World 1; the campaign remains the main mode.
 */
export class EndlessScene extends GameplayScene {
  constructor() {
    super('Endless');
  }

  override init(_data: GameplayData): void {
    super.init({ mode: 'endless' });
  }

  protected override buildLevel(): LevelDefinition {
    const seed = (Date.now() % 1_000_000) + 1;
    return buildEndlessLevel(seed);
  }

  protected override createSession(level: LevelDefinition): RunSession {
    return new RunSession(level, { lives: 1, endless: true });
  }

  protected override finish(): void {
    const stats = this.session.stats();
    const score = computeScore(stats, { required: 0 });
    const failure = this.session.failure;
    const update = recordEndlessResult(GameContext.save, stats, score);
    GameContext.update(update.save);
    const data: ResultData = {
      mode: 'endless',
      levelIndex: -1,
      levelName: 'Endless Run',
      stats,
      score,
      required: 0,
      failReason: failure?.reason ?? null,
      failForm: failure?.form ?? null,
      failX: Math.round(this.session.x),
      newBest: update.newBest,
      unlockedLevel: null,
      unlockedWorld: null,
      newCosmetics: update.newCosmetics.map((c) => c.name),
      distance: Math.round(stats.distance / 10),
      bestDistance: update.save.endless.bestDistance,
    };
    this.go('Result', data);
  }

  protected override exit(): void {
    this.go('Menu');
  }
}

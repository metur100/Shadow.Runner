import { GameContext } from '../GameContext';
import { ensureCoreTextures } from '../rendering/TextureFactory';
import { BaseScene } from './BaseScene';

/** First scene: prepares the few textures the loading screen itself needs. */
export class BootScene extends BaseScene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.setupScene();
    ensureCoreTextures(this, GameContext.profile.renderScale);
    this.scene.start('Loading');
  }
}

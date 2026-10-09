/**
 * Integration points for future monetisation. Nothing here talks to a real ad network or store:
 * the default providers report "not available", and the game is fully playable without them.
 *
 * To integrate later (e.g. AdMob / Google Play Billing / StoreKit through a native bridge), implement
 * `AdProvider` and/or `PurchaseProvider` and pass them to `Monetization.configure()` at start-up.
 *
 * Products:
 *   remove-ads            one-time purchase, sets entitlements.removeAds
 *   pack-characters-<id>  cosmetic character packs (costumes + shadow forms)
 *   pack-trails-<id>      cosmetic trail packs
 *   bonus-daily           a second daily challenge each day (entitlements.bonusDaily)
 * Rewarded placements:
 *   rewarded-hint         optional extra hint on the failure screen – the game always offers a free hint
 */

export type ProductId = 'remove-ads' | 'bonus-daily' | `pack-characters-${string}` | `pack-trails-${string}`;
export type RewardedPlacement = 'rewarded-hint';

export interface AdProvider {
  isRewardedReady(placement: RewardedPlacement): boolean;
  /** Resolves true when the reward was earned. */
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
}

export interface PurchaseProvider {
  /** Resolves true when the purchase completed. */
  purchase(product: ProductId): Promise<boolean>;
  restore(): Promise<ProductId[]>;
}

export interface Entitlements {
  removeAds: boolean;
  cosmeticPacks: string[];
  bonusDaily: boolean;
}

/** Cosmetic packs that could be sold later. Purely visual. */
export const COSMETIC_PACKS = [
  { id: 'characters-carnival', name: 'Carnival Runners', description: 'Three festive costumes and matching shadow forms' },
  { id: 'trails-celestial', name: 'Celestial Trails', description: 'Comet, aurora and meteor trails' },
] as const;

const unavailableAds: AdProvider = {
  isRewardedReady: () => false,
  showRewarded: async () => false,
};

const unavailableStore: PurchaseProvider = {
  purchase: async () => false,
  restore: async () => [],
};

class MonetizationManager {
  private ads: AdProvider = unavailableAds;
  private store: PurchaseProvider = unavailableStore;

  configure(providers: { ads?: AdProvider; store?: PurchaseProvider }): void {
    if (providers.ads) this.ads = providers.ads;
    if (providers.store) this.store = providers.store;
  }

  /** Should a "watch for an extra hint" option be offered? */
  rewardedHintAvailable(entitlements: Entitlements): boolean {
    return !entitlements.removeAds && this.ads.isRewardedReady('rewarded-hint');
  }

  showRewardedHint(): Promise<boolean> {
    return this.ads.showRewarded('rewarded-hint');
  }

  /** Applies a completed purchase to the entitlements (returns a new object). */
  async purchase(product: ProductId, entitlements: Entitlements): Promise<Entitlements> {
    const ok = await this.store.purchase(product);
    return ok ? applyProduct(entitlements, product) : entitlements;
  }

  async restore(entitlements: Entitlements): Promise<Entitlements> {
    const products = await this.store.restore();
    return products.reduce(applyProduct, entitlements);
  }
}

export function applyProduct(entitlements: Entitlements, product: ProductId): Entitlements {
  if (product === 'remove-ads') return { ...entitlements, removeAds: true };
  if (product === 'bonus-daily') return { ...entitlements, bonusDaily: true };
  const pack = product.slice('pack-'.length);
  return entitlements.cosmeticPacks.includes(pack) ? entitlements : { ...entitlements, cosmeticPacks: [...entitlements.cosmeticPacks, pack] };
}

export const Monetization = new MonetizationManager();

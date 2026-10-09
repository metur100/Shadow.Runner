/**
 * Cosmetic unlockables. Purely visual – none of them changes gameplay. They unlock through play
 * (stars, collected coins and crystals, finished worlds, daily challenges, endless distance); the
 * monetisation hooks could later sell packs of them, but nothing here requires a purchase.
 */

export type CosmeticCategory = 'costume' | 'shadowForm' | 'trail' | 'transition' | 'portal';

export type Requirement =
  | { type: 'free' }
  | { type: 'stars'; count: number }
  | { type: 'coins'; count: number }
  | { type: 'crystals'; count: number }
  | { type: 'level'; id: string }
  | { type: 'dailyPlays'; count: number }
  | { type: 'endless'; distance: number };

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  requirement: Requirement;
  /** Main / secondary / glow colours used by the renderers. */
  colors: [number, number, number];
}

export const CATEGORY_LABELS: Record<CosmeticCategory, string> = {
  costume: 'Runner',
  shadowForm: 'Shadow',
  trail: 'Trails',
  transition: 'Switch FX',
  portal: 'Portals',
};

export const COSMETICS: CosmeticItem[] = [
  // Physical character costumes: hood, scarf, accent.
  { id: 'classic', category: 'costume', name: 'Daybreak', requirement: { type: 'free' }, colors: [0xff8a3d, 0x2ec4b6, 0xfff1d6] },
  { id: 'sunrise', category: 'costume', name: 'Sunrise', requirement: { type: 'stars', count: 6 }, colors: [0xffc83d, 0xff5d8f, 0xfff6dc] },
  { id: 'mint', category: 'costume', name: 'Mint Courier', requirement: { type: 'stars', count: 15 }, colors: [0x5fd3a8, 0x264b7a, 0xf1fff8] },
  { id: 'explorer', category: 'costume', name: 'Explorer', requirement: { type: 'coins', count: 400 }, colors: [0xc8a06a, 0xd9483b, 0xfff3e0] },
  { id: 'neon', category: 'costume', name: 'Neon Rider', requirement: { type: 'level', id: 'w3-5' }, colors: [0x2ee6ff, 0xff3db8, 0xeafcff] },
  { id: 'royal', category: 'costume', name: 'Royal Dawn', requirement: { type: 'stars', count: 45 }, colors: [0x8a5cff, 0xffc83d, 0xfff4d6] },
  { id: 'eclipsed', category: 'costume', name: 'Eclipsed', requirement: { type: 'level', id: 'w6-5' }, colors: [0x2a2540, 0xffb23d, 0xffe9b8] },
  // Shadow forms: body, edge glow, eyes.
  { id: 'wisp', category: 'shadowForm', name: 'Wisp', requirement: { type: 'free' }, colors: [0x2b1f5c, 0x9a7bff, 0x9fe8ff] },
  { id: 'frost', category: 'shadowForm', name: 'Frost', requirement: { type: 'stars', count: 24 }, colors: [0x1d2f5c, 0x7ec8ff, 0xffffff] },
  { id: 'ember', category: 'shadowForm', name: 'Ember', requirement: { type: 'crystals', count: 300 }, colors: [0x3a1424, 0xff6b4a, 0xffd36b] },
  { id: 'aurora', category: 'shadowForm', name: 'Aurora', requirement: { type: 'dailyPlays', count: 3 }, colors: [0x123a3a, 0x5cffc1, 0xd8fff1] },
  { id: 'void', category: 'shadowForm', name: 'Void', requirement: { type: 'stars', count: 70 }, colors: [0x08060f, 0xc44dff, 0xff4df0] },
  // Trails.
  { id: 'sparks', category: 'trail', name: 'Sparks', requirement: { type: 'free' }, colors: [0xffd36b, 0x9fe8ff, 0xffffff] },
  { id: 'ribbon', category: 'trail', name: 'Ribbon', requirement: { type: 'stars', count: 10 }, colors: [0xff8a3d, 0x9a7bff, 0xffffff] },
  { id: 'petals', category: 'trail', name: 'Petals', requirement: { type: 'level', id: 'w2-5' }, colors: [0xff9ec7, 0xc7a6ff, 0xffffff] },
  { id: 'stars', category: 'trail', name: 'Stardust', requirement: { type: 'stars', count: 30 }, colors: [0xffe680, 0xb7f4ff, 0xffffff] },
  { id: 'pixels', category: 'trail', name: 'Pixels', requirement: { type: 'endless', distance: 3000 }, colors: [0x5cffc1, 0xff4df0, 0xffffff] },
  // World-switch effects.
  { id: 'flash', category: 'transition', name: 'Flash', requirement: { type: 'free' }, colors: [0xffffff, 0x9fe8ff, 0xffd36b] },
  { id: 'ripple', category: 'transition', name: 'Ripple', requirement: { type: 'stars', count: 12 }, colors: [0x9fe8ff, 0x9a7bff, 0xffffff] },
  { id: 'shards', category: 'transition', name: 'Shards', requirement: { type: 'stars', count: 36 }, colors: [0xffd36b, 0xff8a3d, 0x9a7bff] },
  { id: 'ink', category: 'transition', name: 'Ink Splash', requirement: { type: 'crystals', count: 600 }, colors: [0x1d1838, 0x9a7bff, 0x5cffc1] },
  // Portal designs.
  { id: 'ring', category: 'portal', name: 'Ring', requirement: { type: 'free' }, colors: [0x9a7bff, 0xffd36b, 0xffffff] },
  { id: 'rune', category: 'portal', name: 'Rune Gate', requirement: { type: 'level', id: 'w4-5' }, colors: [0x2fb5a3, 0xffd36b, 0xffffff] },
  { id: 'prism', category: 'portal', name: 'Prism', requirement: { type: 'stars', count: 54 }, colors: [0xff5d8f, 0x2ee6ff, 0xffe680] },
  { id: 'blacksun', category: 'portal', name: 'Black Sun', requirement: { type: 'stars', count: 90 }, colors: [0x08060f, 0xffb23d, 0xffffff] },
];

export const DEFAULT_SELECTION: Record<CosmeticCategory, string> = {
  costume: 'classic',
  shadowForm: 'wisp',
  trail: 'sparks',
  transition: 'flash',
  portal: 'ring',
};

export function cosmetic(id: string): CosmeticItem | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export function cosmeticsIn(category: CosmeticCategory): CosmeticItem[] {
  return COSMETICS.filter((c) => c.category === category);
}

/** Colours of the selected item of a category (falls back to the default). */
export function selectedColors(selection: Record<CosmeticCategory, string>, category: CosmeticCategory): [number, number, number] {
  const item = cosmetic(selection[category]) ?? cosmetic(DEFAULT_SELECTION[category]);
  return item!.colors;
}

export function describeRequirement(req: Requirement, levelName: (id: string) => string): string {
  switch (req.type) {
    case 'free':
      return 'Unlocked';
    case 'stars':
      return `Earn ${req.count} stars`;
    case 'coins':
      return `Collect ${req.count} coins`;
    case 'crystals':
      return `Collect ${req.count} crystals`;
    case 'level':
      return `Finish “${levelName(req.id)}”`;
    case 'dailyPlays':
      return `Play ${req.count} daily challenges`;
    case 'endless':
      return `Run ${req.distance} m in endless`;
  }
}

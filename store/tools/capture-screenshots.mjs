/**
 * Captures raw in-game screenshots for every App Store / Google Play size from the exact HTML that ships
 * in the app (mobile/src/gameHtml.ts, opened with ?debug for the automation hooks).
 *
 *   npm run build:mobile && node store/tools/capture-screenshots.mjs [device-key]
 *
 * Gameplay shots are real runs: the auto-player plays the level up to the chosen moment, then the run is
 * frozen and captured. Output: store/screenshots/raw/<device>/NN-name.png at the store's pixel size.
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { DEVICES, ROOT } from './devices.mjs';

const BASE = 'https://shadowrunner.local/';
const src = fs.readFileSync(path.join(ROOT, 'mobile/src/gameHtml.ts'), 'utf8');
const html = JSON.parse(src.slice(src.indexOf('= "') + 2, src.lastIndexOf(';')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2];

/** A believable mid-game save: three worlds done, the fourth started, some cosmetics unlocked. */
function seedSave() {
  const stars = {
    'w1-1': 3, 'w1-2': 3, 'w1-3': 3, 'w1-4': 2, 'w1-5': 3,
    'w2-1': 3, 'w2-2': 2, 'w2-3': 3, 'w2-4': 3, 'w2-5': 3,
    'w3-1': 3, 'w3-2': 3, 'w3-3': 2, 'w3-4': 3, 'w3-5': 3,
    'w4-1': 2,
  };
  const levels = {};
  for (const [id, s] of Object.entries(stars)) {
    levels[id] = { completed: true, stars: s, bestScore: 5200 + s * 900 + (id.charCodeAt(1) % 7) * 130, bestTime: 52 + (id.charCodeAt(3) % 9) * 4, bestProgress: 1, plays: 2 };
  }
  levels['w4-2'] = { completed: false, stars: 0, bestScore: 0, bestTime: 0, bestProgress: 0.62, plays: 3 };
  return {
    version: 2,
    tutorialDone: true,
    levels,
    wallet: { coins: 1460, crystals: 1210 },
    unlockedWorlds: [0, 1, 2, 3],
    cosmetics: {
      unlocked: ['classic', 'wisp', 'sparks', 'flash', 'ring', 'sunrise', 'mint', 'explorer', 'neon', 'frost', 'ember', 'ribbon', 'petals', 'stars', 'ripple', 'shards', 'ink'],
      selected: { costume: 'classic', shadowForm: 'wisp', trail: 'stars', transition: 'ripple', portal: 'ring' },
    },
    settings: { sound: true, music: true, vibration: true, reducedMotion: false, leftHanded: false, highContrast: false },
    daily: { best: {}, plays: 4, lastDate: null },
    endless: { bestDistance: 2140, bestScore: 21900, runs: 6 },
    stats: { runs: 60, switches: 1900, jumps: 2400, hits: 30, distance: 1500000, playSeconds: 5400 },
    entitlements: { removeAds: false, cosmeticPacks: [], bonusDaily: false },
  };
}

async function waitScene(page, key, timeout = 20000) {
  await page.waitForFunction((k) => window.__SR__?.activeScenes().includes(k), key, { timeout, polling: 100 });
  await sleep(600);
}

/** Starts a campaign level and plays it with the auto-player until `x` (relative to an obstacle). */
async function playTo(page, index, pick) {
  await page.evaluate((i) => window.__SR__.start('Gameplay', { mode: 'campaign', index: i }), index);
  await waitScene(page, 'Gameplay');
  await page.evaluate(() => window.__SR__.hold(true));
  const info = await page.evaluate(() => window.__SR__.level());
  const x = pick(info);
  const ok = await page.evaluate((x) => window.__SR__.fastForward(x), x);
  if (!ok) throw new Error(`could not reach x=${x} in level ${index}`);
  // Let the intro banner fade and a few frames animate, then freeze for the shot.
  await page.evaluate(() => window.__SR__.hold(false));
  await sleep(120);
  await page.evaluate(() => window.__SR__.hold(true));
  await sleep(1700);
}

async function capture(browser, device) {
  const dir = path.join(ROOT, 'store/screenshots/raw', device.key);
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: device.css[0], height: device.css[1] },
    deviceScaleFactor: device.dpr,
    hasTouch: true,
    isMobile: true,
  });
  await context.route(`${BASE}**`, (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await context.addInitScript((data) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('shadow-runner/save', JSON.stringify(data));
      sessionStorage.setItem('seeded', '1');
    }
  }, seedSave());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?debug`);
  await waitScene(page, 'Menu');
  const shot = async (name) => {
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    process.stdout.write(` ${name}`);
  };

  // 1. The shadow phasing through a wall the physical self cannot pass (Two Worlds).
  await playTo(page, 1, (l) => l.obstacles.filter((o) => o.kind === 'wall' && o.h >= 200)[1].x - 40);
  await shot('01-switch-worlds');

  // 2. Light pours into the shadow world – the physical self runs safely above (Lights Out).
  await playTo(page, 2, (l) => l.obstacles.filter((o) => o.kind === 'lightZone')[1].x + 60);
  await shot('02-light');

  // 3. A lever above opened the gate below (Root Gate).
  await playTo(page, 5, (l) => l.obstacles.filter((o) => o.kind === 'gate')[1].x - 250);
  await shot('03-cross-world');

  // 4. Neon City: lasers and trains.
  await playTo(page, 10, (l) => l.obstacles.filter((o) => o.kind === 'laser')[2].x - 230);
  await shot('04-neon');

  // 5. The Eclipse: both worlds merge.
  await playTo(page, 26, (l) => l.obstacles.filter((o) => o.kind === 'spikes' && o.side === 'shadow')[1].x - 260);
  await shot('05-eclipse');

  // 6. Sunken Temple: light beams between the pillars.
  await playTo(page, 22, (l) => l.obstacles.filter((o) => o.kind === 'lightZone')[1].x - 120);
  await shot('06-temple');

  // 7. World select.
  await page.evaluate(() => window.__SR__.start('WorldSelect'));
  await waitScene(page, 'WorldSelect');
  await sleep(400);
  await shot('07-worlds');

  // 8. Collection.
  await page.evaluate(() => window.__SR__.start('Collection', { category: 'costume' }));
  await waitScene(page, 'Collection');
  await sleep(900);
  await shot('08-collection');

  await context.close();
  if (errors.length) throw new Error(`${device.key}: ${errors.join('; ')}`);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const device of DEVICES) {
    if (only && device.key !== only) continue;
    process.stdout.write(`${device.key} (${device.css[0] * device.dpr}×${device.css[1] * device.dpr}):`);
    await capture(browser, device);
    console.log();
  }
} finally {
  await browser.close();
}

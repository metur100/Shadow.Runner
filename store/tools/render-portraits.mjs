/**
 * Renders 3D portraits of the runner (physical and shadow form) from the game build, for the app icon
 * and store graphics. Output: store/graphics/src/runner-real.png and runner-shadow.png.
 *
 *   npm run build:mobile && node store/tools/render-portraits.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { ROOT } from './devices.mjs';

const BASE = 'https://shadowrunner.local/';
const src = fs.readFileSync(path.join(ROOT, 'mobile/src/gameHtml.ts'), 'utf8');
const html = JSON.parse(src.slice(src.indexOf('= "') + 2, src.lastIndexOf(';')));
const out = path.join(ROOT, 'store/graphics/src');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const context = await browser.newContext({ viewport: { width: 440, height: 956 } });
  await context.route(`${BASE}**`, (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await context.addInitScript(() => localStorage.setItem('shadow-runner/save', JSON.stringify({ version: 2, tutorialDone: true })));
  const page = await context.newPage();
  await page.goto(`${BASE}?debug`);
  await page.waitForFunction(() => window.__SR__?.activeScenes().includes('Menu'), null, { timeout: 60000 });
  const shots = [
    ['runner-real', 'real', [0xff6a2b, 0x2ec4b6, 0xfff1d6], 'run', 0.28],
    ['runner-shadow', 'shadow', [0x2b1f5c, 0x9a7bff, 0x9fe8ff], 'run', 0.28],
  ];
  for (const [name, side, colors, pose, time] of shots) {
    const url = await page.evaluate(([s, c, p, t]) => window.__SR__.portrait(s, c, p, t, 800, 1000), [side, colors, pose, time]);
    if (!url) throw new Error(`no portrait for ${name}`);
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`  store/graphics/src/${name}.png`);
  }
} finally {
  await browser.close();
}

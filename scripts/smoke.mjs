/**
 * Browser smoke test (Playwright + the locally installed Microsoft Edge or Chrome).
 *
 *   npm run dev            (or: npm run build && npm run preview, then pass the URL with ?debug)
 *   npm run smoke -- http://localhost:5173/
 *
 * Plays like a user with real pointer events: loading → interactive tutorial (taps and swipes) →
 * level 1 (switch, jump and slide checked live, then finished) → results → next level → reload
 * (progress must persist) → targeted mechanic checks (walls, shadow walls, light, cross-world lever,
 * portals) → pause on focus loss → settings → collection, worlds, levels, daily, endless → reset with
 * confirmation. Then loads all 30 levels and checks narrow phone, tablet and desktop layouts.
 * Fails on any console error and on any request to another host. Screenshots go to test-results/.
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const origin = new URL(url).origin;
const out = path.resolve('test-results');
fs.mkdirSync(out, { recursive: true });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withDebug = (u) => (u.includes('debug') ? u : `${u}${u.includes('?') ? '&' : '?'}debug`);

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try the next browser */
    }
  }
  throw new Error('Neither Microsoft Edge nor Google Chrome is installed.');
}

function step(name) {
  console.log(`\n▶ ${name}`);
}

function check(condition, message) {
  if (!condition) throw new Error(`Check failed: ${message}`);
  console.log(`  ✔ ${message}`);
}

async function waitFor(page, predicate, arg, timeout = 15000) {
  await page.waitForFunction(predicate, arg, { timeout, polling: 100 });
}

async function waitScene(page, key, timeout = 15000) {
  await waitFor(page, (k) => window.__SR__?.activeScenes().includes(k), key, timeout);
  await sleep(400);
}

async function click(page, label) {
  const list = await page.evaluate(() => window.__SR__.buttons());
  const hit = list.filter((b) => b.label === label).pop();
  if (!hit) throw new Error(`Button "${label}" not found. Visible: ${list.map((b) => b.label).join(', ')}`);
  await page.mouse.click(hit.x, hit.y);
  console.log(`  clicked "${label}"`);
  await sleep(300);
}

/** Point in design units → page pixels. */
async function pagePoint(page, x, y) {
  return page.evaluate(([x, y]) => window.__SR__.toPage(x, y), [x, y]);
}

/** Tap in the middle of the reality lane (never on a button). */
async function tapLane(page) {
  const layout = await page.evaluate(() => window.__SR__.layout());
  const p = await pagePoint(page, 420, layout.realTop + layout.laneH * 0.55);
  await page.mouse.click(p.x, p.y);
  await sleep(120);
}

async function swipe(page, dy) {
  const layout = await page.evaluate(() => window.__SR__.layout());
  const a = await pagePoint(page, 420, layout.shadowTop + layout.laneH * 0.5);
  const b = await pagePoint(page, 420, layout.shadowTop + layout.laneH * 0.5 + dy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(a.x, a.y + ((b.y - a.y) * i) / 6);
    await sleep(12);
  }
  await page.mouse.up();
  await sleep(60);
}

const run = (page) => page.evaluate(() => window.__SR__.run());

async function newPage(browser, viewport, opts = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr ?? 2, hasTouch: opts.touch ?? true, isMobile: opts.mobile ?? false });
  // No network access during play: anything that is not the dev server fails the test.
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    errors.push(`external request: ${u}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return page;
}

/** Starts a level and fast-forwards (auto-player) to just before `x` with the run frozen. */
async function levelAt(page, index, x) {
  await page.evaluate((i) => window.__SR__.start('Gameplay', { mode: 'campaign', index: i }), index);
  await waitScene(page, 'Gameplay');
  await page.evaluate(() => window.__SR__.hold(true));
  const ok = await page.evaluate((x) => window.__SR__.fastForward(x), x);
  if (!ok) throw new Error(`fast-forward failed in level ${index}`);
}

const browser = await launch();
try {
  const page = await newPage(browser, { width: 400, height: 860 });

  step('First launch: loading screen → interactive tutorial');
  await page.goto(withDebug(url));
  await waitScene(page, 'Tutorial', 20000);
  await page.screenshot({ path: path.join(out, '01-tutorial.png') });
  const prompts = [
    ['tap', 'This is you'],
    ['tap', 'your shadow'],
    ['tap', 'switch to shadow'],
    ['tap', 'switch to reality'],
    ['up', 'jump'],
    ['down', 'slide'],
    ['tap', 'lever info'],
    ['tap', 'switch through the gate'],
    ['tap', 'final'],
  ];
  for (const [action, name] of prompts) {
    // Wait until the run is frozen on the next prompt.
    let last = -1;
    for (let i = 0; i < 80; i++) {
      const r = await run(page);
      if (Math.abs(r.x - last) < 0.01 && r.state === 'running' && r.x > 100) break;
      last = r.x;
      await sleep(150);
    }
    await sleep(250);
    if (action === 'tap') await tapLane(page);
    else await swipe(page, action === 'up' ? -170 : 170);
    console.log(`  prompt "${name}" → ${action}`);
    await sleep(350);
  }
  await waitScene(page, 'Result', 40000);
  let save = await page.evaluate(() => window.__SR__.save());
  check(save.tutorialDone === true, 'tutorial completed and saved');
  await page.screenshot({ path: path.join(out, '02-tutorial-result.png') });
  await click(page, 'Start World 1');

  step('Level 1: physical and shadow forms run, switching, jumping and sliding');
  await waitScene(page, 'Gameplay');
  await sleep(1800);
  let r = await run(page);
  check(r.levelId === 'w1-1' && r.state === 'running' && r.x > 0, `level 1 is running (x = ${Math.round(r.x)})`);
  const x0 = r.x;
  await sleep(400);
  r = await run(page);
  check(r.x > x0 + 50, 'both forms run forward automatically');
  await tapLane(page);
  r = await run(page);
  check(r.active === 'shadow', 'a tap switches to the shadow form');
  await sleep(350);
  await click(page, 'Switch');
  r = await run(page);
  check(r.active === 'real', 'the switch button switches back');
  await swipe(page, -180);
  await sleep(150);
  r = await run(page);
  check(r.physicalH > 20, `swipe up jumps (height ${Math.round(r.physicalH)})`);
  await sleep(700);
  await swipe(page, 170);
  await sleep(50);
  r = await run(page);
  check(r.sliding === true, 'swipe down slides');
  await page.keyboard.press('Space');
  await sleep(120);
  r = await run(page);
  check(r.physicalH > 10, 'Space jumps');
  await page.screenshot({ path: path.join(out, '03-level1.png') });

  step('Finish level 1 → results → next level');
  await page.evaluate(() => window.__SR__.hold(true));
  const length = (await run(page)).length;
  check(await page.evaluate((x) => window.__SR__.fastForward(x), length - 250), 'auto-player reaches the end without damage');
  await page.evaluate(() => window.__SR__.hold(false));
  await waitScene(page, 'Result', 20000);
  await sleep(1500);
  await page.screenshot({ path: path.join(out, '04-result.png') });
  save = await page.evaluate(() => window.__SR__.save());
  check(save.levels['w1-1']?.completed === true && save.levels['w1-1'].stars >= 1, `level 1 completed with ${save.levels['w1-1'].stars} star(s)`);
  await click(page, 'Next level');
  await waitScene(page, 'Gameplay');
  r = await run(page);
  check(r.levelId === 'w1-2', 'Next level opens level 2');

  step('Reload keeps progress');
  await page.reload();
  await waitScene(page, 'Menu', 20000);
  save = await page.evaluate(() => window.__SR__.save());
  check(save.levels['w1-1']?.completed === true, 'progress survives a reload');
  await page.screenshot({ path: path.join(out, '05-menu.png') });

  step('Physical walls and shadow walls');
  const wallLevel = 1;
  await levelAt(page, wallLevel, 0);
  let info = await page.evaluate(() => window.__SR__.level());
  const wall = info.obstacles.find((o) => o.kind === 'wall' && o.side === 'real' && o.h >= 200);
  await levelAt(page, wallLevel, wall.x - 160);
  await page.evaluate(() => window.__SR__.setForm('real'));
  await page.evaluate(() => window.__SR__.hold(false));
  await waitFor(page, () => window.__SR__.run().state !== 'running', null, 8000);
  r = await run(page);
  check(r.failure?.reason === 'wall' && r.failure.form === 'real', 'the physical form crashes into a tall wall');
  await levelAt(page, wallLevel, wall.x - 160);
  await page.evaluate(() => window.__SR__.setForm('shadow'));
  await page.evaluate(() => window.__SR__.hold(false));
  await waitFor(page, (x) => window.__SR__.run().x > x, wall.x + 200, 8000);
  r = await run(page);
  check(r.damage === 0, 'the shadow passes through the shadow wall');

  step('Light zones damage the shadow');
  await levelAt(page, 2, 0);
  info = await page.evaluate(() => window.__SR__.level());
  const light = info.obstacles.find((o) => o.kind === 'lightZone');
  await levelAt(page, 2, light.x - 160);
  await page.evaluate(() => window.__SR__.setForm('shadow'));
  await page.evaluate(() => window.__SR__.hold(false));
  await waitFor(page, () => window.__SR__.run().state !== 'running', null, 8000);
  await page.screenshot({ path: path.join(out, '06-light-hit.png') });
  r = await run(page);
  check(r.failure?.reason === 'light' && r.failure.form === 'shadow', 'the light destroys the shadow');

  step('Cross-world lever opens the shadow gate');
  await levelAt(page, 5, 0);
  info = await page.evaluate(() => window.__SR__.level());
  const lever = info.switches.find((s) => s.kind === 'lever');
  await levelAt(page, 5, lever.x + 200);
  info = await page.evaluate(() => window.__SR__.level());
  r = await run(page);
  const gate = info.obstacles.find((o) => o.kind === 'gate');
  check(r.switchesOn[0] === 1 && gate.open === true, 'the lever above opened the gate below');
  await page.screenshot({ path: path.join(out, '07-lever.png') });

  step('Portals swap the form');
  await levelAt(page, 23, 0);
  info = await page.evaluate(() => window.__SR__.level());
  const portal = info.portals.find((p) => p.kind === 'phase');
  await levelAt(page, 23, portal.x + 60);
  r = await run(page);
  check(r.portalsUsed.some((u) => u === 1) && r.active !== portal.side, `the portal moved the runner to the ${r.active} form`);

  step('Pause when the window loses focus');
  await page.evaluate(() => window.__SR__.hold(false));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(300);
  r = await run(page);
  check(r.paused === true, 'the run pauses on blur');
  await page.screenshot({ path: path.join(out, '08-pause.png') });
  await click(page, 'Resume');
  r = await run(page);
  check(r.paused === false, 'Resume continues the run');

  step('Settings');
  await page.evaluate(() => window.__SR__.start('Settings', { from: 'Menu' }));
  await waitScene(page, 'Settings');
  for (const label of ['Sound effects', 'Music', 'Vibration', 'Reduced motion', 'Left-handed mode', 'High contrast']) await click(page, label);
  save = await page.evaluate(() => window.__SR__.save());
  check(!save.settings.sound && !save.settings.music && !save.settings.vibration && save.settings.reducedMotion && save.settings.leftHanded && save.settings.highContrast, 'every toggle changes its setting');
  await page.screenshot({ path: path.join(out, '09-settings.png') });
  await levelAt(page, 0, 1200);
  await page.evaluate(() => window.__SR__.hold(false));
  await sleep(600);
  await page.screenshot({ path: path.join(out, '10-high-contrast.png') });
  r = await run(page);
  check(r.state === 'running', 'the game runs with sound, music and vibration off');
  await page.evaluate(() => window.__SR__.start('Settings', { from: 'Menu' }));
  await waitScene(page, 'Settings');
  for (const label of ['Sound effects', 'Music', 'Vibration', 'Reduced motion', 'Left-handed mode', 'High contrast']) await click(page, label);

  step('Menus: worlds, levels, collection, daily, endless');
  await click(page, 'back');
  await waitScene(page, 'Menu');
  await click(page, 'Worlds');
  await waitScene(page, 'WorldSelect');
  await click(page, 'World 1 First Light');
  await waitScene(page, 'LevelSelect');
  await page.screenshot({ path: path.join(out, '11-levels.png') });
  await click(page, 'Level 2 Two Worlds');
  await waitScene(page, 'Gameplay');
  await click(page, 'Pause');
  await click(page, 'Exit to levels');
  await waitScene(page, 'LevelSelect');
  await click(page, 'back');
  await waitScene(page, 'WorldSelect');
  await click(page, 'back');
  await waitScene(page, 'Menu');
  await click(page, 'Collection');
  await waitScene(page, 'Collection');
  await click(page, 'Shadow');
  await sleep(400);
  await page.screenshot({ path: path.join(out, '12-collection.png') });
  await click(page, 'back');
  await waitScene(page, 'Menu');
  await click(page, 'Daily');
  await waitScene(page, 'Gameplay');
  r = await run(page);
  check(r.levelId.startsWith('daily-'), `daily challenge ${r.levelId} starts`);
  await page.evaluate(() => window.__SR__.start('Endless'));
  await waitScene(page, 'Endless');
  await sleep(1800);
  r = await run(page);
  check(r.state === 'running' && r.lives === 1, 'endless mode runs with one life');

  step('Reset progress with confirmation');
  await page.evaluate(() => window.__SR__.start('Settings', { from: 'Menu' }));
  await waitScene(page, 'Settings');
  await click(page, 'Reset progress');
  await click(page, 'Cancel');
  save = await page.evaluate(() => window.__SR__.save());
  check(save.levels['w1-1']?.completed === true, 'Cancel keeps progress');
  await click(page, 'Reset progress');
  await click(page, 'Delete my progress');
  save = await page.evaluate(() => window.__SR__.save());
  check(Object.keys(save.levels).length === 0, 'confirmed reset deletes progress');

  step('All 30 levels load and run');
  for (let i = 0; i < 30; i++) {
    await page.evaluate((i) => window.__SR__.start('Gameplay', { mode: 'campaign', index: i }), i);
    await waitFor(page, (i) => window.__SR__.run()?.levelId === `w${Math.floor(i / 5) + 1}-${(i % 5) + 1}`, i, 10000);
    await sleep(1900);
    r = await run(page);
    if (r.state !== 'running' && r.state !== 'hit') throw new Error(`level ${i + 1} not running: ${r.state}`);
  }
  check(true, '30 levels loaded');
  await page.context().close();

  step('Layouts: small phones, tablet and desktop');
  for (const [w, h, name, opts] of [
    [320, 568, 'phone-320', { dpr: 2 }],
    [360, 640, 'phone-360', { dpr: 3 }],
    [800, 1280, 'tablet', { dpr: 2 }],
    [1366, 768, 'desktop', { dpr: 1, touch: false }],
  ]) {
    const p = await newPage(browser, { width: w, height: h }, opts);
    await p.goto(withDebug(url));
    await waitScene(p, 'Tutorial', 20000);
    await p.evaluate(() => window.__SR__.start('Menu'));
    await waitScene(p, 'Menu');
    await p.screenshot({ path: path.join(out, `20-${name}-menu.png`) });
    await p.evaluate(() => window.__SR__.start('Gameplay', { mode: 'campaign', index: 7 }));
    await waitScene(p, 'Gameplay');
    await p.evaluate(() => window.__SR__.hold(true));
    await p.evaluate(() => window.__SR__.fastForward(2200));
    await sleep(500);
    await p.screenshot({ path: path.join(out, `21-${name}-game.png`) });
    const rect = await p.evaluate(() => {
      const c = document.querySelector('canvas').getBoundingClientRect();
      return { w: c.width, h: c.height, left: c.left, top: c.top };
    });
    if (rect.left < -1 || rect.top < -1 || rect.w > w + 1 || rect.h > h + 1) throw new Error(`${name}: canvas does not fit the window`);
    console.log(`  ✔ ${name}: canvas ${Math.round(rect.w)}×${Math.round(rect.h)} fits ${w}×${h}`);
    await p.context().close();
  }
} catch (e) {
  console.error(`\n✘ ${e.message}`);
  errors.push(e.message);
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error('\nErrors:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('\nSmoke test passed.');

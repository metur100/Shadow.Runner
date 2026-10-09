/**
 * Renders app icons, splash image and store graphics from the game's logo (public/icon.svg design),
 * and composes captioned store screenshots from the raw captures.
 *
 *   node store/tools/capture-screenshots.mjs   (first)
 *   node store/tools/render-graphics.mjs       (add "graphics" to skip the screenshots)
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { DEVICES, ROOT } from './devices.mjs';

const font = (weight) =>
  fs.readFileSync(path.join(ROOT, `node_modules/@fontsource/fredoka/files/fredoka-latin-${weight}-normal.woff2`)).toString('base64');
const FONTS = `
@font-face { font-family: Fredoka; font-weight: 600; src: url(data:font/woff2;base64,${font(600)}) format('woff2'); }
@font-face { font-family: Fredoka; font-weight: 700; src: url(data:font/woff2;base64,${font(700)}) format('woff2'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; font-family: Fredoka, sans-serif; }`;

const png = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

// ── Logo pieces (512 × 512 design space, same as public/icon.svg) ─────────────────────────────
const DEFS = `
  <linearGradient id="day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd4f5"/><stop offset="1" stop-color="#ffcf8f"/></linearGradient>
  <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1b5c"/><stop offset="1" stop-color="#0b0822"/></linearGradient>`;
const BACKDROP = `<rect width="512" height="256" fill="url(#day)"/><rect y="256" width="512" height="256" fill="url(#night)"/>
  <rect y="246" width="512" height="20" fill="#9fe8ff" opacity="0.5"/><rect y="252" width="512" height="8" fill="#ffffff"/>`;
const runner = (mono = false) => `
  <g transform="translate(256 250)">
    <path d="M-36 -8 L-58 -34 M14 -6 L32 -36" stroke="${mono ? '#fff' : '#5a3a2e'}" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="0" cy="-70" rx="36" ry="46" fill="${mono ? '#fff' : '#ff8a3d'}"/>
    <circle cx="10" cy="-132" r="38" fill="${mono ? '#fff' : '#e9b08a'}"/>
    <path d="M-30 -118 L-80 -146 L-36 -158 L-70 -196 L-16 -178 L-22 -218 L12 -180 L34 -208 L40 -170 L52 -156 L22 -152 L0 -142 L-10 -112 Z" fill="${mono ? '#fff' : '#1f1a2e'}"/>
    ${mono ? '' : '<ellipse cx="34" cy="-128" rx="5" ry="9" fill="#1d1838"/><path d="M30 -106 L42 -108" stroke="#1d1838" stroke-width="4" stroke-linecap="round"/><path d="M-8 -78 L8 -50 L-2 -52 L6 -30" stroke="#fff" stroke-width="6" fill="none" stroke-linejoin="round"/>'}
    <path d="M-24 -100 Q-80 -110 -120 -88" stroke="${mono ? '#fff' : '#2ec4b6'}" stroke-width="16" fill="none" stroke-linecap="round"/>
  </g>
  <g transform="translate(256 262) scale(1 -1)">
    <path d="M-36 -8 L-58 -34 M14 -6 L32 -36" stroke="${mono ? '#fff' : '#3b2a80'}" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="0" cy="-70" rx="36" ry="46" fill="${mono ? '#fff' : '#3b2a80'}" stroke="${mono ? '#fff' : '#9a7bff'}" stroke-width="5"/>
    <circle cx="10" cy="-132" r="38" fill="${mono ? '#fff' : '#4a3699'}" stroke="${mono ? '#fff' : '#9a7bff'}" stroke-width="5"/>
    <path d="M-30 -118 L-80 -146 L-36 -158 L-70 -196 L-16 -178 L-22 -218 L12 -180 L34 -208 L40 -170 L52 -156 L22 -152 L0 -142 L-10 -112 Z" fill="${mono ? '#fff' : '#241a55'}" stroke="${mono ? '#fff' : '#9a7bff'}" stroke-width="3" stroke-linejoin="round"/>
    ${mono ? '' : '<ellipse cx="34" cy="-128" rx="7" ry="10" fill="#9fe8ff"/>'}
  </g>`;
/**
 * The runner from the 3D game (store/tools/render-portraits.mjs): the physical form above the seam
 * (head to knees) and the shadow form mirrored below it with a violet glow.
 */
const PORTRAIT_REAL = path.join(ROOT, 'store/graphics/src/runner-real.png');
const PORTRAIT_SHADOW = path.join(ROOT, 'store/graphics/src/runner-shadow.png');
const has3d = fs.existsSync(PORTRAIT_REAL) && fs.existsSync(PORTRAIT_SHADOW);
const portraitRunner = (mono = false) => {
  const real = png(PORTRAIT_REAL);
  const shade = png(PORTRAIT_SHADOW);
  const h = 450;
  const w = h * 0.8;
  const x = 256 - w / 2 + 6;
  const y = 6;
  const filterReal = mono ? 'url(#mono)' : 'url(#lift)';
  const filterShade = mono ? 'url(#mono)' : 'url(#violet)';
  return `
  <defs>
    <clipPath id="top"><rect width="512" height="250"/></clipPath>
    <clipPath id="bottom"><rect y="262" width="512" height="250"/></clipPath>
    <filter id="mono"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#1d1838" flood-opacity="0.45"/></filter>
    <filter id="violet" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#9a7bff" flood-opacity="0.95"/></filter>
  </defs>
  <g clip-path="url(#top)"><image href="${real}" x="${x}" y="${y}" width="${w}" height="${h}" filter="${filterReal}"/></g>
  <g clip-path="url(#bottom)"><g transform="translate(0 512) scale(1 -1)"><image href="${shade}" x="${x}" y="${y}" width="${w}" height="${h}" filter="${filterShade}" opacity="${mono ? 1 : 0.95}"/></g></g>`;
};
const ICON_GLOW = `<radialGradient id="sunglow" cx="0.72" cy="0.18" r="0.5"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>
  <radialGradient id="moonglow" cx="0.5" cy="0.62" r="0.5"><stop offset="0" stop-color="#9a7bff" stop-opacity="0.55"/><stop offset="1" stop-color="#9a7bff" stop-opacity="0"/></radialGradient>`;
const ICON_BACK = `${BACKDROP}<rect width="512" height="256" fill="url(#sunglow)"/><rect y="256" width="512" height="256" fill="url(#moonglow)"/>`;
const figure = (mono = false) => (has3d ? portraitRunner(mono) : runner(mono));

/** Full-bleed square icon (stores and iOS apply their own corner mask). */
const squareIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${DEFS}${ICON_GLOW}</defs>${ICON_BACK}${figure()}</svg>`;
const roundedIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${DEFS}${ICON_GLOW}<clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath></defs><g clip-path="url(#r)">${ICON_BACK}${figure()}</g></svg>`;
/** Android adaptive icon layers: characters kept inside the 66 % safe zone. */
const adaptiveView = 'viewBox="-110 -110 732 732"';
const adaptiveForeground = `<svg xmlns="http://www.w3.org/2000/svg" ${adaptiveView}>${figure()}</svg>`;
const adaptiveMonochrome = `<svg xmlns="http://www.w3.org/2000/svg" ${adaptiveView}>${figure(true)}</svg>`;
const adaptiveBackground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${DEFS}</defs>${BACKDROP}</svg>`;

const svgPage = (svg, bg = 'transparent') => `<style>${FONTS} body{background:${bg}} svg{display:block;width:100%;height:100%}</style>${svg}`;

// ── Captioned screenshots ─────────────────────────────────────────────────────────────────────
const SHOTS = {
  '01-switch-worlds': { title: 'One tap. Two worlds.', sub: 'Your shadow runs through walls you cannot' },
  '02-light': { title: 'Light destroys shadows', sub: 'Switch back just in time' },
  '03-cross-world': { title: 'Change the other world', sub: 'Levers above open gates below' },
  '04-neon': { title: 'Lasers, trains & neon', sub: 'Six worlds, 30 handcrafted levels' },
  '05-eclipse': { title: 'When the worlds merge', sub: 'Jump in both worlds at once' },
  '06-temple': { title: 'Ancient temples, deep water', sub: 'Light beams, portals and keys' },
  '07-worlds': { title: 'Earn all 90 stars', sub: 'Daily challenge and endless mode' },
  '08-collection': { title: 'Unlock new looks', sub: 'Runners, shadows, trails and portals' },
};

function captionPage(device, name, file) {
  const s = SHOTS[name];
  const [W, H] = [device.css[0], device.css[1]];
  const wide = W / H > 0.7;
  const titleSize = Math.round(W * (wide ? 0.06 : 0.083));
  const subSize = Math.round(titleSize * 0.52);
  return `<style>${FONTS}
    body { width:${W}px; height:${H}px; color:#fff8ec; display:flex; flex-direction:column; align-items:center;
      background: linear-gradient(180deg, #ff9f6b 0%, #b0569c 34%, #2a1b5c 62%, #0b0822 100%); }
    header { height:${Math.round(H * 0.17)}px; display:flex; flex-direction:column; justify-content:center; align-items:center;
      text-align:center; padding: 0 ${Math.round(W * 0.06)}px; gap:${Math.round(H * 0.008)}px; }
    h1 { font-weight:700; font-size:${titleSize}px; line-height:1.08; text-shadow: 0 3px 0 rgba(29,24,56,0.35); }
    p { font-weight:600; font-size:${subSize}px; opacity:0.9; }
    .frame { flex:1; width:100%; display:flex; justify-content:center; align-items:flex-start; padding-bottom:${Math.round(H * 0.035)}px; min-height:0; }
    img { height:100%; max-width:${Math.round(W * 0.9)}px; object-fit:contain; border-radius:${Math.round(W * (wide ? 0.025 : 0.06))}px;
      box-shadow: 0 ${Math.round(H * 0.012)}px ${Math.round(H * 0.04)}px rgba(5, 3, 15, 0.55); border: ${Math.max(3, Math.round(W * 0.012))}px solid rgba(255,248,236,0.9); }
  </style>
  <header><h1>${s.title}</h1><p>${s.sub}</p></header>
  <div class="frame"><img src="${png(file)}"></div>`;
}

const BG = `background: linear-gradient(180deg, #ffb27a 0%, #c46aa0 45%, #2a1b5c 50%, #0b0822 100%);`;

// ── Feature graphic (Google Play, 1024 × 500) ─────────────────────────────────────────────────
function featureGraphic() {
  const shot = (n) => png(path.join(ROOT, 'store/screenshots/raw/android-phone', `${n}.png`));
  return `<style>${FONTS}
    body { width:1024px; height:500px; ${BG} position:relative; color:#fff8ec; }
    .seam { position:absolute; left:0; right:0; top:246px; height:8px; background:#fff; box-shadow: 0 0 24px 8px rgba(159,232,255,0.7); }
    .icon { position:absolute; left:64px; top:54px; width:132px; height:132px; filter: drop-shadow(0 10px 20px rgba(20,10,40,0.4)); }
    h1 { position:absolute; left:60px; top:196px; font-size:84px; font-weight:700; font-style:italic; line-height:0.92; letter-spacing:1px; color:#fff; -webkit-text-stroke: 3px #0b0822; paint-order: stroke fill; text-shadow: 0 5px 0 rgba(11,8,34,0.55); }
    h1 span { display:block; margin-left:26px; background: linear-gradient(180deg, #9fc2ff, #4f7dff 50%, #3a4fe0); -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-stroke: 0; filter: drop-shadow(0 4px 0 rgba(11,8,34,0.6)); }
    p { position:absolute; left:68px; top:400px; font-size:26px; font-weight:600; opacity:0.92; }
    .phone { position:absolute; width:206px; height:366px; border-radius:30px; border:7px solid #fff8ec; overflow:hidden;
      box-shadow: 0 18px 40px rgba(5,3,15,0.5); background-size:cover; background-position:center top; }
    .a { left:560px; top:96px; transform: rotate(-7deg); background-image:url(${shot('01-switch-worlds')}); }
    .b { left:770px; top:52px; transform: rotate(6deg); background-image:url(${shot('05-eclipse')}); }
  </style>
  <div class="seam"></div>
  <div class="icon">${roundedIcon}</div>
  <h1>SHADOW<span>RUNNER</span></h1>
  <p>Switch realities. Master both worlds.</p>
  <div class="phone a"></div><div class="phone b"></div>`;
}

// ── Header image (Google Play, 5244 × 2950 and 3840 × 1646). Rendered at half size, 2× scale. ──
function headerImage(W, H) {
  const shot = (n) => png(path.join(ROOT, 'store/screenshots/raw/ios-iphone-6.9', `${n}.png`));
  const right = Math.round(W * 0.5);
  const span = W * 0.94 - right;
  const pw = Math.round(Math.min((H * 0.74 * 1320) / 2868, span / (1 + 3 * 0.72)));
  const ph = Math.round((pw * 2868) / 1320);
  const step = (span - pw) / 3;
  const phones = ['01-switch-worlds', '02-light', '05-eclipse', '04-neon']
    .map((n, i) => {
      const x = right + i * step;
      const lift = [0.06, -0.02, 0.1, 0.02][i] * H;
      const rot = [-8, -2, 4, 9][i];
      return `<div class="phone" style="left:${x}px; top:${(H - ph) / 2 + lift}px; transform:rotate(${rot}deg); z-index:${i}; background-image:url(${shot(n)})"></div>`;
    })
    .join('');
  const title = Math.round(Math.min(H * 0.17, W * 0.08));
  return `<style>${FONTS}
    body { width:${W}px; height:${H}px; position:relative; color:#fff8ec; ${BG} }
    .seam { position:absolute; left:0; right:0; top:${H / 2 - 4}px; height:8px; background:#fff; box-shadow: 0 0 ${H * 0.03}px ${H * 0.01}px rgba(159,232,255,0.7); }
    .text { position:absolute; left:${Math.round(W * 0.08)}px; top:50%; transform:translateY(-50%); }
    .icon { width:${Math.round(H * 0.2)}px; height:${Math.round(H * 0.2)}px; margin-bottom:${Math.round(H * 0.04)}px; filter: drop-shadow(0 ${H * 0.02}px ${H * 0.04}px rgba(5,3,15,0.4)); }
    .icon svg { width:100%; height:100%; display:block; }
    h1 { font-size:${title}px; font-weight:700; font-style:italic; line-height:0.95; color:#fff; -webkit-text-stroke: ${Math.round(title * 0.035)}px #0b0822; paint-order: stroke fill; text-shadow: 0 ${H * 0.006}px 0 rgba(11,8,34,0.5); }
    h1 span { display:block; margin-left:${Math.round(title * 0.3)}px; background: linear-gradient(180deg, #9fc2ff, #4f7dff 50%, #3a4fe0); -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-stroke: 0; filter: drop-shadow(0 ${Math.round(H * 0.005)}px 0 rgba(11,8,34,0.6)); }
    p { margin-top:${Math.round(H * 0.045)}px; font-size:${Math.round(title * 0.3)}px; font-weight:600; opacity:0.9; }
    .phone { position:absolute; width:${pw}px; height:${ph}px; border-radius:${Math.round(pw * 0.13)}px; border:${Math.max(4, Math.round(pw * 0.035))}px solid #fff8ec;
      background-size:cover; background-position:center top; box-shadow: 0 ${H * 0.03}px ${H * 0.07}px rgba(5,3,15,0.5); }
  </style>
  <div class="seam"></div>
  <div class="text"><div class="icon">${roundedIcon}</div><h1>SHADOW<span>RUNNER</span></h1><p>Switch realities. Master both worlds.</p></div>
  ${phones}`;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const render = async (html, file, w, h, { transparent = false, scale = 1 } = {}) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: transparent });
  await page.close();
  console.log(`  ${path.relative(ROOT, file)}`);
};

try {
  const assets = path.join(ROOT, 'mobile/assets');
  const graphics = path.join(ROOT, 'store/graphics');
  console.log('App icons & splash');
  await render(svgPage(squareIcon), path.join(assets, 'icon.png'), 1024, 1024);
  await render(svgPage(adaptiveForeground), path.join(assets, 'android-icon-foreground.png'), 1024, 1024, { transparent: true });
  await render(svgPage(adaptiveBackground), path.join(assets, 'android-icon-background.png'), 1024, 1024);
  await render(svgPage(adaptiveMonochrome), path.join(assets, 'android-icon-monochrome.png'), 1024, 1024, { transparent: true });
  await render(svgPage(roundedIcon), path.join(assets, 'splash-icon.png'), 1024, 1024, { transparent: true });
  await render(svgPage(roundedIcon), path.join(assets, 'favicon.png'), 48, 48, { transparent: true });

  console.log('Store graphics');
  await render(svgPage(squareIcon), path.join(graphics, 'app-store-icon-1024.png'), 1024, 1024);
  await render(svgPage(squareIcon), path.join(graphics, 'play-store-icon-512.png'), 512, 512);
  await render(featureGraphic(), path.join(graphics, 'play-feature-graphic-1024x500.png'), 1024, 500);
  await render(headerImage(2622, 1475), path.join(graphics, 'play-header-5244x2950.png'), 2622, 1475, { scale: 2 });
  await render(headerImage(1920, 823), path.join(graphics, 'play-header-3840x1646.png'), 1920, 823, { scale: 2 });
  if (process.argv[2] === 'graphics') process.exit(0);

  console.log('Captioned screenshots');
  for (const device of DEVICES) {
    for (const name of Object.keys(SHOTS)) {
      const raw = path.join(ROOT, 'store/screenshots/raw', device.key, `${name}.png`);
      const out = path.join(ROOT, 'store/screenshots', device.key, `${name}.png`);
      await render(captionPage(device, name, raw), out, device.css[0], device.css[1], { scale: device.dpr });
    }
  }
} finally {
  await browser.close();
}

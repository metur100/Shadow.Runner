# Twinshade

A mobile-first runner and puzzle game about **two worlds at once**. Your physical self runs through a bright reality world in the top half of the screen, and your shadow runs through a dark shadow world in the bottom half. Tap to choose which one is real.

- Walls stop your physical self, but the shadow phases through them.
- Light destroys the shadow, but your physical self runs safely beneath it.
- What you do in one world changes the other.

Made by **Medin Turkes**. Built with TypeScript, Vite, three.js (3D worlds) and Phaser 3 (HUD and menus). There is no backend, no account and no network access during play; the 3D models are bundled and the sounds are generated in code.

---

## Run it

Requires **Node.js 20+** (tested with Node 22) and npm.

```bash
npm install            # once
npm run dev            # dev server → http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm run build          # type-check + production build → dist/
npm run preview        # serve dist/ → http://localhost:4173
npm run test           # unit tests (Vitest)
npm run lint           # ESLint
```

Quality tools:

```bash
npm run verify:levels                              # the auto-player finishes every level without damage
npm run smoke -- http://localhost:5173/            # browser smoke test (needs the dev server and Edge or Chrome)
npm run smoke -- "http://localhost:4173/?debug"    # same against the production build
```

### What the smoke test covers

It plays like a user, with real pointer events:

- loading screen and the interactive tutorial (taps and swipes)
- level 1: both forms run, tapping and the switch button change form, swipes jump and slide, Space jumps
- finishing the level, the results screen and Next level
- reloading the page: progress must be kept
- targeted checks: the physical self crashes into walls, the shadow passes through shadow walls, light destroys the shadow, a lever opens a gate in the other world, a portal swaps the form
- pause when the window loses focus
- every settings toggle; running with sound, music and vibration off
- world select, level select, collection, daily challenge and endless mode
- reset progress, with both Cancel and confirm
- loading all 30 levels
- 320 px, 360 px, tablet and desktop layouts

It fails on any console error and on any request to another host. Screenshots go to `test-results/`.

## Controls

| Input | Action |
| --- | --- |
| Tap anywhere / switch button | Switch between the physical form and the shadow |
| Tap the character | Use a switch within reach (otherwise switch form) |
| Swipe up | Jump. A longer swipe jumps higher |
| Swipe down | Slide; in the air, drop quickly |
| On-screen Jump / Slide buttons | Same as the swipes; left-handed mode moves them to the left |
| Space / ↑ / W | Jump; hold for a higher jump |
| ↓ / S | Slide |
| Tab / Shift / X | Switch form |
| E / Enter | Use a switch |
| R | Restart the level |
| Esc / P | Pause |

Touch, mouse and trackpad all work, because all pointer input goes through the same pointer events.

## How the game works

### The two forms

Both forms share their horizontal position and run forward automatically. Each has its own vertical motion: jumping (with coyote time, a jump buffer and variable height), sliding and falling.

Only the **active** form is solid. It:

- collides with hazards in its own world
- collects items in its own world (coins above, crystals below)
- triggers switches

The inactive form is a faded echo: it finishes any jump in progress and then glides along the ground line. When you switch, the shared horizontal position is kept.

What hurts which form:

| Obstacle | Physical form (reality) | Shadow (shadow world) |
| --- | --- | --- |
| Walls, crates, spikes, blades, gears, lasers, pendulums, falling crates, trains, closed gates | blocks or hurts | blocks or hurts (in its own world) |
| Shadow walls | – | passes through |
| Light zones (static, pulsing, sweeping, switched on by lamps) | harmless | destroys |
| Pits, water | falls | falls |

During an **eclipse** both forms are solid at the same time, and jump and slide together.

### Switching

- The cooldown is 0.25 s, shown as a ring on the switch button.
- Each switch has its own visual effects:
  - a flash and a beam between the two forms
  - a wave rolling along the glowing divider
  - a ghost trail behind the active form
  - a cosmetic switch effect (flash, ripple, shards or ink)
- Each switch also has a sound and a vibration (both can be turned off).
- Switching is locked during the level-complete animation.

### Fairness

Every moving obstacle is synchronised to the runner's **distance**, not to the wall clock. The speed profile depends only on distance, so the time at which the runner reaches each point is fixed (`SpeedProfile.timeAt`). As a result:

- Level data can say "this laser is on when you arrive" and it will be, on every device.
- After a hit, the run continues from the last checkpoint in exactly the state it had there.
- An auto-player (`src/game/levels/LevelSolver.ts`, a beam search over switch, jump and slide inputs) proves that every level can be finished **without taking damage**. The solver runs in `npm run verify:levels` and in the unit tests.

### Failure and lives

You fail when:

- the active form hits a lethal obstacle
- the shadow enters light
- a form falls out of the level
- you pass a required portal in the wrong form
- you reach a closed gate without its switch

After a hit, the game pauses briefly, shows which form failed and why, and continues from the last checkpoint while lives remain. Most levels give 3 lives; the last two give 2. With no lives left, the failure screen shows the reason, the form that failed and a hint.

### Scoring and stars

`src/game/systems/ScoreSystem.ts`:

```
distance      1 point per 10 units
collectibles  50 per coin, 60 per crystal, 150 per key
time          10 per second left
efficiency    up to 500 for switching only as much as the level needs (par = minimum switches, recorded by the level builder)
checkpoints   100 each
near misses   25 each
damage        −250 per hit
```

| Stars | Requirement |
| --- | --- |
| ★ | finish the level |
| ★★ | finish with the level's target number of coins + crystals |
| ★★★ | also no damage, and a switch efficiency of at least 60 % |

## Content

### 30 handcrafted levels in 6 worlds

Each level lasts 45–120 seconds.

| World | New ideas |
| --- | --- |
| 1 First Light | running, jumping, switching, coins and crystals, walls, light, sliding, gaps |
| 2 Parallel Park | levers that open shadow gates, shadow plates that build bridges, street lamps that light the shadow world, moving platforms, pulsing light |
| 3 Neon City | lasers, timed doors, timed levers, trains, speed sections, moving signs |
| 4 Clockwork District | gears, elevators, twin lifts moving in both worlds, pendulums, blinking phase platforms |
| 5 Sunken Temple | water, collapsing stones, shadow bridges, light beams, required portals, keys that open doors in the other world |
| 6 The Eclipse | fast switching, many lights, eclipse zones where the worlds merge, sliding gates, a final chase |

### Other modes and screens

- **Interactive tutorial:** time freezes at each step until you do what it teaches: the two worlds, switching, light, jumping, sliding and a cross-world lever.
- **Daily challenge:** the date seeds the level, the same on every device. Each day:
  - the reality lane and the shadow lane come from two different worlds
  - a "twist" pattern appears twice
  - your best score for the day is saved
- **Endless mode:** unlocks after World 1.
  - Segments are generated from a widening pool of patterns, and the speed keeps rising.
  - You have one life.
  - The best distance is saved.
- **Collection:** 25 cosmetic unlockables, all purely visual: runner costumes, shadow forms, trails, switch effects and portal designs. They unlock with stars, lifetime coins and crystals, finished worlds, daily plays and endless distance.
- **Screens:** loading, main menu, tutorial, world select, level select (with mini maps), gameplay HUD, pause, results (success and failure), collection and settings.

### Cross-world interactions

Cross-world interactions are data. Every one has a trigger (a switch or key id), effects on obstacles (open, close, show, hide, on, off, start, optionally timed) and a written description that is also shown in game. Examples:

- a lever above opens a gate below
- a shadow plate builds a bridge above
- a street lamp above switches on light below
- a key from the shadow world opens a temple door above
- one plate starts twin lifts: the reality lift rises while the shadow lift sinks

## Level data

Levels are plain typed data (`src/game/levels/LevelDefinition.ts`). Each `LevelDefinition` contains:

- id, world, name and theme
- speed profile, length and spawn
- obstacles, collectibles, switches, portals and interactions
- checkpoints and eclipse zones
- time limit, required collectibles, par switches, lives and difficulty
- tutorial text

The gameplay code contains no level-specific logic.

The campaign is written as **recipes** in `src/game/levels/LevelData.ts`: an intro of patterns that teaches the world's new idea, then a loop of patterns repeated until the target duration is reached. The patterns in `src/game/levels/Patterns.ts` are self-contained, so any pattern can follow any other, and checkpoints are only placed between patterns.

**To add a level,** add a recipe, or build a `LevelDefinition` by hand. Then run `npm run verify:levels`.

## Project structure

```
src/
  main.ts                      entry: fonts, CSS, Phaser game, native bridge, test hooks
  styles/global.css
  game/
    GameConfig.ts              Phaser config (FIT scaling, all scenes)
    GameContext.ts             device profile, save data, settings
    scenes/                    Boot, Loading, Menu, Tutorial, WorldSelect, LevelSelect, Gameplay, Endless,
                               Result, Collection, Settings (+ BaseScene, gameplay/ HUD, input, effects)
    entities/                  PhysicalCharacter, ShadowCharacter (RunnerForm), Obstacle, Collectible, Switch,
                               Portal, Checkpoint, LightZone
    systems/                   RunSession (one run, engine-independent), RunnerSystem (speed + physics),
                               SwitchSystem, CollisionSystem (spatial buckets), CrossWorldInteractionSystem,
                               ScoreSystem, LevelManager (progression), SaveManager (versioned), DailyChallenge,
                               EndlessGenerator, Cosmetics, AudioManager (Web Audio synthesis)
    levels/                    LevelDefinition, Patterns (builder), LevelData (30 levels + tutorial),
                               WorldDefinitions, LevelSolver (auto-player)
    three/                     the 3D worlds: Renderer3D (WebGL canvas under Phaser), World3D (scene, chase camera,
                               lights), Street (road, buildings, props), LevelObjects (obstacles, items, portals),
                               Runner3D (animated character), Sky, Environment (6 worlds × 2 sides), Materials,
                               Textures (procedural canvas textures), Models (glTF loading), Portraits
    rendering/                 LaneView (3D world + 2D overlays per lane), TextureFactory, Themes, Layout, FxPool
  assets/models/               CC0 glTF models (Quaternius), compressed by scripts/optimize-models.mjs
    ui/                        Button, ProgressBar, StarRating, Modal, ActiveFormIndicator, Toggle, Tile,
                               FocusManager, Icons, Logo, Typography, Draw
    monetization/              integration points only (no ads, no payments)
    utils/                     Constants, MathUtils, DeviceUtils, Haptics, NativeBridge, TestHooks
tests/                         Vitest unit tests
scripts/                       verify-levels.ts, smoke.mjs, build-mobile.mjs
mobile/                        Expo app (WebView shell) for iOS and Android
store/                         store listings, graphics, screenshots and the tools that generate them
```

## Performance

- **Simulation:** fixed 60 Hz steps. Collision queries use 256-unit spatial buckets per world, and checkpoint snapshots only copy obstacles that can change.
- **Rendering:**
  - Each world is a three.js scene seen through a chase camera behind the runner, drawn into its half of one WebGL canvas that sits under the transparent Phaser canvas (HUD, menus). The simulation stays one-dimensional: world x becomes depth, so every obstacle keeps its exact timing.
  - Models share geometry and materials; buildings and props are pooled and placed from their slot number, so the street is identical on every attempt and endless in endless mode.
  - The light setup of a world never changes during a run (glows are sprites, not lights), so shaders are not recompiled mid-run.
  - Adaptive quality: when frames average over 20 ms, the render scale steps down from 2× to 1.5×, then shadows switch off and the scale drops to 1.25× and 1×. Weak devices start without shadows and antialiasing.
- **Memory:**
  - The render scale follows the device pixel ratio, capped at 2× (1.5× on weaker devices).
  - The 49 models are meshopt-compressed (3.1 MB in total) and textures are WebP at most 512 px; procedural textures are cached and shared.
  - The particle budget is lower on weak devices, and a frame-time governor lowers it further.
- **Pausing:** the run pauses when the tab is hidden, the window loses focus or the app goes to the background. Listeners and textures are released when a scene shuts down.

## Accessibility

- large touch targets
- left-handed mode
- high-contrast mode (calmer backgrounds, outlined hazards)
- reduced motion (no shake, flashes or parallax; it defaults to on when the OS asks for less motion)
- text labels next to every colour cue: REALITY / SHADOW, ON / OFF, LIGHT AHEAD and lock icons
- keyboard support, with focus navigation in menus
- screen-reader announcements
- safe-area insets for notches
- portrait layout

## Save data

Saved in `localStorage` under `shadow-runner/save`. The save is **versioned**: older versions are migrated step by step and every field is sanitised. Damaged JSON is backed up and the game starts fresh.

It stores:

- completed levels, stars, best scores, best times and best progress
- lifetime coins and crystals
- unlocked worlds
- unlocked and selected cosmetics
- settings
- daily best scores
- endless best distance
- stats

**Reset progress** (with confirmation) keeps your settings.

## Monetisation hooks (not active)

`src/game/monetization/MonetizationManager.ts` defines interfaces for a rewarded hint, a remove-ads purchase, cosmetic character and trail packs, and a bonus daily challenge. The default providers report "not available". Nothing in the game needs ads or purchases.

## iOS and Android apps (Expo)

`mobile/` is an Expo app that runs the game, inlined into a single HTML file, inside a WebView. It works fully offline and adds native haptics, pause on background, safe-area insets and the Android back button (see `src/game/utils/NativeBridge.ts`).

| | |
| --- | --- |
| Expo project | `@certi-development/shadow-runner` |
| Project ID | `9b1c9adc-0803-4024-a167-b37429a1d734` |
| App ID (both platforms) | `com.certidevelopment.shadowrunner` |

```bash
npm run build:mobile                                   # game → mobile/src/gameHtml.ts (after every game change)
cd mobile
npm install --global eas-cli                           # once
eas init --id 9b1c9adc-0803-4024-a167-b37429a1d734     # already linked; safe to re-run
eas build -p android --profile production              # signed .aab for Google Play (local upload key)
eas build -p ios --profile production                  # .ipa – EAS asks for your Apple ID once
npx eas-cli@latest submit -p ios --latest              # upload the latest iOS build to App Store Connect
```

The release checklist, store texts, screenshots and graphics are in [`store/README.md`](store/README.md).

## Android with Capacitor (alternative)

The web build can also be wrapped with [Capacitor](https://capacitorjs.com/):

- Asset paths are relative (`base: './'`).
- The game runs fully offline and is portrait only.
- `capacitor.config.json` is included, with app ID `com.certidevelopment.shadowrunner` and `webDir: dist`.

This prepares the project for packaging; the game has **not** been published on Google Play.

Prerequisites: Android Studio (with an Android SDK) and JDK 17+.

**1. Install dependencies and build the web version**

```bash
npm install
npm run build
```

**2. Add Capacitor**

```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
```

**3. Create the Android project**

```bash
npx cap add android
npx cap sync android
```

Lock the activity to portrait in `android/app/src/main/AndroidManifest.xml`:

```xml
<activity ... android:screenOrientation="portrait">
```

**4. Run on an Android device**

1. Enable *Developer options → USB debugging* on the phone and connect it.
2. Run:

```bash
npx cap run android          # pick the device
# or: npx cap open android   # then press Run in Android Studio
```

After every change, run `npm run build && npx cap sync android`.

**5. Create a release build**

Create an upload keystore once and keep it safe:

```bash
keytool -genkey -v -keystore shadow-runner-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias shadowrunner
```

Then build a signed bundle:

```bash
npm run build && npx cap sync android
npx cap build android --androidreleasetype AAB \
  --keystorepath ../shadow-runner-upload.jks --keystorealias shadowrunner \
  --keystorepass <store-password> --keystorealiaspass <key-password>
```

The bundle ends up in `android/app/build/outputs/bundle/release/`. Before each upload, raise `versionCode` and `versionName`.

## Credits

- Game design and code: **Medin Turkes**. Sounds are generated procedurally.
- 3D models: [Quaternius](https://quaternius.com) (CC0) – see [`src/assets/models/CREDITS.md`](src/assets/models/CREDITS.md).
- Engines: [three.js](https://threejs.org) (MIT) and [Phaser 3](https://phaser.io) (MIT).
- Font: [Fredoka](https://fonts.google.com/specimen/Fredoka) via Fontsource (SIL Open Font License), bundled for offline use.

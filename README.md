# Idle Duelists (web prototype)

Browser prototype of a pixel-art idle auto-battler, modeled on the core loop of
[Duelist: Idle Expedition](https://store.steampowered.com/app/4282780). Character art is the
PixelLab set from the `auto-battler` (Fjord Battlegrounds) project. Everything runs locally (localStorage save).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (vitest)
npm run build      # typecheck + production build
```

## Core loop

```
recruit (Tavern) → build squads (COST limit) → auto-battle frontier waves
   → gold / EXP / drops / Followers → Followers full → challenge outpost Duel
   → win: next outpost + Bronze Badge → rank-up (Class Hall), upgrade camp → repeat
```

| Mechanic | Prototype rule | Source of truth |
|---|---|---|
| Lanes / squads | up to 3 lanes, 4 duelists each, sum of COST ≤ Quarters limit | `engine/game.ts` `assign` |
| COST | Rank I=1, II=2 (ref: III=3, IV=4, V=6) | `data/classes.ts` |
| Combat | 1-D lane, move to range. 3-slot kit per duelist: random passive (rolled once), basic attack on interval (+energy), active cast the moment energy hits 100 | `engine/battle.ts`, `engine/data/passives.ts` |
| Gear passives | Rare/epic gear rolls a minor passive, legendary/mythic a major one; stacks with the duelist passive | `engine/data/passives.ts` |
| Followers | +1 per cleared wave, capped at outpost requirement → unlocks Duel | `grantWaveRewards` |
| Potential | F–S stat multiplier ×0.75–×1.25 | `data/world.ts` |
| Quarters | level cap / squad count / COST limit table | `QUARTERS` |
| Drops | 15% per kill, ¼ gear (common→mythic), rest ore/tomes | `DROP_CHANCE` |
| Rank-up | Lv 20 + 5,000g + Bronze Badge + Class Hall Lv1 | `rankUp` |
| Offline | samples 6 waves per lane → win-rate × time away (max 8h) | `applyOffline` |

## Architecture

```
src/
  engine/        pure TS, no DOM/Vue — deterministic (seeded RNG in state)
    types.ts       all data shapes
    data/          classes, outposts, facilities, gear tables (tune here)
    battle.ts      lane combat sim (createBattle / stepBattle / simulate)
    game.ts        world tick, rewards, player actions (return error | null)
    save.ts        localStorage + offline progress
  assets/sprites/  PixelLab exports (east-facing frames only), copied from auto-battler
  render/        canvas renderer (400×80 world units per lane, 2 device px per unit)
    art.ts         loads exports, maps class → art (+ hue-shift palette swaps), idle/walk/attack/death clips
    sprites.ts     16×16 procedural fallback for classes without art + pixel digits
    renderer.ts    consumes battle events → animations, hit flash, projectiles, numbers
  stores/game.ts Pinia store: raw engine state + triggerRef @4Hz, 10Hz logic loop
  ui/            Vue 3 components (tabs: Squads, Tavern, Armory, Camp, Map, Log)
tests/           vitest specs for engine rules
```

Design rules for refactoring:
- **Engine owns rules, UI only calls actions.** Every mutation is `action(state, ...args) → string | null`.
  Swap Vue for anything, or move the engine to a Worker / NestJS server, without touching rules.
- **Data-driven.** New class = one entry in `CLASSES`; new outpost = one entry in `OUTPOSTS`.
- **Deterministic.** RNG seed lives in `GameState`, so tests and replays are reproducible.
- **Events, not callbacks.** Battle emits `BattleEvent[]`; the renderer drains them. Headless sims just ignore them.

## Art

| Class / mob | Art | Notes |
|---|---|---|
| Warrior / Knight | `warrior` | Knight = hue shift; Cleave plays `heavy-strike`, Shield Wall plays `shield-bash` |
| Mage / Wizard / Priest / Bishop | `mage` | priest & bishop are hue-shifted mages until they get their own art |
| Archer / Ranger | `ranger` | Ranger = hue shift |
| Monsters | slime, wolf, orc, skeleton, wraith, troll; elites draugr, jotunn, drake | |

New art: drop a PixelLab export into `src/assets/sprites/<id>/` and add `classId → { id, hue? }` in `render/art.ts`.

## Not yet in prototype (reference game has them)
Rank III–V classes (21 sub-classes / 91 roles), enchanting, combat styles, followers' unique
styles, Exploration Post, shop/auction, taskbar "desktop companion" window, Idle/Immersive toggle.

## Deploy

- `ci.yml`: tests + typecheck/build on every pull request and non-`main` branch push.
- `pages.yml`: tests, builds and deploys to GitHub Pages on every push to `main` (i.e. every merged PR)
(`GITHUB_PAGES=true` sets the Vite base to `/idler-game/`). URL: https://omygod9138.github.io/idler-game/

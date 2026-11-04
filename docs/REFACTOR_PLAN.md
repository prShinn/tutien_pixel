# Refactor plan

## First slice in place

- Gameplay configuration, mutable game state, and the movement correction helper now live in ESM modules under `public/js/core/`.
- `public/js/bootstrap.js` installs temporary window aliases for older feature scripts. `public/js/core/sequential-loader.mjs` checks declared prerequisites, loads scripts one at a time, and stops at the first failure with a reload panel.
- Player, quest, and admin-content REST routes are mounted from router factories under `routes/`. The factories receive their current services and stores as dependencies; route URLs and response shapes stay the same.
- Server-side tile collision and movement-path sampling now live in `socket/movement-collision.js`, with focused tests for water, bounds, and intermediate path checks.

## Still legacy

- Most gameplay features still read/write shared browser names such as `S`, `CFG`, `World`, and `Net`. The bootstrap bridge keeps those scripts running while they are migrated.
- `server.js` still owns auth, world/admin-world, shared data, persistence wiring, and server startup.
- `socket/game.js` still owns realtime movement, combat, monster runtime, and loot handling.

## Next slices

1. Convert one client feature at a time to ESM imports, then replace its window alias with explicit imports; add contract tests before each removal.
2. Extract auth and public-world routes into router factories, then move world administration behind its own router.
3. Split socket runtime by responsibility: movement validation, combat resolution, and monster/loot simulation. Keep event names and payload contracts stable and test each extracted handler against the existing command pipeline.
4. Remove the compatibility bridge only after all gameplay feature modules import explicit dependencies and the browser smoke check covers the module graph.

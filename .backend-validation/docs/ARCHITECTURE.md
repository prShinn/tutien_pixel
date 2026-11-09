# Backend architecture baseline

## Current shape

The application is a modular monolith. `src/server.js` is the composition root: it creates the MySQL adapter, domain/application services, HTTP routers, Socket.IO gateway, and lifecycle cleanup. Factories receive dependencies explicitly, so dependency injection is already manual and testable in principle.

The runtime request path is:

```text
HTTP route / Socket.IO gateway
              ↓
     application service
              ↓
       MySQL store
              ↓
          MySQL
```

Routes and gateways are transport adapters. Files such as `player.js`, `shop.js`, and `auth.js` contain application use cases. `store/mysql-store.js` is the persistence adapter. Shared game rules and DTO projection live in `domain.js`, `data/balance.js`, and catalog services.

## Findings from the current code

- **Three-layer flow:** present in the main request paths as transport → service → persistence adapter. There is no separate controller directory; route handlers act as controllers and delegate to services.
- **IoC:** present through factory injection in `server.js` (for example, `createPlayerService({ store, catalog, world })`). It is explicit composition rather than a DI container.
- **Main structure issue:** persistence is one large `mysql-store.js` with mixed identity, player, wallet, inventory, quests, and admin operations. Three use-case files (`auth.js`, `player.js`, `shop.js`) also sit at the `src` root while newer domains have folders.
- **Entity ownership:** player-owned data is normalized in MySQL, but definition codes have no master-table FKs. `catalog-service.js` loads item/skill definitions from JS seeds and only some admin overrides; quests are read from `quest-catalog.js` while admin quest records are not used by `QuestService`.
- **Cross-domain writes:** services receive a broad `store` object. A service can call persistence methods outside its entity boundary, so ownership is a convention rather than an enforced module API.
- **Runtime state:** Socket.IO presence, monster state, drops, and cooldowns are process-local. The app is single-instance until those states are shared or partitioned.

The entity keys, relationships, canonical join paths, and data-source boundaries are defined in [DATA_MODEL_V1.md](DATA_MODEL_V1.md). Do not move or rename a persisted field based only on this file; use the model and an explicit migration.

## Target module shape

Keep a modular monolith and make modules follow the entities and use cases in the data model. Each module owns its application operations and its storage port; MySQL implementations stay behind those ports.

```text
src/
  bootstrap/                 # app creation, dependency wiring, shutdown
  shared/                    # errors, validation, transaction primitives
  modules/
    identity/                # accounts, credentials, refresh sessions
    player/                  # player profile, progression, stats, vitals
    economy/                 # wallet, currency ledger, shop
    inventory/               # stack ownership and item use
    equipment/               # slot rules and inventory transfer
    skills/                  # definitions, learned skills, loadout
    quests/                  # definitions, progress, rewards
    world/                   # maps, versions, portals, publication
    catalog/                 # item/root/realm/monster definition reads
    admin/                   # authoring, validation, audit
    realtime/                # gateway, runtime, socket command use cases
  adapters/
    http/                    # Express routes, middleware, DTO validation
    socket/                  # Socket.IO transport adapters
    mysql/                   # per-domain repositories and transaction runner
```

The target is a directory convention, not a mandate to create empty folders or split every file immediately. Extract a domain when implementing a vertical slice. Preserve service factories and the composition root; do not add an ORM, DI framework, or cross-module SQL shortcut without a concrete need.

## Layer and dependency rules

1. HTTP and socket adapters authenticate, validate transport input, call one application operation, and map its result to the existing response/ack contract.
2. Application services enforce use-case policy and coordinate domain rules and repositories. They accept explicit dependencies and do not import Express, Socket.IO, or MySQL.
3. Domain rules own invariants and calculations; they do not perform I/O.
4. Repository ports use entity/business-key language from the data model. MySQL adapters own SQL, row mapping, and transaction implementation.
5. A module may not write another module's tables through its repository. Cross-module work uses an application operation or an explicit unit-of-work boundary.
6. `server.js` (or its future `bootstrap` equivalent) is the only place that binds concrete adapters to service factories.
7. A database commit precedes socket broadcast. Add an outbox only if durable event delivery is required.

## Refactor sequence

1. Resolve the catalog source-of-truth issues documented in the data model.
2. Extract the MySQL adapter into identity/player/economy/inventory/quest/admin repositories behind the existing `store` facade. This keeps service contracts stable while removing the persistence monolith.
3. Move the root-level auth/player/shop application services into their domain modules and update only import paths.
4. Replace the broad `store` dependency with module-scoped repository ports one use case at a time.
5. Keep each step behavior-preserving; do not combine structure changes with an API or schema change.

No schema, public API, or runtime behavior is changed by this architecture baseline.

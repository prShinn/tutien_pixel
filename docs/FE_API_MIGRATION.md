# FE integration with the modular BE

Updated: 2026-11-04. FE now targets a configurable API origin and uses the BE response as the authority for supported player mutations. The mock browser backend remains available for isolated UI/gameplay demos.

## Local setup

The FE demo server runs on port `3000`; the modular BE defaults to port `3800`. Configure the BE `.env` with `PORT=3800` and `CORS_ORIGIN=http://localhost:3000`, then start the BE with its documented MySQL schema/migration ready. Start the FE from this repository with PowerShell:

```powershell
$env:PORT = '3000'
npm run dev
```

Open the game at:

```text
http://localhost:3000/?apiBase=http%3A%2F%2Flocalhost%3A3800
```

For Admin use the same query string on `/admin` and `/admin/map-editor`; local Admin pages default to `http://localhost:3800` even if gameplay previously remembered another API origin. FE accepts a query API origin only for the same origin or two loopback hosts; production deployments should inject a trusted `window.TuTienConfig.apiBase` or proxy `/api` and Socket.IO through the FE origin. The BE must allow the FE origin in `CORS_ORIGIN`.

`?mockBackend=1` keeps REST calls on local browser fixtures and local storage; Socket.IO is disabled in this mode. It does not verify connectivity to BE.

## Migrated FE flows

- Auth: register, login, demo, current-user check, refresh-token rotation and logout revocation.
- Player: create with only `name`, `gender`, `linhCan`, `stats`; load authoritative PlayerDTO and its world from BE.
- Reads: world, realm, root, item, skill, balance and VFX catalogs continue through `/api`.
- Mutations: shop, inventory use/equip/unequip, cultivation, skill learn/loadout and quest actions send a stable `requestId`; an uncertain request keeps its ID across retry and same-tab reload for 24 hours. Item mutations use catalog item codes, not a changing inventory index.
- Player mutation responses replace the matching FE player/inventory state. The wide 30-second client snapshot write is disabled for live BE sessions; it remains isolated to mock mode.
- API health status reports whether the configured BE origin responds instead of always displaying “server active”.

## Contract boundary

The endpoint and payload authority is `D:\Setup\mine\tutien_pixel_be\docs\API_V1.md` and `FE_INTEGRATION_NOTE.md`. Keep client state as presentation/prediction only; do not re-enable snapshot writes or trust client price, currency, inventory, progression, HP/MP or spawn coordinates.

Realtime uses the BE Socket.IO origin and `game_command` envelope. Keep prediction/reconciliation behind server events; a local UI animation is not proof that a server command committed. Confirm live DB, CORS, auth refresh, reconnect, movement/combat/loot and admin role behavior against a running BE before calling the integration demo-ready.

# Socket.IO contract V1

## Handshake

Socket.IO namespace `/`, same origin as REST. Handshake auth is `{ token: string }` using the same access JWT as REST. Expired/suspended tokens are rejected with `UNAUTHORIZED`.

## Command envelope and ack

```json
{ "requestId": "client-generated-id", "type": "world.join", "payload": {} }
```

`requestId` is 8–80 ASCII letters/digits/underscore/hyphen. A success ack is `{ ok:true, requestId, command, serverTime, result }`; an error ack is `{ ok:false, requestId, command, serverTime, error:{ code, message } }`. The gateway must not acknowledge success before the delegated use case completes.

```json
{
  "ok": true,
  "requestId": "move_req_0001",
  "command": "movement.intent",
  "serverTime": 1793788800000,
  "result": { "x": 12.5, "y": 18, "mapCode": "thanh_van_tran", "corrected": false }
}
```

## Command schemas

| Type | Payload | Authority and result |
|---|---|---|
| `world.join` | `{ mapCode?, x?, y?, mapVersion?, hasMap? }` | Server loads persisted player map/position. Client map/position fields are ignored. |
| `world.resync` | `{}` | Sends current server snapshot in `world_init`. |
| `movement.intent` | `{ x:number, y:number, mapCode?:string }` | `x/y` are fractional tile coordinates. Server validates current session/map, collision and movement speed (44 tiles/sec base, plus server-derived AGI/speed buffs); returns accepted position or correction. |
| `map.change` | `{ mapCode:string, x?:number, y?:number }` | Server verifies nearby portal and chooses arrival position. |
| `combat.attack` | `{ targetId:string, mapCode?:string, skillCode?:string }` | Target ID comes from `world_init.monsters`; server validates range, learned/equipped skill, cooldown and MP. |
| `combat.skill` | `{ skillCode:string }` | Server validates learned/equipped non-target skill, MP and cooldown. |
| `loot.pickup` | `{ itemId:string }` | Server validates room drop/range/capacity and commits reward once. |
| `chat.send` | `{ message:string }` | Server trims and limits to 100 characters before room broadcast. |

## Server events FE consumes

| Event | Payload |
|---|---|
| `world_init` | `{ map?, mapCode, mapVersion, player?, players[], monsters[], groundItems[] }` |
| `player_join`, `player_move` | player session DTO with id, name, x/y, mapCode |
| `player_leave` | `{ id }` |
| `player_state_update` | `{ hp?, maxHp?, mp?, maxMp?, buffs? }` |
| `movement_corrected` | `{ x, y, reason? }` |
| `monster_update`, `monster_spawn` | runtime monster state or `{ monster }` |
| `combat_result`, `player_combat_result`, `skill_result`, `player_skill_cast` | authoritative combat/skill outcome |
| `ground_loot_spawn`, `ground_loot_state`, `ground_loot_removed`, `ground_loot_picked` | authoritative room drop lifecycle |
| `quest_state_update` | same snapshot as `GET /api/quests` |
| `chat_message`, `server_msg` | chat DTO or `{ text }` |

## Legacy migration

Legacy inputs `join_world`, `move`, `map_change`, `chat`, `skill_request`, `attack_request`, `pickup_ground_item`, `monster_sync` are not registered by this BE. FE should use `game_command`; sunset old event listeners after both ends have migrated. FE listeners `world_state`, `player_map`, and `monster_state_update` are not part of this contract. `monster_death` remains emitted for compatibility.

## Runtime authority and limits

All eight commands above are dispatched to the gameplay service. `world.join`/`world.resync` emit the persisted player and authoritative room snapshot. Movement checks each traversed collision tile and limits speed. `map.change` requires the player within 14 tiles of a published map portal; server ignores destination coordinates and uses the portal destination. Monster IDs/spawn positions match the FE world loader. Attacks validate range/cooldown, use server monster HP and emit hit/death/loot events. Skill costs and monster damage persist as player vital mutations; loot claim and quest progress persist transactionally. Chat is stripped of control characters and limited to 100 characters/750 ms per sender.

Without Redis, presence, monsters, drops, buffs and cooldowns are process-local and realtime requires one BE instance. With `REDIS_URL`, a Redis lease selects one authoritative owner per map; other instances forward commands to that owner and the Socket.IO Redis adapter broadcasts its events. Runtime snapshots retain monsters, drops, buffs and cooldowns for owner takeover. Existing sockets in a failed-over map are disconnected and must rejoin; player vitals, inventory, loot claims and quest state remain committed in MySQL. Replay records for combat, loot, map changes and chat are shared in Redis. A command left in-flight by owner loss returns `COMMAND_OUTCOME_UNKNOWN` rather than running twice.

FE may remove listeners for `world_state`, `player_map`, and `monster_state_update`: the server emits `world_init`, `player_join/leave/move`, and `monster_update` instead. `monster_death` remains emitted for compatibility.

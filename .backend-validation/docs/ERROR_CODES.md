# Error codes

All REST errors are JSON `{ ok:false, error:string, code, details?, requestId? }`; Socket errors use `{ code, message }` within the ack.

- `INVALID_CREDENTIALS`, `USERNAME_TAKEN`, `UNAUTHORIZED`: authentication failed.
- `INVALID_REFRESH_TOKEN`, `RATE_LIMITED`: refresh/revoke or authentication request limit failed.
- `FORBIDDEN`: authenticated user lacks resource/admin permission.
- `PLAYER_NOT_FOUND`, `PLAYER_EXISTS`, `PLAYER_CONFLICT`, `PLAYER_STATE_CHANGED`, `PLAYER_CONTENT_STALE`, `PLAYER_NOT_DEAD`, `PLAYER_DEAD`: player lookup/state or respawn precondition failed.
- `INVALID_PLAYER_NAME`, `INVALID_STATS`, `INVALID_GENDER`, `INVALID_ROOT`, `STARTING_CONTENT_UNAVAILABLE`: character creation failed.
- `PLAYER_SNAPSHOT_WRITE_FORBIDDEN`: client attempted to mass-assign player state.
- `INVALID_REQUEST_ID`, `IDEMPOTENCY_CONFLICT`: mutation key missing/invalid or already used for another intent.
- `COMMAND_OUTCOME_UNKNOWN`, `COMMAND_IN_PROGRESS`, `ROOM_OWNER_UNAVAILABLE`, `ROOM_CLUSTER_UNAVAILABLE`: runtime command is being reconciled, an owner is unavailable, or Redis routing failed; reconnect/resync before retrying with a new request ID.
- `ITEM_NOT_FOUND`, `ITEM_NOT_BUYABLE`, `ITEM_NOT_SELLABLE`, `ITEM_NOT_IN_INVENTORY`, `ITEM_NOT_ABSORBABLE`, `ITEM_USE_NOT_SUPPORTED`, `ITEM_HAS_NO_EFFECT`, `ITEM_NOT_EQUIPMENT`: item/catalog/use precondition failed.
- `INVALID_ITEM_EFFECT`, `ROOT_CULTIVATION_CAPPED`: item effect is invalid or root cultivation cap reached.
- `INVALID_QUANTITY`, `INVENTORY_FULL`, `INVENTORY_STACK_LIMIT`, `INSUFFICIENT_ITEM`: inventory mutation failed.
- `INSUFFICIENT_FUNDS`: wallet cannot pay the server-side price.
- `INSUFFICIENT_TUVI`, `INSUFFICIENT_COMBAT_POWER`, `BREAKTHROUGH_PILL_REQUIRED`, `MAX_REALM_REACHED`: breakthrough requirement failed.
- `INVALID_STAT`, `INVALID_AMOUNT`, `INSUFFICIENT_STAT_POINTS`: stat allocation input/balance failed.
- `REALM_TOO_LOW`, `INVALID_EQUIPMENT_SLOT`, `ITEM_ALREADY_EQUIPPED`, `EQUIPMENT_NOT_FOUND`: equipment precondition failed.
- `SKILL_NOT_FOUND`, `SKILL_ROOT_MISMATCH`, `SKILL_NOT_LEARNED`, `INVALID_SKILL_LOADOUT`, `PASSIVE_SKILL_NOT_EQUIPPABLE`: skill mutation failed.
- `QUEST_NOT_FOUND`, `QUEST_NOT_AVAILABLE`, `QUEST_NOT_ACTIVE`, `QUEST_NOT_READY`, `QUEST_REWARD_INVALID`: quest use case failed.
- `WORLD_NOT_FOUND`, `WORLD_EXISTS`, `WORLD_INVALID`, `WORLD_CODE_IMMUTABLE`, `INVALID_PORTAL_POSITION`, `PORTAL_NOT_FOUND`: admin world edit failed.
- `INVALID_CONTENT_COLLECTION`, `CONTENT_READ_ONLY`, `CONTENT_ID_REQUIRED`, `CONTENT_EXISTS`, `CONTENT_NOT_FOUND`, `CONTENT_ID_MISMATCH`: admin content operation failed.
- `INVALID_VFX_PROFILE`, `SKILL_CODE_MISMATCH`, `SKILL_VFX_NOT_FOUND`: skill VFX edit failed.
- `INVALID_COMMAND`, `INVALID_PAYLOAD`, `INVALID_POSITION`, `INVALID_MAP_CODE`, `INVALID_TARGET`, `INVALID_DROP_ID`, `INVALID_CHAT_MESSAGE`, `WORLD_NOT_JOINED`, `COMMAND_RATE_LIMITED`: socket command schema, world session or rate limit failed.
- `WORLD_NO_WALKABLE_SPAWN`, `PORTAL_NOT_FOUND_OR_OUT_OF_RANGE`, `PORTAL_DESTINATION_BLOCKED`, `TARGET_NOT_FOUND`, `TARGET_OUT_OF_RANGE`, `COOLDOWN_ACTIVE`, `SKILL_NOT_EQUIPPED`, `SKILL_REQUIRES_TARGET`, `SKILL_REQUIRES_NO_TARGET`, `INSUFFICIENT_MP`, `LOOT_NOT_FOUND`, `LOOT_OUT_OF_RANGE`, `LOOT_ALREADY_CLAIMED`, `CHAT_RATE_LIMITED`: authoritative realtime gameplay precondition failed.
- `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `INTERNAL_ERROR`: malformed JSON, oversized body, missing route/resource, unsupported HTTP method or unexpected server failure.

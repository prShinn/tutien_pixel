const crypto = require('node:crypto');
const { isMonsterSpawnTile } = require('../world/world-service');

function createWorldRuntime({ world, catalog = null }) {
  const rooms = new Map();
  const spawnRules = new WeakMap();

  function pursuitRules(definition, pack) {
    return {
      aggroRange: Number(pack.aggroRange || definition.aggroRange || 40),
      leashDistance: Number(pack.leashDistance || definition.leashDistance || 72),
      chaseDurationMs: Number(pack.chaseDurationMs || definition.chaseDurationMs || 8000),
    };
  }

  function makeMonster(definition, id, x, y, pack = {}) {
    const maxHp = Math.max(1, Number(definition.maxHp || definition.hp || 1));
    const monster = {
      ...structuredClone(definition),
      id,
      templateId: definition.code || definition.id,
      x,
      y,
      spawnX: x,
      spawnY: y,
      packId: pack.packId || null,
      packCenterX: pack.packCenterX ?? x,
      packCenterY: pack.packCenterY ?? y,
      ...pursuitRules(definition, pack),
      nextAttackAt: 0,
      hp: maxHp,
      maxHp,
      state: 'idle',
      statusEffects: [],
      targetId: null,
      dead: false,
      respawnAt: 0,
    };
    spawnRules.set(monster, pack);
    return monster;
  }

  function monstersFor(map) {
    if (String(map.type || '').toUpperCase() === 'CITY' || map.rules?.noMonsters) return [];
    const definitions = map.monsters || [];
    const catalogById = new Map();
    for (const entry of catalog?.listMonsters() || []) {
      if (entry.id) catalogById.set(entry.id, entry);
      if (entry.code) catalogById.set(entry.code, entry);
    }
    const monsters = [];
    const explicitPacks = map.rules?.monsterPacksOnly === true;
    if (explicitPacks || (Array.isArray(map.monsterSpawns) && map.monsterSpawns.length)) {
      for (const pack of map.monsterSpawns || []) {
        const stored = definitions.find((entry) => entry.id === pack.templateId || entry.code === pack.templateId);
        const current = catalogById.get(pack.templateId);
        const match = current || stored;
        if (explicitPacks && (!match || !isMonsterSpawnTile(map, pack.centerX, pack.centerY))) continue;
        const definition = match || definitions[0] || pack;
        const count = explicitPacks
          ? Math.max(1, Math.min(20, Math.floor(Number(pack.count) || 1)))
          : Math.max(String(definition.type || '').toUpperCase() === 'BOSS' ? 1 : 3, Math.min(5, Number(pack.count || 4)));
        const radius = Number(pack.radius || 24);
        const centerX = Number(pack.centerX ?? map.w / 2);
        const centerY = Number(pack.centerY ?? map.h / 2);
        for (let index = 0; index < count; index += 1) {
          const angle = (index / count) * Math.PI * 2;
          const distance = radius * (0.35 + 0.55 * (index % 2));
          let x = Math.round(centerX + Math.cos(angle) * distance);
          let y = Math.round(centerY + Math.sin(angle) * distance);
          if (explicitPacks) {
            x = centerX;
            y = centerY;
            for (let step = 1; step <= Math.min(80, Math.ceil(distance)); step++) {
              const offset = Math.min(distance, step);
              const nextX = Math.round(centerX + Math.cos(angle) * offset);
              const nextY = Math.round(centerY + Math.sin(angle) * offset);
              if (!isMonsterSpawnTile(map, nextX, nextY)) break;
              x = nextX;
              y = nextY;
            }
          }
          monsters.push(makeMonster(definition, `${pack.packId || 'pack'}_${index}`, x, y, {
            packId: pack.packId,
            packCenterX: centerX,
            packCenterY: centerY,
            aggroRange: pack.aggroRange,
            leashDistance: pack.leashDistance,
            chaseDurationMs: pack.chaseDurationMs,
          }));
        }
      }
      return monsters;
    }

    let monsterIndex = 0;
    for (const definition of definitions) {
      for (let index = 0; index < 4; index += 1) {
        const angle = (index / 4) * Math.PI * 2;
        const distance = 24 * (0.35 + 0.55 * (index % 2));
        const centerX = Number(definition.spawnX || Math.floor(map.w / 2));
        const centerY = Number(definition.spawnY || Math.floor(map.h / 2));
        const x = Math.round(centerX + Math.cos(angle) * distance);
        const y = Math.round(centerY + Math.sin(angle) * distance);
        const current = catalogById.get(definition.code || definition.id);
        monsters.push(makeMonster(current || definition, `mon_${map.code}_${monsterIndex}_${index}`, x, y, {
          packId: `PACK_${definition.code || definition.id || monsterIndex}`,
          packCenterX: centerX,
          packCenterY: centerY,
        }));
      }
      monsterIndex += 1;
    }
    return monsters;
  }

  function roomFor(mapCode) {
    let room = rooms.get(mapCode);
    const map = world.getByCode(mapCode);
    if (!map) return null;
    if (room && room.mapVersion === Number(map.version || 0)) return room;
    room = {
      mapCode,
      mapVersion: Number(map.version || 0),
      players: new Map(),
      orphanedPlayers: new Map(),
      monsters: new Map(monstersFor(map).map((monster) => [monster.id, monster])),
      groundItems: new Map(),
    };
    rooms.set(mapCode, room);
    return room;
  }

  function refreshMonsters(room) {
    const now = Date.now();
    const respawned = [];
    for (const monster of room.monsters.values()) {
      if (monster.dead && monster.respawnAt && monster.respawnAt <= now) {
        monster.dead = false;
        monster.hp = monster.maxHp;
        monster.x = monster.spawnX;
        monster.y = monster.spawnY;
        monster.state = 'idle';
        monster.targetId = null;
        monster.respawnAt = 0;
        monster.statusEffects = [];
        monster.nextAttackAt = 0;
        respawned.push(publicMonster(monster));
      }
    }
    return respawned;
  }

  function publicMonster(monster) {
    const { respawnAt, ...dto } = monster;
    return { ...dto, respawnAt: undefined };
  }

  function cleanupExpiredDrops(room, now) {
    let removed = 0;
    for (const [id, drop] of room.groundItems) {
      if (drop.expiresAt <= now) {
        room.groundItems.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  return {
    getRoom: roomFor,
    exportRoom(mapCode) {
      const room = roomFor(mapCode);
      if (!room) return null;
      const players = new Map(room.orphanedPlayers || []);
      for (const session of room.players.values()) {
        if (!session.userId) continue;
        players.set(String(session.userId), {
          userId: String(session.userId),
          buffs: structuredClone(session.buffs || {}),
          cooldowns: [...(session.cooldowns instanceof Map ? session.cooldowns : new Map())],
        });
      }
      return {
        mapCode: room.mapCode,
        mapVersion: room.mapVersion,
        monsters: structuredClone([...room.monsters.values()]),
        groundItems: structuredClone([...room.groundItems.values()]),
        players: [...players.values()].map((player) => structuredClone(player)),
      };
    },
    restoreRoom(mapCode, snapshot) {
      rooms.delete(mapCode);
      const room = roomFor(mapCode);
      if (!room) return false;
      if (!snapshot || snapshot.mapCode !== mapCode || Number(snapshot.mapVersion) !== room.mapVersion) return true;
      if (Array.isArray(snapshot.monsters)) {
        room.monsters = new Map(snapshot.monsters
          .filter((monster) => monster && typeof monster.id === 'string')
          .map((monster) => [monster.id, structuredClone(monster)]));
      }
      if (Array.isArray(snapshot.groundItems)) {
        room.groundItems = new Map(snapshot.groundItems
          .filter((drop) => drop && typeof drop.id === 'string' && Number(drop.expiresAt) > Date.now())
          .map((drop) => [drop.id, structuredClone(drop)]));
      }
      if (Array.isArray(snapshot.players)) {
        room.orphanedPlayers = new Map(snapshot.players
          .filter((player) => player && player.userId != null)
          .map((player) => [String(player.userId), {
            userId: String(player.userId),
            buffs: structuredClone(player.buffs || {}),
            cooldowns: Array.isArray(player.cooldowns) ? structuredClone(player.cooldowns) : [],
          }]));
      }
      return true;
    },
    takeOrphanedPlayer(mapCode, userId) {
      const room = rooms.get(mapCode);
      const player = room?.orphanedPlayers?.get(String(userId));
      if (!player) return null;
      room.orphanedPlayers.delete(String(userId));
      return { buffs: structuredClone(player.buffs || {}), cooldowns: new Map(player.cooldowns || []) };
    },
    refreshRoom(mapCode) {
      const room = roomFor(mapCode);
      return room ? refreshMonsters(room).map((monster) => ({ mapCode, monster })) : [];
    },
    enter(mapCode, player, socketId) {
      const room = roomFor(mapCode);
      if (!room) return null;
      const session = {
        ...player,
        id: socketId,
        playerId: player.id,
        socketId,
        mapCode,
        movementBudget: 8.0,
        lastMovementAt: Date.now(),
        lastPersistAt: 0,
        persistRetryAt: 0,
        persistFailureCount: 0,
        persistedPosition: { mapCode, x: Number(player.x), y: Number(player.y), positionVersion: Number(player.positionVersion || 1) },
        positionStale: false,
        persistPromise: Promise.resolve(),
        cooldowns: player.cooldowns instanceof Map ? player.cooldowns : new Map(),
        buffs: player.buffs && typeof player.buffs === 'object' ? player.buffs : {},
        portalLockId: null,
      };
      room.players.set(socketId, session);
      refreshMonsters(room);
      return { room, session };
    },
    leave(mapCode, socketId) {
      const room = rooms.get(mapCode);
      if (!room) return null;
      const player = room.players.get(socketId) || null;
      room.players.delete(socketId);
      return { room, player };
    },
    getPlayer(mapCode, socketId) { return rooms.get(mapCode)?.players.get(socketId) || null; },
    updatePlayer(mapCode, socketId, patch) {
      const room = rooms.get(mapCode);
      const player = room?.players.get(socketId);
      if (!player) return null;
      Object.assign(player, patch);
      return player;
    },
    listPlayers(mapCode) { return [...(rooms.get(mapCode)?.players.values() || [])]; },
    listMonsters(mapCode) {
      const room = roomFor(mapCode);
      if (!room) return [];
      refreshMonsters(room);
      return [...room.monsters.values()].map(publicMonster);
    },
    syncMonsterCatalog(templateId) {
      if (!catalog) return [];
      const byCode = new Map();
      for (const definition of catalog.listMonsters()) {
        if (definition.id) byCode.set(definition.id, definition);
        if (definition.code) byCode.set(definition.code, definition);
      }
      const updates = [];
      const runtimeFields = ['id', 'x', 'y', 'spawnX', 'spawnY', 'packId', 'packCenterX', 'packCenterY',
        'nextAttackAt', 'state', 'statusEffects', 'targetId', 'dead', 'respawnAt'];
      for (const room of rooms.values()) {
        const monsters = [];
        for (const monster of room.monsters.values()) {
          if (templateId && monster.templateId !== templateId) continue;
          const definition = byCode.get(monster.templateId);
          if (!definition) continue;
          const previousMaxHp = Math.max(1, Number(monster.maxHp || monster.hp || 1));
          const healthRatio = Math.max(0, Math.min(1, Number(monster.hp || 0) / previousMaxHp));
          const runtimeState = Object.fromEntries(runtimeFields.map((key) => [key, monster[key]]));
          Object.assign(monster, structuredClone(definition), pursuitRules(definition, spawnRules.get(monster) || {}), runtimeState);
          const nextMaxHp = Math.max(1, Number(definition.maxHp || definition.hp || previousMaxHp));
          monster.templateId = definition.code || definition.id;
          monster.maxHp = nextMaxHp;
          monster.hp = monster.dead ? 0 : Math.max(1, Math.min(nextMaxHp, Math.round(healthRatio * nextMaxHp)));
          monsters.push(publicMonster(monster));
        }
        if (monsters.length) updates.push({ mapCode: room.mapCode, monsters });
      }
      return updates;
    },
    refreshAll() {
      const changes = [];
      for (const room of rooms.values()) {
        for (const monster of refreshMonsters(room)) changes.push({ mapCode: room.mapCode, monster });
      }
      return changes;
    },
    activeRooms() { return [...rooms.values()]; },
    cleanupExpiredDrops(now = Date.now()) {
      let removed = 0;
      for (const room of rooms.values()) removed += cleanupExpiredDrops(room, now);
      return removed;
    },
    cleanupExpiredDropsInRoom(mapCode, now = Date.now()) {
      const room = rooms.get(mapCode);
      return room ? cleanupExpiredDrops(room, now) : 0;
    },
    getMonster(mapCode, monsterId) {
      const room = rooms.get(mapCode);
      if (!room) return null;
      refreshMonsters(room);
      return room.monsters.get(monsterId) || null;
    },
    damageMonster(mapCode, monsterId, damage) {
      const monster = this.getMonster(mapCode, monsterId);
      if (!monster || monster.dead) return null;
      monster.hp = Math.max(0, monster.hp - damage);
      monster.dead = monster.hp <= 0;
      monster.state = monster.dead ? 'dead' : 'hit';
      if (monster.dead) {
        monster.respawnAt = Date.now() + Math.max(1000, Number(monster.respawnMs || 10000));
        monster.targetId = null;
      }
      return publicMonster(monster);
    },
    addDrop(mapCode, drop) {
      const room = roomFor(mapCode);
      if (!room) return null;
      const item = { ...drop, id: drop.id || `drop_${crypto.randomUUID()}` };
      room.groundItems.set(item.id, item);
      return item;
    },
    getDrop(mapCode, dropId) { return rooms.get(mapCode)?.groundItems.get(dropId) || null; },
    removeDrop(mapCode, dropId) { return rooms.get(mapCode)?.groundItems.delete(dropId) || false; },
    listDrops(mapCode) {
      const room = rooms.get(mapCode);
      if (!room) return [];
      cleanupExpiredDrops(room, Date.now());
      return [...room.groundItems.values()];
    },
  };
}

module.exports = { createWorldRuntime };

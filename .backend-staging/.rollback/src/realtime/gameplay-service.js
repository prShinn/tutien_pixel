const crypto = require('node:crypto');
const { DomainError } = require('../domain');
const { validateRequestId } = require('../inventory/inventory-service');
const { BALANCE, deriveStats, mitigateDamage } = require('../data/balance');
const { createWorldRuntime } = require('./world-runtime');
const { findMonsterRoute, clearMonsterSegment } = require('./monster-route');

const BASE_MOVEMENT_SPEED = 44;
const PICKUP_RANGE = 22;
const PORTAL_RANGE = 14;
const BASIC_ATTACK_RANGE = 26;
const SKILL_RANGE_SCALE = 6;
const DROP_TTL_MS = 120000;
const POSITION_PERSIST_INTERVAL_MS = 2000;
const POSITION_PERSIST_RETRY_BASE_MS = 1000;
const POSITION_PERSIST_RETRY_MAX_MS = 30000;
const MONSTER_UPDATE_BATCH_SIZE = 100;
const MAX_AREA_TARGETS = 12;
const MONSTER_EFFECTS = new Set(['armor_break', 'burn', 'curse', 'freeze', 'root', 'slow', 'stun']);

function createGameplayService({ io, auth, players, store, catalog, world, quests }) {
  const runtime = createWorldRuntime({ world, catalog });
  const commandResults = new Map();
  const monsterLocks = new Map();
  const pendingOperations = new Set();
  const burnSources = new WeakMap();
  const monsterRoutes = new WeakMap();
  let stopping = false;
  let lastDropCleanupAt = 0;
  let monsterCatalogRevision = catalog.getMonsterRevision?.();
  const runtimeTimer = setInterval(() => {
    const now = Date.now();
    const nextMonsterRevision = catalog.getMonsterRevision?.();
    if (nextMonsterRevision !== undefined && nextMonsterRevision !== monsterCatalogRevision) {
      monsterCatalogRevision = nextMonsterRevision;
      broadcastMonsterCatalog();
    }
    if (now - lastDropCleanupAt >= 5000) {
      runtime.cleanupExpiredDrops(now);
      lastDropCleanupAt = now;
    }
    for (const change of runtime.refreshAll()) io.to(roomName(change.mapCode)).emit('monster_spawn', { monster: change.monster });
    track(tickMonsters());
  }, 500);
  runtimeTimer.unref?.();
  let monsterTickRunning = false;

  function requirePayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('INVALID_PAYLOAD', 'Payload phải là object JSON');
    return value;
  }

  function roomName(mapCode) { return mapCode; }
  function track(operation) {
    pendingOperations.add(operation);
    operation.then(() => pendingOperations.delete(operation), () => pendingOperations.delete(operation));
    return operation;
  }
  async function drain() {
    while (pendingOperations.size) await Promise.allSettled([...pendingOperations]);
  }
  function sessionDto(session) {
    return {
      id: session.socketId,
      name: session.name,
      username: session.username,
      x: session.x,
      y: session.y,
      mapCode: session.mapCode,
      hp: session.hp,
      maxHp: session.maxHp,
    };
  }

  function walkable(map, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= Number(map.w) || y >= Number(map.h)) return false;
    return Number(map.jsonMap?.[Math.floor(y)]?.[Math.floor(x)] ?? 0) !== 2;
  }

  function safeSpawn(map, x, y) {
    if (walkable(map, x, y)) return { x, y };
    if (walkable(map, Number(map.spawnX), Number(map.spawnY))) return { x: Number(map.spawnX), y: Number(map.spawnY) };
    for (let radius = 1; radius <= 12; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const candidateX = Math.floor(Number(map.spawnX) + dx) + 0.5;
          const candidateY = Math.floor(Number(map.spawnY) + dy) + 0.5;
          if (walkable(map, candidateX, candidateY)) return { x: candidateX, y: candidateY };
        }
      }
    }
    throw new DomainError('WORLD_NO_WALKABLE_SPAWN', 'Bản đồ không có ô đi được gần điểm hồi sinh', 503);
  }

  async function persistPosition(session, force = false) {
    const now = Date.now();
    if (!force && now < session.persistRetryAt) return;
    if (!force && now - session.lastPersistAt < POSITION_PERSIST_INTERVAL_MS) return;
    session.lastPersistAt = now;
    const value = { mapCode: session.mapCode, x: session.x, y: session.y };
    session.persistPromise = track(session.persistPromise
      .catch(() => {})
      .then(() => store.savePlayerPosition(session.userId, value.mapCode, value.x, value.y, { includeSnapshot: false })));
    try {
      await session.persistPromise;
      session.persistFailureCount = 0;
      session.persistRetryAt = 0;
    }
    catch (error) {
      session.persistFailureCount = Math.min(Number(session.persistFailureCount || 0) + 1, 6);
      const retryMs = Math.min(POSITION_PERSIST_RETRY_MAX_MS,
        POSITION_PERSIST_RETRY_BASE_MS * (2 ** (session.persistFailureCount - 1)));
      session.persistRetryAt = Date.now() + retryMs;
      process.stderr.write(`${JSON.stringify({ level: 'error', event: 'player_position_persist_failed', retryMs })}\n`);
      throw error;
    }
  }

  function worldInit(session, player) {
    const map = world.getByCode(session.mapCode);
    if (!map) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ không tồn tại hoặc chưa publish', 404);
    const others = runtime.listPlayers(session.mapCode).filter((entry) => entry.socketId !== session.socketId).map(sessionDto);
    return {
      mapCode: session.mapCode,
      mapVersion: Number(map.version || 0),
      player: { ...player, x: session.x, y: session.y, mapCode: session.mapCode, mapId: session.mapCode },
      players: others,
      monsters: runtime.listMonsters(session.mapCode),
      groundItems: runtime.listDrops(session.mapCode),
    };
  }

  function emitWorldInit(socket, session, player) {
    const result = worldInit(session, player);
    socket.emit('world_init', result);
    socket.emit('ground_loot_state', { items: result.groundItems });
    return result;
  }

  async function join(socket, payload, isResync = false) {
    const now = Date.now();
    if (now - Number(socket.data.lastJoinAt || 0) < 250) throw new DomainError('COMMAND_RATE_LIMITED', 'Đồng bộ bản đồ quá thường xuyên', 429);
    socket.data.lastJoinAt = now;
    let session = runtime.getPlayer(socket.data.mapCode, socket.id);
    if (session && isResync) {
      const player = await players.snapshot(socket.auth.sub);
      const map = world.getByCode(session.mapCode);
      if (!map) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ không tồn tại hoặc chưa publish', 404);
      runtime.updatePlayer(session.mapCode, socket.id, {
        ...player,
        userId: socket.auth.sub,
        username: socket.auth.username,
        x: session.x,
        y: session.y,
        mapCode: session.mapCode,
        buffs: session.buffs,
        cooldowns: session.cooldowns,
        socketId: socket.id,
      });
      session = runtime.getPlayer(session.mapCode, socket.id);
      await socket.join(roomName(session.mapCode));
      return emitWorldInit(socket, session, players.decorate({ ...player, x: session.x, y: session.y, mapCode: session.mapCode }));
    }

    for (const room of runtime.activeRooms()) {
      const previous = [...room.players.values()].find((entry) => entry.userId === socket.auth.sub && entry.socketId !== socket.id);
      if (!previous) continue;
      await persistPosition(previous, true);
      runtime.leave(previous.mapCode, previous.socketId);
      io.to(roomName(previous.mapCode)).emit('player_leave', { id: previous.socketId });
      const previousSocket = io.sockets?.sockets?.get(previous.socketId);
      if (previousSocket) {
        previousSocket.data.mapCode = null;
        previousSocket.emit('server_msg', { text: 'Tài khoản đã kết nối từ một thiết bị khác.' });
        previousSocket.disconnect(true);
      }
    }

    if (session) {
      await persistPosition(session, true);
      runtime.leave(session.mapCode, socket.id);
      socket.leave(roomName(session.mapCode));
      socket.to(roomName(session.mapCode)).emit('player_leave', { id: socket.id });
    }

    let player = await players.snapshot(socket.auth.sub);
    const map = world.getByCode(player.mapCode) || world.getDefault();
    if (!map) throw new DomainError('WORLD_NOT_FOUND', 'Chưa có bản đồ published', 503);
    const point = safeSpawn(map, Number(player.x), Number(player.y));
    if (map.code !== player.mapCode || point.x !== Number(player.x) || point.y !== Number(player.y)) {
      player = await store.savePlayerPosition(socket.auth.sub, map.code, point.x, point.y);
      player = players.decorate(player);
    }
    const entered = runtime.enter(map.code, {
      ...player,
      userId: socket.auth.sub,
      username: socket.auth.username,
      x: point.x,
      y: point.y,
      mapCode: map.code,
      buffs: {},
      cooldowns: new Map(),
    }, socket.id);
    if (!entered) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ không tồn tại hoặc chưa publish', 404);
    session = entered.session;
    socket.data.mapCode = map.code;
    await socket.join(roomName(map.code));
    const result = emitWorldInit(socket, session, player);
    socket.to(roomName(map.code)).emit('player_join', sessionDto(session));
    return result;
  }

  function requireSession(socket) {
    const session = runtime.getPlayer(socket.data.mapCode, socket.id);
    if (!session) throw new DomainError('WORLD_NOT_JOINED', 'Hãy vào thế giới trước khi gửi thao tác', 409);
    return session;
  }

  async function syncPlayerState(session) {
    const fresh = await players.snapshot(session.userId);
    Object.assign(session, {
      name: fresh.name,
      gender: fresh.gender,
      linhCan: fresh.linhCan,
      realmCode: fresh.realmCode,
      realmStage: fresh.realmStage,
      stats: fresh.stats,
      derivedStats: fresh.derivedStats,
      equipment: fresh.equipment,
      learnedSkills: fresh.learnedSkills,
      equippedSkills: fresh.equippedSkills,
      hp: fresh.hp,
      maxHp: fresh.maxHp,
      mp: fresh.mp,
      maxMp: fresh.maxMp,
      xu: fresh.xu,
      x: session.x,
      y: session.y,
      mapCode: session.mapCode,
    });
    return session;
  }

  async function movement(socket, payload) {
    const session = requireSession(socket);
    const map = world.getByCode(session.mapCode);
    const x = payload.x;
    const y = payload.y;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 100000 || Math.abs(y) > 100000) {
      throw new DomainError('INVALID_POSITION', 'Tọa độ không hợp lệ');
    }
    if (payload.mapCode != null && String(payload.mapCode).toLowerCase() !== session.mapCode) {
      socket.emit('movement_corrected', { x: session.x, y: session.y, reason: 'Bản đồ hiện tại không khớp.' });
      return { x: session.x, y: session.y, mapCode: session.mapCode, corrected: true };
    }

    const now = Date.now();
    if (now - session.lastMovementAt < 15) throw new DomainError('COMMAND_RATE_LIMITED', 'Gói di chuyển gửi quá thường xuyên', 429);
    const elapsed = Math.max(0, Math.min(0.5, (now - session.lastMovementAt) / 1000));
    const speedBuff = currentBuffs(session).buff_spd || currentBuffs(session).speed;
    const speedBonus = Number(session.stats?.agi || 0) * 0.08;
    const speedPercent = speedBuff && speedBuff.expiresAt > now ? Math.max(0, Number(speedBuff.value || 0)) : 0;
    const movementSpeed = (BASE_MOVEMENT_SPEED + speedBonus) * (1 + speedPercent / 100);
    session.movementBudget = Math.min(movementSpeed * 0.1, session.movementBudget + elapsed * movementSpeed);
    session.lastMovementAt = now;
    const dx = x - session.x;
    const dy = y - session.y;
    const requestedDistance = Math.hypot(dx, dy);
    const budget = session.movementBudget;
    const distance = Math.min(requestedDistance, budget);
    const ratio = requestedDistance > 0 ? distance / requestedDistance : 0;
    const targetX = session.x + dx * ratio;
    const targetY = session.y + dy * ratio;
    const steps = Math.max(1, Math.ceil(Math.hypot(targetX - session.x, targetY - session.y) / 0.2));
    let acceptedX = session.x;
    let acceptedY = session.y;
    let blocked = false;
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      const nextX = session.x + (targetX - session.x) * progress;
      const nextY = session.y + (targetY - session.y) * progress;
      if (!walkable(map, nextX, nextY)) { blocked = true; break; }
      acceptedX = nextX;
      acceptedY = nextY;
    }
    const moved = Math.hypot(acceptedX - session.x, acceptedY - session.y);
    session.movementBudget = Math.max(0, budget - moved);
    session.x = acceptedX;
    session.y = acceptedY;
    runtime.updatePlayer(session.mapCode, socket.id, { x: acceptedX, y: acceptedY });

    const clamped = requestedDistance > budget + 0.01;
    if (blocked || clamped) socket.emit('movement_corrected', {
      x: acceptedX,
      y: acceptedY,
      reason: blocked ? 'Đường đi bị địa hình chặn.' : 'Tốc độ di chuyển vượt giới hạn.',
    });
    if (moved > 0.01) {
      socket.to(roomName(session.mapCode)).emit('player_move', sessionDto(session));
      void persistPosition(session).catch(() => {});
    }
    return { x: acceptedX, y: acceptedY, mapCode: session.mapCode, corrected: blocked || clamped };
  }

  async function changeMap(socket, payload) {
    let session = requireSession(socket);
    const source = world.getByCode(session.mapCode);
    if (!source) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ hiện tại không tồn tại hoặc chưa publish', 404);
    const targetCode = typeof payload.mapCode === 'string' ? payload.mapCode.trim().toLowerCase() : '';
    if (!targetCode) throw new DomainError('INVALID_MAP_CODE', 'Mã bản đồ đích không hợp lệ');
    const portal = (source.portals || []).find((entry) => (entry.toMap || entry.denMap) === targetCode
      && Math.hypot(session.x - Number(entry.x), session.y - Number(entry.y)) <= PORTAL_RANGE);
    if (!portal) throw new DomainError('PORTAL_NOT_FOUND_OR_OUT_OF_RANGE', 'Hãy đứng gần cổng hợp lệ để chuyển bản đồ', 409);
    const target = world.getByCode(targetCode);
    if (!target) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ đích không tồn tại hoặc chưa publish', 404);
    const destination = { x: Number(portal.toX), y: Number(portal.toY) };
    if (!walkable(target, destination.x, destination.y)) throw new DomainError('PORTAL_DESTINATION_BLOCKED', 'Điểm đến của cổng không thể đi được', 409);

    await persistPosition(session, true);
    const persisted = players.decorate(await store.savePlayerPosition(socket.auth.sub, target.code, destination.x, destination.y));
    const oldCode = session.mapCode;
    const oldRoom = roomName(oldCode);
    runtime.leave(oldCode, socket.id);
    socket.leave(oldRoom);
    socket.to(oldRoom).emit('player_leave', { id: socket.id });
    const entered = runtime.enter(target.code, {
      ...persisted,
      userId: socket.auth.sub,
      username: socket.auth.username,
      x: destination.x,
      y: destination.y,
      mapCode: target.code,
      buffs: session.buffs,
      cooldowns: session.cooldowns,
    }, socket.id);
    if (!entered) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ đích không tồn tại hoặc chưa publish', 404);
    session = entered.session;
    socket.data.mapCode = target.code;
    await socket.join(roomName(target.code));
    const result = emitWorldInit(socket, session, persisted);
    socket.to(roomName(target.code)).emit('player_join', sessionDto(session));
    return { mapCode: target.code, x: destination.x, y: destination.y, mapVersion: target.version, player: persisted, ...result };
  }

  async function publishQuestEvent(socket, event) {
    const snapshot = await quests.applyEvent(socket.auth.sub, `evt_${crypto.randomUUID()}`, event);
    if (snapshot.changed) socket.emit('quest_state_update', snapshot);
    return snapshot;
  }

  function moveMonster(map, monster, goal, speed, leash) {
    const canWalk = (x, y) => walkable(map, x, y)
      && Math.hypot(x - monster.spawnX, y - monster.spawnY) <= leash;
    const distance = Math.hypot(goal.x - monster.x, goal.y - monster.y);
    if (distance <= 0.001) return;
    let waypoint = goal;
    const now = Date.now();
    if (!clearMonsterSegment(monster, goal, canWalk)) {
      const goalKey = `${Math.floor(goal.x)}:${Math.floor(goal.y)}`;
      let cached = monsterRoutes.get(monster);
      if (!cached || cached.goalKey !== goalKey || cached.expiresAt <= now) {
        cached = {
          goalKey,
          expiresAt: now + 1500,
          points: findMonsterRoute(monster, goal, canWalk),
        };
        monsterRoutes.set(monster, cached);
      }
      while (cached.points.length && Math.hypot(cached.points[0].x - monster.x, cached.points[0].y - monster.y) <= 0.05) cached.points.shift();
      waypoint = cached.points[0];
      if (!waypoint) return;
    } else {
      monsterRoutes.delete(monster);
    }

    const remaining = Math.hypot(waypoint.x - monster.x, waypoint.y - monster.y);
    if (remaining <= 0.001) return;
    const ratio = Math.min(1, speed / remaining);
    const next = {
      x: monster.x + (waypoint.x - monster.x) * ratio,
      y: monster.y + (waypoint.y - monster.y) * ratio,
    };
    if (clearMonsterSegment(monster, next, canWalk)) {
      monster.x = next.x;
      monster.y = next.y;
    }
  }

  async function tickMonsters() {
    if (monsterTickRunning) return;
    monsterTickRunning = true;
    try {
      const now = Date.now();
      for (const room of runtime.activeRooms()) {
        const map = world.getByCode(room.mapCode);
        if (!map) continue;
        const movementUpdates = [];
        for (const monster of room.monsters.values()) {
          if (monster.dead) continue;
          const statuses = monster.statusEffects || [];
          monster.statusEffects = statuses.filter((effect) => effect.expiresAt > now);
          if (statuses.length !== monster.statusEffects.length) movementUpdates.push({ ...monster });
          const burn = activeStatus(monster, 'burn', now);
          if (burn && burn.nextTickAt <= now) {
            await withMonsterLock(`combat:${room.mapCode}`, async () => {
              if (monster.dead || activeStatus(monster, 'burn') !== burn) return;
              burn.nextTickAt = Date.now() + 1000;
              const updated = runtime.damageMonster(room.mapCode, monster.id, Math.max(1, Math.floor(burn.value)));
              if (!updated) return;
              io.to(roomName(room.mapCode)).emit('monster_update', { monsters: [updated] });
              const source = burnSources.get(burn);
              if (updated.dead && source) await rewardKill(room.mapCode, monster, source.userId, source.socketId);
            });
          }
          if (monster.dead || activeStatus(monster, 'stun', now) || activeStatus(monster, 'freeze', now)) continue;
          const aggroRange = Number(monster.aggroRange || 40);
          const leash = Number(monster.leashDistance || 72);
          const rooted = activeStatus(monster, 'root', now);
          const slow = activeStatus(monster, 'slow', now);
          const speedMultiplier = slow ? 1 - Math.min(0.75, Math.max(0, slow.value / 100)) : 1;
          const speed = Math.max(0.2, Number(monster.speed || 1) * 0.5) * speedMultiplier;
          let nearestPlayer = null;
          let nearestDistance = Number.POSITIVE_INFINITY;
          for (const player of room.players.values()) {
            const distance = Math.hypot(monster.x - player.x, monster.y - player.y);
            const distanceFromHome = Math.hypot(player.x - monster.spawnX, player.y - monster.spawnY);
            if (player.hp > 0 && distanceFromHome <= leash && distance <= aggroRange && distance < nearestDistance) {
              nearestPlayer = player;
              nearestDistance = distance;
            }
          }
          if (!nearestPlayer) {
            const home = { x: monster.spawnX, y: monster.spawnY };
            const needsReturn = Math.hypot(monster.x - home.x, monster.y - home.y) > 0.05;
            if (needsReturn || monster.targetId || monster.state !== 'idle') {
              monster.targetId = null;
              monster.state = needsReturn ? 'return' : 'idle';
              if (needsReturn && !rooted) moveMonster(map, monster, home, speed, leash);
              movementUpdates.push({ ...monster });
            }
            continue;
          }

          const target = nearestPlayer;
          monster.targetId = target.socketId;
          const attackRange = 18;
          const hasLineOfSight = clearMonsterSegment(monster, target, (x, y) => walkable(map, x, y));
          if (nearestDistance > attackRange || !hasLineOfSight) {
            if (rooted) continue;
            moveMonster(map, monster, target, speed, leash);
            monster.state = 'chase';
            movementUpdates.push({ ...monster });
            continue;
          }
          if (monster.nextAttackAt > now) continue;

          monster.state = 'attack';
          monster.nextAttackAt = now + Math.max(800, 1300 / Math.max(0.5, Number(monster.speed || 1)));
          const derived = target.derivedStats || deriveStats(target.stats || {}, target.equipment || {});
          const miss = Math.random() < Math.max(0, Math.min(0.35, Number(derived.evasion || 0)));
          const magic = String(monster.attackType || '').toUpperCase() === 'MAGIC';
          const attack = magic ? (monster.mAtk ?? monster.atk) : monster.atk;
          const rawDamage = Math.max(1, Number(attack || 1) + crypto.randomInt(0, 4));
          const floorHp = Math.floor(Number(target.maxHp || 100) * 0.25);
          const buffs = currentBuffs(target);
          const passive = combatModifiers(target);
          const defense = (magic ? derived.mDef : derived.pDef) * (1 + buffPercent(buffs, 'buff_def') + passive.defensePct);
          const shield = buffPercent(buffs, 'shield') * (1 + passive.shieldPct);
          const mitigated = Math.ceil(mitigateDamage(rawDamage, defense) * (1 - Math.min(0.8, shield)));
          const damage = miss ? 0 : Math.min(Math.max(0, Number(target.hp || 0) - floorHp), mitigated);
          try {
            if (damage > 0) {
              const mutation = await store.updateVitals(target.userId, `mob_${crypto.randomUUID()}`, 'MONSTER_ATTACK', { hp: -damage });
              target.hp = Number(mutation.result.hp);
            }
            const dto = { ...monster, x: monster.x, y: monster.y, state: 'attack', targetId: target.socketId };
            io.to(roomName(room.mapCode)).emit('monster_update', { monsters: [dto] });
            io.to(roomName(room.mapCode)).emit('player_combat_result', {
              targetId: target.socketId,
              attackerId: monster.id,
              damage,
              miss,
              hp: target.hp,
              maxHp: target.maxHp,
            });
            io.to(target.socketId).emit('player_state_update', { hp: target.hp, maxHp: target.maxHp, mp: target.mp, maxMp: target.maxMp, buffs: target.buffs });
          } catch {
            monster.nextAttackAt = Date.now() + 1000;
          }
        }
        for (let offset = 0; offset < movementUpdates.length; offset += MONSTER_UPDATE_BATCH_SIZE) {
          io.to(roomName(room.mapCode)).emit('monster_update', {
            monsters: movementUpdates.slice(offset, offset + MONSTER_UPDATE_BATCH_SIZE),
          });
        }
      }
    } finally {
      monsterTickRunning = false;
    }
  }

  function currentBuffs(session) {
    const now = Date.now();
    for (const [key, buff] of Object.entries(session.buffs || {})) if (buff.expiresAt <= now) delete session.buffs[key];
    return session.buffs || {};
  }

  function buffPercent(buffs, key) {
    return Math.max(0, Number(buffs[key]?.value || 0)) / 100;
  }

  function combatModifiers(session) {
    const modifiers = { defensePct: 0, shieldPct: 0, skillDamagePct: 0, critPct: 0, cooldownPct: 0, pDefPenPct: 0, statusEffectPct: 0 };
    const learned = new Set(session.learnedSkills || []);
    if (!learned.size) return modifiers;
    for (const skill of catalog.listSkills()) {
      if (!learned.has(skill.code) || skill.category !== 'PASSIVE') continue;
      if (skill.linhCan !== session.linhCan && skill.linhCan !== 'COMMON') continue;
      for (const key of Object.keys(modifiers)) {
        const value = Number(skill.passiveModifiers?.[key] || 0);
        if (Number.isFinite(value) && value > 0) modifiers[key] += value;
      }
    }
    return modifiers;
  }

  function skillCooldownMs(session, skill, passive) {
    const reduction = Math.min(0.6, passive.cooldownPct + buffPercent(currentBuffs(session), 'buff_cast'));
    return Math.max(500, Math.round(Number(skill.hoiChieu || 0) * 1000 * (1 - reduction)));
  }

  function activeStatus(monster, type, now = Date.now()) {
    return (monster.statusEffects || []).find((effect) => effect.type === type && effect.expiresAt > now);
  }

  function applyMonsterStatus(monster, skill, passive, socket) {
    const type = String(skill?.effect || '').toLowerCase();
    if (!MONSTER_EFFECTS.has(type) || monster.dead) return;
    const now = Date.now();
    const duration = Number(skill.thoiGianBuff ?? 4);
    const value = Number(skill.effectVal || 0);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(value)) return;
    const effect = {
      type,
      value: Math.max(0, value) * (1 + passive.statusEffectPct),
      expiresAt: now + duration * 1000,
      nextTickAt: now + 1000,
    };
    if (type === 'burn') burnSources.set(effect, { userId: socket.auth.sub, socketId: socket.id });
    monster.statusEffects = (monster.statusEffects || []).filter((entry) => entry.type !== type && entry.expiresAt > now);
    monster.statusEffects.push(effect);
  }

  function cooldown(session, key, duration) {
    const now = Date.now();
    const expiresAt = Number(session.cooldowns.get(key) || 0);
    if (expiresAt > now) throw new DomainError('COOLDOWN_ACTIVE', 'Kỹ năng đang hồi chiêu', 409, { remainingMs: expiresAt - now });
    const claimedUntil = now + duration;
    session.cooldowns.set(key, claimedUntil);
    return () => {
      if (session.cooldowns.get(key) === claimedUntil) session.cooldowns.delete(key);
    };
  }

  function skillByCode(skillCode) {
    const skill = catalog.listSkills().find((entry) => entry.code === skillCode);
    if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Kỹ năng không tồn tại', 404);
    return skill;
  }

  function requirePlayerSkill(session, skillCode) {
    const skill = skillByCode(skillCode);
    if (!(session.learnedSkills || []).includes(skillCode)) throw new DomainError('SKILL_NOT_LEARNED', 'Nhân vật chưa học kỹ năng này', 409);
    if (!(session.equippedSkills || []).includes(skillCode)) throw new DomainError('SKILL_NOT_EQUIPPED', 'Kỹ năng chưa được trang bị', 409);
    if (skill.linhCan !== 'COMMON' && skill.linhCan !== session.linhCan) throw new DomainError('SKILL_ROOT_MISMATCH', 'Kỹ năng không thuộc linh căn nhân vật', 403);
    return skill;
  }

  function damageFor(session, monster, skill, passive, secondary) {
    const derived = session.derivedStats || deriveStats(session.stats || {}, session.equipment || {});
    const magic = String(skill?.type || '').toUpperCase() === 'MAGIC';
    const attack = magic ? derived.mAtk : derived.pAtk;
    const scaling = magic ? Number(session.stats?.ene || 0) : Number(session.stats?.str || 0);
    const buffs = currentBuffs(session);
    const rootDamageBonus = skill?.linhCan === session.linhCan ? passive.skillDamagePct : 0;
    const multiplier = skill ? Math.max(0.1, Number(skill.satThuong || 0)) * (1 + rootDamageBonus) : 1;
    const defense = Math.max(0, Number(monster.def || 0) * 2)
      * (activeStatus(monster, 'armor_break') ? 0.75 : 1)
      * (magic ? 1 : 1 - Math.min(0.75, passive.pDefPenPct));
    const raw = (attack * (skill ? 1.25 : 0.5) + scaling * (skill ? 1.5 : 0.5)) * multiplier;
    const curseBonus = session.linhCan === 'AM' && activeStatus(monster, 'curse') ? 1.08 : 1;
    const areaMultiplier = secondary ? BALANCE.damage.areaSecondaryMultiplier : 1;
    const attackBuff = skill ? 1 : 1 + buffPercent(buffs, 'buff_atk');
    let damage = Math.floor(mitigateDamage(raw * curseBonus * attackBuff * areaMultiplier, defense));
    const critical = Math.random() < Math.max(0, Math.min(0.5, Number(derived.crit || 0) + buffPercent(buffs, 'buff_crit') + passive.critPct));
    if (critical) damage = Math.floor(damage * 1.5);
    return { damage: Math.max(1, damage), critical };
  }

  function spawnLoot(mapCode, monster) {
    const table = catalog.getLootTableById(monster.lootTableId);
    const items = catalog.listItems();
    const drops = [];
    for (const entry of table) {
      if (Math.random() > Number(entry.chance || 0)) continue;
      const definition = items.find((item) => item.id === entry.itemId || item.maDo === entry.itemId);
      if (!definition) continue;
      const minimum = Math.max(1, Math.floor(Number(entry.min || 1)));
      const maximum = Math.max(minimum, Math.floor(Number(entry.max || minimum)));
      const count = crypto.randomInt(minimum, maximum + 1);
      const drop = runtime.addDrop(mapCode, {
        kind: 'item',
        itemCode: definition.id,
        item: { ...definition, id: definition.id, itemCode: definition.id },
        count,
        x: monster.x,
        y: monster.y,
        expiresAt: Date.now() + DROP_TTL_MS,
      });
      if (drop) drops.push(drop);
    }
    if (drops.length) io.to(roomName(mapCode)).emit('ground_loot_spawn', { drops });
    return drops;
  }

  async function rewardKill(mapCode, monster, userId, socketId) {
    io.to(roomName(mapCode)).emit('monster_death', { id: monster.id });
    const drops = spawnLoot(mapCode, monster);
    let questState = null;
    try {
      questState = await quests.applyEvent(userId, `evt_${crypto.randomUUID()}`, { type: 'monster_kill', monsterId: monster.templateId, count: 1 });
      if (questState.changed) io.to(socketId).emit('quest_state_update', questState);
    } catch { questState = null; }
    return { drops, questState };
  }

  async function withMonsterLock(key, action) {
    const previous = monsterLocks.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const queued = previous.catch(() => {}).then(() => gate);
    monsterLocks.set(key, queued);
    await previous.catch(() => {});
    try { return await action(); }
    finally {
      release();
      if (monsterLocks.get(key) === queued) monsterLocks.delete(key);
    }
  }

  async function combatAttack(socket, payload, requestId) {
    const session = requireSession(socket);
    await syncPlayerState(session);
    if (payload.mapCode != null && String(payload.mapCode).toLowerCase() !== session.mapCode) throw new DomainError('PLAYER_STATE_CHANGED', 'Bản đồ hiện tại không khớp', 409);
    const targetId = typeof payload.targetId === 'string' ? payload.targetId : '';
    if (!targetId || targetId.length > 100) throw new DomainError('INVALID_TARGET', 'Mục tiêu không hợp lệ');
    const skill = payload.skillCode ? requirePlayerSkill(session, String(payload.skillCode)) : null;
    if (skill && Number(skill.satThuong || 0) <= 0) throw new DomainError('SKILL_REQUIRES_NO_TARGET', 'Kỹ năng này không dùng để tấn công mục tiêu', 409);
    const actionKey = skill ? `skill:${skill.code}` : 'basic';
    const passive = combatModifiers(session);
    const cooldownMs = skill ? skillCooldownMs(session, skill, passive) : 700;
    const mapCode = session.mapCode;
    return withMonsterLock(`combat:${mapCode}`, async () => {
      if (requireSession(socket) !== session) throw new DomainError('PLAYER_STATE_CHANGED', 'Phiên chơi đã đổi bản đồ', 409);
      const monster = runtime.getMonster(mapCode, targetId);
      if (!monster || monster.dead) throw new DomainError('TARGET_NOT_FOUND', 'Mục tiêu không tồn tại hoặc đã bị hạ', 404);
      const range = skill ? Math.max(1, Number(skill.range || 5)) * SKILL_RANGE_SCALE : BASIC_ATTACK_RANGE;
      if (Math.hypot(monster.x - session.x, monster.y - session.y) > range) throw new DomainError('TARGET_OUT_OF_RANGE', 'Mục tiêu nằm ngoài tầm đánh', 409);
      const releaseCooldown = cooldown(session, actionKey, cooldownMs);

      let mp = Number(session.mp || 0);
      if (skill) {
        const mpCost = Math.max(0, Math.floor(Number(skill.mpTieuHao || 0)));
        try {
          const mutation = await store.updateVitals(socket.auth.sub, requestId, 'REALTIME_SKILL_ATTACK', { mpCost });
          session.mp = Number(mutation.result.mp);
          session.hp = Number(mutation.result.hp);
          mp = session.mp;
        } catch (error) {
          releaseCooldown();
          throw error;
        }
      }
      const targets = [monster];
      const areaRadius = Number(skill?.dienRong || 0) * SKILL_RANGE_SCALE;
      if (Number.isFinite(areaRadius) && areaRadius > 0) {
        const distance = (candidate) => Math.hypot(candidate.x - monster.x, candidate.y - monster.y);
        const nearby = runtime.listMonsters(mapCode)
          .filter((candidate) => candidate.id !== targetId && !candidate.dead && distance(candidate) <= areaRadius)
          .sort((left, right) => distance(left) - distance(right) || left.id.localeCompare(right.id))
          .slice(0, MAX_AREA_TARGETS - 1);
        for (const candidate of nearby) targets.push(runtime.getMonster(mapCode, candidate.id));
      }

      const hits = [];
      const updates = [];
      const killed = [];
      for (const [index, target] of targets.entries()) {
        if (!target || target.dead) continue;
        const hit = damageFor(session, target, skill, passive, index > 0);
        const updated = runtime.damageMonster(mapCode, target.id, hit.damage);
        if (!updated) continue;
        applyMonsterStatus(target, skill, passive, socket);
        updates.push({ ...updated, statusEffects: target.statusEffects || [] });
        hits.push({ targetId: target.id, ...hit, hp: updated.hp, maxHp: updated.maxHp, dead: updated.dead, miss: false });
        if (updated.dead) killed.push(target);
      }
      const combatPayload = {
        attackerId: socket.id,
        targetId,
        skillCode: skill?.code,
        skillName: skill?.name,
        mp,
        cooldownMs,
        gcdMs: 350,
        hits,
      };
      io.to(roomName(mapCode)).emit('combat_result', combatPayload);
      io.to(roomName(mapCode)).emit('monster_update', { monsters: updates });
      const drops = [];
      let questState = null;
      for (const target of killed) {
        const reward = await rewardKill(mapCode, target, socket.auth.sub, socket.id);
        drops.push(...reward.drops);
        if (reward.questState) questState = reward.questState;
      }
      return { ...combatPayload, drops, questState };
    });
  }

  async function castSkill(socket, payload, requestId) {
    const session = requireSession(socket);
    await syncPlayerState(session);
    const skillCode = typeof payload.skillCode === 'string' ? payload.skillCode.trim() : '';
    const skill = requirePlayerSkill(session, skillCode);
    if (Number(skill.satThuong || 0) > 0) throw new DomainError('SKILL_REQUIRES_TARGET', 'Kỹ năng tấn công cần chọn mục tiêu', 409);
    const actionKey = `skill:${skill.code}`;
    const cooldownMs = skillCooldownMs(session, skill, combatModifiers(session));
    const mpCost = Math.max(0, Math.floor(Number(skill.mpTieuHao || 0)));
    const effect = String(skill.effect || '').toLowerCase();
    const effectValue = Math.max(0, Number(skill.effectVal || 0));
    const durationMs = Math.max(0, Number(skill.thoiGianBuff || 0) * 1000);
    const before = { hp: session.hp, mp: session.mp };
    const changes = {
      mpCost,
      hp: effect === 'heal' ? effectValue : 0,
      mp: effect === 'restore_mp' ? effectValue : 0,
    };
    return withMonsterLock(`cooldown:${socket.id}:${actionKey}`, async () => {
      const releaseCooldown = cooldown(session, actionKey, cooldownMs);
      let mutation;
      try { mutation = await store.updateVitals(socket.auth.sub, requestId, 'REALTIME_SKILL_CAST', changes); }
      catch (error) { releaseCooldown(); throw error; }
      session.hp = Number(mutation.result.hp);
      session.mp = Number(mutation.result.mp);
      const buffs = currentBuffs(session);
      const heal = Math.max(0, session.hp - before.hp);
      const mpRestore = Math.max(0, session.mp - (before.mp - mpCost));
      if (effect.startsWith('buff_') || ['shield', 'buff_def', 'buff_atk', 'buff_crit', 'buff_spd', 'buff_cast', 'buff_hp_regen', 'buff_mp_regen', 'buff_vitals'].includes(effect)) {
        buffs[effect] = { value: effectValue, expiresAt: Date.now() + durationMs };
      }
      const result = {
        skillCode,
        skillName: skill.name,
        effect,
        effectVal: effectValue,
        effectDurationMs: durationMs,
        hp: session.hp,
        maxHp: session.maxHp,
        mp: session.mp,
        maxMp: session.maxMp,
        heal,
        mpRestore,
        buffs: { ...buffs },
        cooldownMs,
        gcdMs: 350,
      };
      socket.emit('skill_result', result);
      socket.to(roomName(session.mapCode)).emit('player_skill_cast', { playerId: socket.id, skillCode, skillName: skill.name, effect });
      return result;
    });
  }

  async function pickup(socket, payload, requestId) {
    const session = requireSession(socket);
    const dropId = typeof payload.itemId === 'string' ? payload.itemId.trim() : '';
    if (!dropId || dropId.length > 100) throw new DomainError('INVALID_DROP_ID', 'Mã vật phẩm rơi không hợp lệ');
    const drop = runtime.getDrop(session.mapCode, dropId);
    if (!drop || drop.expiresAt <= Date.now()) throw new DomainError('LOOT_NOT_FOUND', 'Vật phẩm rơi không còn tồn tại', 404);
    if (Math.hypot(drop.x - session.x, drop.y - session.y) > PICKUP_RANGE) throw new DomainError('LOOT_OUT_OF_RANGE', 'Vật phẩm rơi nằm ngoài tầm nhặt', 409);
    const mutation = await store.pickupGroundItem(socket.auth.sub, requestId, drop.id, drop.itemCode, drop.count);
    const player = players.decorate(mutation.player);
    if (!runtime.removeDrop(session.mapCode, drop.id)) throw new DomainError('LOOT_ALREADY_CLAIMED', 'Vật phẩm rơi đã được nhặt', 409);
    const item = { ...drop, item: { ...drop.item } };
    io.to(roomName(session.mapCode)).emit('ground_loot_removed', { itemId: drop.id });
    socket.emit('ground_loot_picked', { item, player, loot: { items: [{ ...drop.item, count: drop.count }] } });
    let questState = null;
    try { questState = await publishQuestEvent(socket, { type: 'collect_item', itemId: drop.itemCode, count: drop.count }); }
    catch { /* The inventory commit is authoritative even if quest progress needs a retry. */ }
    runtime.updatePlayer(session.mapCode, socket.id, { ...player, x: session.x, y: session.y, mapCode: session.mapCode, buffs: session.buffs, cooldowns: session.cooldowns });
    return { accepted: true, dropId: drop.id, player, questState };
  }

  function sendChat(socket, payload) {
    const session = requireSession(socket);
    if (typeof payload.message !== 'string') throw new DomainError('INVALID_CHAT_MESSAGE', 'Tin nhắn phải là chuỗi văn bản');
    const message = [...payload.message.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, 100).join('');
    if (!message) throw new DomainError('INVALID_CHAT_MESSAGE', 'Tin nhắn không được để trống');
    const now = Date.now();
    if (now - Number(session.lastChatAt || 0) < 750) throw new DomainError('CHAT_RATE_LIMITED', 'Bạn gửi tin nhắn quá nhanh', 429);
    session.lastChatAt = now;
    const chat = { id: socket.id, username: session.name || socket.auth.username, message, mapCode: session.mapCode, time: now };
    io.to(roomName(session.mapCode)).emit('chat_message', chat);
    return chat;
  }

  async function dispatch(socket, command, payload, requestId) {
    if (command === 'world.join') return join(socket, payload);
    if (command === 'world.resync') return join(socket, payload, true);
    if (command === 'movement.intent') return movement(socket, payload);
    if (command === 'map.change') return changeMap(socket, payload);
    if (command === 'combat.attack') return combatAttack(socket, payload, requestId);
    if (command === 'combat.skill') return castSkill(socket, payload, requestId);
    if (command === 'loot.pickup') return pickup(socket, payload, requestId);
    if (command === 'chat.send') return sendChat(socket, payload);
    throw new DomainError('INVALID_COMMAND', 'Command không được hỗ trợ');
  }

  async function command(socket, envelope) {
    if (stopping) throw new DomainError('SERVER_SHUTTING_DOWN', 'Máy chủ đang tắt, hãy kết nối lại sau', 503);
    const requestId = typeof envelope?.requestId === 'string' ? envelope.requestId.trim() : '';
    const commandName = typeof envelope?.type === 'string' ? envelope.type : '';
    validateRequestId(requestId);
    const payload = requirePayload(envelope?.payload ?? {});
    const run = () => dispatch(socket, commandName, payload, requestId);
    const changesSession = ['world.join', 'world.resync', 'map.change', 'combat.attack', 'combat.skill', 'loot.pickup'].includes(commandName);
    const execute = () => track(changesSession ? withMonsterLock(`session:${socket.id}`, run) : run());
    const shouldCache = ['map.change', 'combat.attack', 'combat.skill', 'loot.pickup', 'chat.send'].includes(commandName);
    if (!shouldCache) return { requestId, command: commandName, result: await execute() };

    const cacheKey = `${socket.auth.sub}:${requestId}`;
    const signature = JSON.stringify({ command: commandName, payload });
    const prior = commandResults.get(cacheKey);
    if (prior) {
      if (prior.signature !== signature) throw new DomainError('IDEMPOTENCY_CONFLICT', 'requestId đã được dùng cho một yêu cầu khác', 409);
      return { requestId, command: commandName, result: await prior.promise };
    }
    const promise = execute();
    commandResults.set(cacheKey, { signature, promise });
    if (commandResults.size > 5000) commandResults.delete(commandResults.keys().next().value);
    try { return { requestId, command: commandName, result: await promise }; }
    catch (error) { commandResults.delete(cacheKey); throw error; }
  }

  async function disconnectSession(socket) {
    const mapCode = socket.data.mapCode;
    if (!mapCode) return;
    const session = runtime.getPlayer(mapCode, socket.id);
    if (session) {
      try { await persistPosition(session, true); } catch { /* keep the socket cleanup moving */ }
      runtime.leave(mapCode, socket.id);
      socket.to(roomName(mapCode)).emit('player_leave', { id: socket.id });
    }
    socket.data.mapCode = null;
  }

  function disconnect(socket) { return track(disconnectSession(socket)); }

  function stop() {
    stopping = true;
    clearInterval(runtimeTimer);
  }

  function broadcastMonsterCatalog(id) {
    for (const update of runtime.syncMonsterCatalog(id)) {
      for (let start = 0; start < update.monsters.length; start += MONSTER_UPDATE_BATCH_SIZE) {
        (io.local || io).to(roomName(update.mapCode)).emit("monster_update", { monsters: update.monsters.slice(start, start + MONSTER_UPDATE_BATCH_SIZE) });
      }
    }
  }

  function catalogChanged(collection, id, saved) {
    if (collection === "monsters") {
      monsterCatalogRevision = catalog.getMonsterRevision();
      broadcastMonsterCatalog(id);
    } else if (collection === "items") {
      const item = saved.deleted ? null : saved.data;
      for (const room of runtime.activeRooms()) {
        for (const player of room.players.values()) {
          const slots = Object.entries(player.equipment || {});
          const matches = (entry) => (typeof entry === "string" ? entry : entry?.itemCode || entry?.id) === id;
          if (!slots.some(([, entry]) => matches(entry))) continue;
          player.equipment = Object.fromEntries(slots.map(([slot, entry]) => [slot, matches(entry) ? { ...item, id, itemCode: id } : entry]));
          player.derivedStats = deriveStats(player.stats || {}, player.equipment);
        }
      }
      (io.local || io).emit("item_catalog_changed", { id, item });
    }
  }

  return { command, disconnect, runtime, stop, drain, catalogChanged, close: async () => { stop(); await drain(); } };
}

module.exports = { createGameplayService };

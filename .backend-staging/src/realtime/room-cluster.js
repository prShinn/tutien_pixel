const crypto = require('node:crypto');
const Redis = require('ioredis');
const { DomainError } = require('../domain');

const PREFIX = 'tu-tien:runtime:v1';
const RPC_CHANNEL = `${PREFIX}:rpc`;
const LEASE_TTL_MS = 5000;
const RPC_TIMEOUT_MS = 7000;
const SESSION_TTL_SECONDS = 86400;
const COMMAND_TTL_SECONDS = 21600;

const ACQUIRE_LEASE = `
  local current = redis.call('GET', KEYS[1])
  if current then return current end
  local epoch = redis.call('INCR', KEYS[2])
  local token = ARGV[1] .. '|' .. epoch
  redis.call('SET', KEYS[1], token, 'PX', ARGV[2])
  return token
`;
const RENEW_LEASE = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
`;
const RELEASE_LEASE = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  return redis.call('DEL', KEYS[1])
`;
const SAVE_SNAPSHOT = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[2], ARGV[2])
  return 1
`;

const ADMIT_REQUEST = `
  local raw = redis.call('GET', KEYS[1])
  if not raw then
    local record = cjson.encode({ status = 'running', signature = ARGV[1], ownerToken = ARGV[2] })
    redis.call('SET', KEYS[1], record, 'EX', ARGV[3])
    return { 'new', '' }
  end
  local record = cjson.decode(raw)
  if record.signature ~= ARGV[1] then return { 'conflict', '' } end
  if record.status == 'complete' then return { 'complete', record.value } end
  if record.ownerToken ~= ARGV[2] then return { 'unknown', '' } end
  return { 'in_flight', '' }
`;
const COMPLETE_REQUEST = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  local raw = redis.call('GET', KEYS[2])
  if not raw then return 0 end
  local record = cjson.decode(raw)
  if record.ownerToken ~= ARGV[1] then return 0 end
  record.status = 'complete'
  record.value = ARGV[2]
  redis.call('SET', KEYS[2], cjson.encode(record), 'EX', ARGV[3])
  return 1
`;

function createRoomCluster({ io, redisUrl, players, world, clientFactory } = {}) {
  const enabled = Boolean(redisUrl);
  if (!enabled) {
    return {
      enabled: false,
      bind() {},
      async start() {},
      async command(_socket, _envelope, _mapCode, runLocal) { return runLocal(); },
      async executeOnMap(_socket, _mapCode, _envelope, runLocal) { return runLocal(); },
      async disconnect(_socket, runLocal) { return runLocal(); },
      async mapForSocket(socketId, fallback) { return fallback || null; },
      async saveTransfer() {},
      async takeTransfer() { return null; },
      isOwner() { return true; },
      async owns() { return true; },
      markDirty() {},
      async healthCheck() { return false; },
      async close() {},
    };
  }

  const nodeId = crypto.randomUUID();
  const makeClient = clientFactory || ((url, role) => new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectionName: `tu-tien-runtime-${role}-${nodeId.slice(0, 8)}`,
  }));
  const publisher = makeClient(redisUrl, 'publisher');
  const requestSubscriber = makeClient(redisUrl, 'request-subscriber');
  const responseSubscriber = makeClient(redisUrl, 'response-subscriber');
  let lastRedisErrorAt = 0;
  for (const [role, client] of [['publisher', publisher], ['request-subscriber', requestSubscriber], ['response-subscriber', responseSubscriber]]) {
    client.on('error', () => {
      const now = Date.now();
      if (now - lastRedisErrorAt < 30000) return;
      lastRedisErrorAt = now;
      process.stderr.write(`${JSON.stringify({ level: 'error', event: 'runtime_redis_connection_error', client: role })}\n`);
    });
  }
  const responseChannel = `${PREFIX}:response:${nodeId}`;
  const owned = new Map();
  const dirtyRooms = new Set();
  const pending = new Map();
  const pendingCommands = new Map();
  let runtime = null;
  let commandHandler = null;
  let disconnectHandler = null;
  let started = false;
  let closed = false;
  let maintenanceRunning = false;
  let maintenanceTimer = null;

  const leaseKey = (mapCode) => `${PREFIX}:owner:${mapCode}`;
  const epochKey = (mapCode) => `${PREFIX}:epoch:${mapCode}`;
  const snapshotKey = (mapCode) => `${PREFIX}:snapshot:${mapCode}`;
  const socketMapKey = (socketId) => `${PREFIX}:socket:${socketId}`;
  const userSessionKey = (userId) => `${PREFIX}:user:${userId}`;
  const roomUsersKey = (mapCode) => `${PREFIX}:users:${mapCode}`;
  const transferKey = (socketId) => `${PREFIX}:transfer:${socketId}`;
  const commandKey = (userId, requestId) => `${PREFIX}:command:${userId}:${requestId}`;

  function bind(gameplay) {
    runtime = gameplay.runtime;
    commandHandler = gameplay.commandLocal;
    disconnectHandler = gameplay.disconnectLocal;
  }

  function parseJson(value) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function normalizeMapCode(mapCode) {
    return typeof mapCode === 'string' ? mapCode.trim().toLowerCase() : '';
  }

  function roomOwnerNode(token) { return String(token || '').split('|', 1)[0]; }

  function socketProxy(state) {
    const socket = {
      id: state.id,
      auth: state.auth || {},
      data: { ...(state.data || {}) },
      emit(event, payload) { io.to(state.id).emit(event, payload); },
      to(room) {
        return { emit(event, payload) { io.to(room).except(state.id).emit(event, payload); } };
      },
      async join(room) {
        await io.in(state.id).socketsJoin(room);
        socket.data.joinedRoom = room;
      },
      async leave(room) {
        await io.in(state.id).socketsLeave(room);
        if (socket.data.joinedRoom === room) socket.data.joinedRoom = null;
      },
      disconnect(close) { io.in(state.id).disconnectSockets(Boolean(close)); },
    };
    return socket;
  }

  function publicError(error) {
    return {
      code: error?.code || 'ROOM_OWNER_ERROR',
      message: error?.message || 'Không thể xử lý lệnh trên máy chủ bản đồ',
      status: Number(error?.status) || 503,
      details: error?.details,
    };
  }

  function remoteError(value) {
    return new DomainError(value?.code || 'ROOM_OWNER_ERROR', value?.message || 'Không thể xử lý lệnh trên máy chủ bản đồ', value?.status || 503, value?.details);
  }

  async function connectClient(client) {
    if (client.status === 'ready') return;
    await client.connect();
  }

  async function start() {
    if (started) return;
    await Promise.all([publisher, requestSubscriber, responseSubscriber].map(connectClient));
    requestSubscriber.on('message', (_channel, raw) => { void receiveRequest(raw); });
    responseSubscriber.on('message', (_channel, raw) => receiveResponse(raw));
    await Promise.all([
      requestSubscriber.subscribe(RPC_CHANNEL),
      responseSubscriber.subscribe(responseChannel),
    ]);
    maintenanceTimer = setInterval(() => { void maintainOwnership(); }, 1000);
    maintenanceTimer.unref?.();
    started = true;
  }

  function receiveResponse(raw) {
    let response;
    try { response = JSON.parse(raw); } catch { return; }
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    clearTimeout(waiter.timeout);
    if (response.ok) {
      if (response.socketData && waiter.socket?.data) Object.assign(waiter.socket.data, response.socketData);
      waiter.resolve(response.value);
    } else {
      waiter.reject(remoteError(response.error));
    }
  }

  async function publishResponse(channel, response) {
    await publisher.publish(channel, JSON.stringify(response));
  }

  async function receiveRequest(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || message.targetNode !== nodeId || !message.id || !message.responseChannel) return;
    try {
      const owner = await publisher.get(leaseKey(message.mapCode));
      if (owner !== message.ownerToken || roomOwnerNode(owner) !== nodeId) {
        throw new DomainError('ROOM_OWNER_MOVED', 'Quyền xử lý bản đồ đã chuyển sang máy chủ khác', 503);
      }
      if (!owned.has(message.mapCode) || owned.get(message.mapCode).token !== owner) {
        await prepareOwnedRoom(message.mapCode, owner);
      }
      if (!await owns(message.mapCode)) throw new DomainError('ROOM_OWNER_MOVED', 'Quyền xử lý bản đồ đã hết hạn', 503);
      const socket = socketProxy(message.socket);
      let value;
      if (message.operation === 'command') {
        if (!commandHandler) throw new DomainError('ROOM_OWNER_NOT_READY', 'Máy chủ bản đồ chưa sẵn sàng', 503);
        value = await runCachedCommand(socket, message.envelope, owner, message.mapCode, () => commandHandler(socket, message.envelope));
        if (!await owns(message.mapCode)) throw new DomainError('COMMAND_OUTCOME_UNKNOWN', 'Lệnh có thể đã được ghi nhận; hãy đồng bộ lại trạng thái', 409);
        await refreshSessionIndex(socket, message.envelope, value);
      } else if (message.operation === 'disconnect') {
        if (disconnectHandler) value = await disconnectHandler(socket);
        await clearSessionIndex(socket.auth.sub, socket.id, message.mapCode);
      } else {
        throw new DomainError('INVALID_ROOM_OPERATION', 'Thao tác runtime không hợp lệ');
      }
      dirtyRooms.add(message.mapCode);
      await publishResponse(message.responseChannel, { id: message.id, ok: true, value, socketData: socket.data });
    } catch (error) {
      await publishResponse(message.responseChannel, { id: message.id, ok: false, error: publicError(error) }).catch(() => {});
    }
  }

  function callOwner(ownerToken, mapCode, operation, socket, envelope) {
    const id = crypto.randomUUID();
    const message = {
      id,
      operation,
      mapCode,
      ownerToken,
      targetNode: roomOwnerNode(ownerToken),
      responseChannel,
      socket: { id: socket.id, auth: socket.auth, data: socket.data || {} },
      envelope,
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new DomainError('ROOM_OWNER_UNAVAILABLE', 'Máy chủ bản đồ không phản hồi, vui lòng kết nối lại', 503));
      }, RPC_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeout, socket });
      publisher.publish(RPC_CHANNEL, JSON.stringify(message)).catch((error) => {
        pending.delete(id);
        clearTimeout(timeout);
        reject(new DomainError('ROOM_CLUSTER_UNAVAILABLE', 'Không thể chuyển lệnh tới máy chủ bản đồ', 503, { cause: error.message }));
      });
    });
  }

  async function claim(mapCode) {
    return publisher.eval(ACQUIRE_LEASE, 2, leaseKey(mapCode), epochKey(mapCode), nodeId, LEASE_TTL_MS);
  }

  async function clearSessionIndex(userId, socketId, mapCode) {
    if (!userId || !socketId) return;
    const encoded = await publisher.get(userSessionKey(userId));
    const session = parseJson(encoded);
    if (session?.socketId !== socketId) return;
    await publisher.del(userSessionKey(userId));
    const indexedMap = await publisher.get(socketMapKey(socketId));
    if (indexedMap === mapCode) await publisher.del(socketMapKey(socketId));
    await publisher.srem(roomUsersKey(mapCode), String(userId));
  }

  async function prepareOwnedRoom(mapCode, ownerToken) {
    if (!runtime) throw new DomainError('ROOM_RUNTIME_NOT_READY', 'Runtime bản đồ chưa sẵn sàng', 503);
    if (await publisher.get(leaseKey(mapCode)) !== ownerToken) throw new DomainError('ROOM_OWNER_MOVED', 'Quyền xử lý bản đồ đã chuyển sang máy chủ khác', 503);
    const rawSnapshot = await publisher.get(snapshotKey(mapCode));
    runtime.restoreRoom(mapCode, parseJson(rawSnapshot));
    owned.set(mapCode, { token: ownerToken, checkedAt: Date.now(), savedAt: 0 });

    const userIds = await publisher.smembers(roomUsersKey(mapCode));
    for (const userId of userIds) {
      const session = parseJson(await publisher.get(userSessionKey(userId)));
      if (session?.mapCode === mapCode && session.socketId) {
        await publisher.del(userSessionKey(userId));
        await publisher.del(socketMapKey(session.socketId));
        io.in(session.socketId).disconnectSockets(true);
      }
      await publisher.srem(roomUsersKey(mapCode), userId);
    }
  }

  async function ensureOwner(mapCode) {
    const normalized = normalizeMapCode(mapCode);
    if (!normalized || !world.getByCode(normalized)) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ không tồn tại hoặc chưa publish', 404);
    if (closed) throw new DomainError('SERVER_SHUTTING_DOWN', 'Máy chủ đang tắt, hãy kết nối lại sau', 503);
    const current = await publisher.get(leaseKey(normalized));
    const token = current || await claim(normalized);
    if (!token) throw new DomainError('ROOM_OWNER_UNAVAILABLE', 'Chưa xác định được máy chủ quản lý bản đồ', 503);
    if (roomOwnerNode(token) === nodeId) {
      const existing = owned.get(normalized);
      if (existing?.token !== token) await prepareOwnedRoom(normalized, token);
    }
    return { mapCode: normalized, token, nodeId: roomOwnerNode(token) };
  }

  async function owns(mapCode) {
    const normalized = normalizeMapCode(mapCode);
    const local = owned.get(normalized);
    if (!local) return false;
    try {
      const token = await publisher.get(leaseKey(normalized));
      if (token !== local.token) {
        owned.delete(normalized);
        dirtyRooms.delete(normalized);
        return false;
      }
      local.checkedAt = Date.now();
      return true;
    } catch {
      owned.delete(normalized);
      return false;
    }
  }

  async function refreshSessionIndex(socket, envelope, value) {
    const command = envelope?.type;
    const userId = socket.auth?.sub;
    if (!userId || !socket.id) return;
    if (['world.join', 'world.resync', 'map.change'].includes(command)) {
      const mapCode = normalizeMapCode(value?.result?.mapCode || value?.result?.player?.mapCode || socket.data.mapCode);
      if (!mapCode) return;
      const previousMap = await publisher.get(socketMapKey(socket.id));
      if (previousMap && previousMap !== mapCode) await publisher.srem(roomUsersKey(previousMap), String(userId));
      const session = JSON.stringify({ userId: String(userId), socketId: socket.id, username: socket.auth.username || '', mapCode });
      await Promise.all([
        publisher.set(socketMapKey(socket.id), mapCode, 'EX', SESSION_TTL_SECONDS),
        publisher.set(userSessionKey(userId), session, 'EX', SESSION_TTL_SECONDS),
        publisher.sadd(roomUsersKey(mapCode), String(userId)),
        publisher.expire(roomUsersKey(mapCode), SESSION_TTL_SECONDS),
      ]);
    } else {
      const mapCode = await publisher.get(socketMapKey(socket.id));
      if (!mapCode) return;
      await Promise.all([
        publisher.expire(socketMapKey(socket.id), SESSION_TTL_SECONDS),
        publisher.expire(userSessionKey(userId), SESSION_TTL_SECONDS),
      ]);
    }
  }

  async function removePriorUserSession(socket, targetMap) {
    const userId = socket.auth?.sub;
    const previous = parseJson(await publisher.get(userSessionKey(userId)));
    if (!previous?.socketId || (previous.socketId === socket.id && previous.mapCode === targetMap)) return;
    if (!world.getByCode(previous.mapCode)) {
      await clearSessionIndex(userId, previous.socketId, previous.mapCode);
      if (previous.socketId !== socket.id) io.in(previous.socketId).disconnectSockets(true);
      return;
    }
    const owner = await ensureOwner(previous.mapCode);
    const previousSocket = socketProxy({
      id: previous.socketId,
      auth: { sub: String(userId), username: previous.username || socket.auth.username || '' },
      data: { mapCode: previous.mapCode },
    });
    if (owner.nodeId === nodeId) {
      if (disconnectHandler) await disconnectHandler(previousSocket);
      await clearSessionIndex(userId, previous.socketId, previous.mapCode);
    } else {
      await callOwner(owner.token, previous.mapCode, 'disconnect', previousSocket, null);
    }
    if (previous.socketId !== socket.id) io.in(previous.socketId).disconnectSockets(true);
  }

  async function runOnOwner(socket, envelope, mapCode, runLocal) {
    const owner = await ensureOwner(mapCode);
    if (owner.nodeId !== nodeId) return callOwner(owner.token, owner.mapCode, 'command', socket, envelope);
    if (!await owns(owner.mapCode)) throw new DomainError('ROOM_OWNER_MOVED', 'Quyền xử lý bản đồ đã chuyển sang máy chủ khác', 503);
    const value = await runCachedCommand(socket, envelope, owner.token, owner.mapCode, runLocal);
    if (!await owns(owner.mapCode)) throw new DomainError('COMMAND_OUTCOME_UNKNOWN', 'Lệnh có thể đã được ghi nhận; hãy đồng bộ lại trạng thái trước khi thử lệnh khác', 409);
    await refreshSessionIndex(socket, envelope, value);
    dirtyRooms.add(owner.mapCode);
    return value;
  }

  async function runCachedCommand(socket, envelope, ownerToken, mapCode, runLocal) {
    const type = envelope?.type;
    if (!['map.change', 'combat.attack', 'combat.skill', 'loot.pickup', 'chat.send'].includes(type)) return runLocal();
    const userId = socket.auth?.sub;
    const requestId = typeof envelope?.requestId === 'string' ? envelope.requestId : '';
    if (!userId || !requestId) return runLocal();
    const key = commandKey(userId, requestId);
    const signature = JSON.stringify({ command: type, payload: envelope.payload || {} });
    const [state, stored] = await publisher.eval(ADMIT_REQUEST, 1, key, signature, ownerToken, COMMAND_TTL_SECONDS);
    if (state === 'conflict') throw new DomainError('IDEMPOTENCY_CONFLICT', 'requestId đã được dùng cho một yêu cầu khác', 409);
    if (state === 'unknown') throw new DomainError('COMMAND_OUTCOME_UNKNOWN', 'Lệnh trước có thể đã được xử lý khi máy chủ chuyển owner; hãy đồng bộ lại trạng thái', 409);
    if (state === 'complete') {
      const replay = parseJson(stored);
      if (replay?.__roomError) throw remoteError(replay.__roomError);
      return replay;
    }
    const existing = pendingCommands.get(key);
    if (existing) return existing;
    if (state === 'in_flight') throw new DomainError('COMMAND_IN_PROGRESS', 'Lệnh này đang được xử lý', 409);

    const promise = (async () => {
      try {
        const value = await runLocal();
        const saved = await publisher.eval(COMPLETE_REQUEST, 2, leaseKey(mapCode), key, ownerToken, JSON.stringify(value), COMMAND_TTL_SECONDS);
        if (Number(saved) !== 1) throw new DomainError('COMMAND_OUTCOME_UNKNOWN', 'Lệnh có thể đã được ghi nhận; hãy đồng bộ lại trạng thái', 409);
        return value;
      } catch (error) {
        if (error?.code === 'COMMAND_OUTCOME_UNKNOWN') throw error;
        const saved = await publisher.eval(COMPLETE_REQUEST, 2, leaseKey(mapCode), key, ownerToken, JSON.stringify({ __roomError: publicError(error) }), COMMAND_TTL_SECONDS);
        if (Number(saved) !== 1) throw new DomainError('COMMAND_OUTCOME_UNKNOWN', 'Lệnh có thể đã được ghi nhận; hãy đồng bộ lại trạng thái', 409);
        throw error;
      }
    })();
    pendingCommands.set(key, promise);
    try { return await promise; }
    finally { pendingCommands.delete(key); }
  }

  async function command(socket, envelope, mapCode, runLocal) {
    const normalized = normalizeMapCode(mapCode);
    if (envelope?.type === 'world.join') await removePriorUserSession(socket, normalized);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { return await runOnOwner(socket, envelope, normalized, runLocal); }
      catch (error) {
        if (error?.code !== 'ROOM_OWNER_MOVED' || attempt > 0) throw error;
      }
    }
    throw new DomainError('ROOM_OWNER_UNAVAILABLE', 'Không tìm thấy máy chủ quản lý bản đồ', 503);
  }

  async function executeOnMap(socket, mapCode, envelope, runLocal) {
    return command(socket, envelope, mapCode, runLocal);
  }

  async function disconnect(socket, runLocal) {
    const mapCode = normalizeMapCode(await publisher.get(socketMapKey(socket.id)) || socket.data?.mapCode);
    if (!mapCode) return runLocal();
    const owner = await ensureOwner(mapCode);
    let value;
    if (owner.nodeId === nodeId) {
      value = await disconnectHandler(socket);
      await clearSessionIndex(socket.auth?.sub, socket.id, mapCode);
      dirtyRooms.add(mapCode);
    } else {
      value = await callOwner(owner.token, mapCode, 'disconnect', socket, null);
    }
    return value;
  }

  async function mapForSocket(socketId, fallback) {
    return await publisher.get(socketMapKey(socketId)) || normalizeMapCode(fallback) || null;
  }

  async function saveTransfer(socketId, mapCode, state) {
    const value = {
      mapCode: normalizeMapCode(mapCode),
      buffs: state?.buffs || {},
      cooldowns: [...(state?.cooldowns instanceof Map ? state.cooldowns : new Map())],
    };
    await publisher.set(transferKey(socketId), JSON.stringify(value), 'EX', 30);
  }

  async function takeTransfer(socketId, mapCode) {
    const key = transferKey(socketId);
    const value = parseJson(await publisher.get(key));
    if (!value) return null;
    await publisher.del(key);
    if (value.mapCode !== normalizeMapCode(mapCode)) return null;
    return { buffs: value.buffs || {}, cooldowns: new Map(value.cooldowns || []) };
  }

  async function persistRoom(mapCode, owner) {
    if (!runtime || !owner || await publisher.get(leaseKey(mapCode)) !== owner.token) return false;
    const snapshot = runtime.exportRoom(mapCode);
    if (!snapshot) return false;
    const result = await publisher.eval(SAVE_SNAPSHOT, 2, leaseKey(mapCode), snapshotKey(mapCode), owner.token, JSON.stringify(snapshot));
    if (Number(result) === 1) {
      owner.savedAt = Date.now();
      dirtyRooms.delete(mapCode);
      return true;
    }
    owned.delete(mapCode);
    return false;
  }

  async function maintainOwnership() {
    if (!started || closed || maintenanceRunning) return;
    maintenanceRunning = true;
    try {
      for (const [mapCode, owner] of [...owned]) {
        try {
          const renewed = await publisher.eval(RENEW_LEASE, 1, leaseKey(mapCode), owner.token, LEASE_TTL_MS);
          if (Number(renewed) !== 1) {
            owned.delete(mapCode);
            dirtyRooms.delete(mapCode);
            continue;
          }
          owner.checkedAt = Date.now();
          if (dirtyRooms.has(mapCode) || Date.now() - owner.savedAt >= 1000) await persistRoom(mapCode, owner);
        } catch {
          owned.delete(mapCode);
          dirtyRooms.delete(mapCode);
        }
      }
    } finally {
      maintenanceRunning = false;
    }
  }

  async function healthCheck() {
    const values = await Promise.all([publisher.ping(), requestSubscriber.ping(), responseSubscriber.ping()]);
    return values.every((value) => value === 'PONG');
  }

  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(maintenanceTimer);
    await Promise.allSettled([...owned].map(async ([mapCode, owner]) => {
      await persistRoom(mapCode, owner);
      await publisher.eval(RELEASE_LEASE, 1, leaseKey(mapCode), owner.token);
    }));
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new DomainError('SERVER_SHUTTING_DOWN', 'Máy chủ đang tắt', 503));
    }
    pending.clear();
    await Promise.allSettled([publisher, requestSubscriber, responseSubscriber].map(async (client) => {
      if (client.status === 'ready') await client.quit();
      else client.disconnect();
    }));
  }

  return {
    enabled: true,
    nodeId,
    bind,
    start,
    command,
    executeOnMap,
    disconnect,
    mapForSocket,
    saveTransfer,
    takeTransfer,
    isOwner(mapCode) { return owned.has(normalizeMapCode(mapCode)); },
    owns,
    markDirty(mapCode) { if (owned.has(normalizeMapCode(mapCode))) dirtyRooms.add(normalizeMapCode(mapCode)); },
    healthCheck,
    close,
  };
}

module.exports = { createRoomCluster, ACQUIRE_LEASE, RENEW_LEASE, RELEASE_LEASE, SAVE_SNAPSHOT, ADMIT_REQUEST, COMPLETE_REQUEST };

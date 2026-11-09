const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  createRoomCluster,
  ACQUIRE_LEASE,
  RENEW_LEASE,
  RELEASE_LEASE,
  SAVE_SNAPSHOT,
  ADMIT_REQUEST,
  COMPLETE_REQUEST,
} = require('../src/realtime/room-cluster');

class FakeRedis extends EventEmitter {
  constructor(shared) {
    super();
    this.shared = shared;
    this.status = 'wait';
    this.channels = new Set();
  }

  async connect() { this.status = 'ready'; }
  async subscribe(channel) { this.channels.add(channel); return 1; }
  async get(key) { return this.shared.values.get(key) ?? null; }
  async set(key, value, ...args) {
    this.shared.values.set(key, String(value));
    const ex = args.indexOf('EX');
    if (ex >= 0) this.shared.expirations.set(key, Number(args[ex + 1]));
    return 'OK';
  }
  async del(key) {
    this.shared.values.delete(key);
    this.shared.sets.delete(key);
    return 1;
  }
  async sadd(key, value) {
    if (!this.shared.sets.has(key)) this.shared.sets.set(key, new Set());
    this.shared.sets.get(key).add(String(value));
    return 1;
  }
  async srem(key, value) { return this.shared.sets.get(key)?.delete(String(value)) ? 1 : 0; }
  async smembers(key) { return [...(this.shared.sets.get(key) || [])]; }
  async expire() { return 1; }
  async ping() { return 'PONG'; }
  async publish(channel, message) {
    queueMicrotask(() => {
      for (const client of this.shared.clients) if (client.channels.has(channel)) client.emit('message', channel, message);
    });
    return 1;
  }
  async eval(script, numberOfKeys, ...args) {
    const keys = args.slice(0, numberOfKeys);
    const values = args.slice(numberOfKeys);
    if (script === ACQUIRE_LEASE) {
      const current = this.shared.values.get(keys[0]);
      if (current) return current;
      const epoch = Number(this.shared.values.get(keys[1]) || 0) + 1;
      this.shared.values.set(keys[1], String(epoch));
      const token = `${values[0]}|${epoch}`;
      this.shared.values.set(keys[0], token);
      return token;
    }
    if (script === RENEW_LEASE) return this.shared.values.get(keys[0]) === values[0] ? 1 : 0;
    if (script === RELEASE_LEASE) {
      if (this.shared.values.get(keys[0]) !== values[0]) return 0;
      this.shared.values.delete(keys[0]);
      return 1;
    }
    if (script === SAVE_SNAPSHOT) {
      if (this.shared.values.get(keys[0]) !== values[0]) return 0;
      this.shared.values.set(keys[1], values[1]);
      return 1;
    }
    if (script === ADMIT_REQUEST) {
      const raw = this.shared.values.get(keys[0]);
      if (!raw) {
        this.shared.values.set(keys[0], JSON.stringify({ status: 'running', signature: values[0], ownerToken: values[1] }));
        return ['new', ''];
      }
      const record = JSON.parse(raw);
      if (record.signature !== values[0]) return ['conflict', ''];
      if (record.status === 'complete') return ['complete', record.value];
      if (record.ownerToken !== values[1]) return ['unknown', ''];
      return ['in_flight', ''];
    }
    if (script === COMPLETE_REQUEST) {
      if (this.shared.values.get(keys[0]) !== values[0]) return 0;
      const record = JSON.parse(this.shared.values.get(keys[1]));
      if (record.ownerToken !== values[0]) return 0;
      record.status = 'complete';
      record.value = values[1];
      this.shared.values.set(keys[1], JSON.stringify(record));
      return 1;
    }
    throw new Error('Unexpected Redis script');
  }
  async quit() { this.status = 'end'; this.channels.clear(); this.shared.clients.delete(this); }
  disconnect() { this.status = 'end'; this.channels.clear(); this.shared.clients.delete(this); }
}

function makeSharedRedis() {
  const shared = { values: new Map(), sets: new Map(), expirations: new Map(), clients: new Set() };
  return {
    shared,
    clientFactory() {
      return (url, role) => {
        const client = new FakeRedis(shared);
        client.role = role;
        shared.clients.add(client);
        return client;
      };
    },
  };
}

function makeIo() {
  return {
    to() { return { emit() {}, except() { return this; } }; },
    in() { return { async socketsJoin() {}, async socketsLeave() {}, disconnectSockets() {} }; },
  };
}

test('commands execute on one map owner across nodes and the lease can move to another node', async (t) => {
  const redis = makeSharedRedis();
  const map = { code: 'field', version: 1 };
  const world = { getByCode: (code) => code === map.code ? map : null };
  const makeRuntime = () => ({
    restored: [],
    restoreRoom(code, snapshot) { this.restored.push({ code, snapshot }); },
    exportRoom(code) { return { mapCode: code, mapVersion: 1, monsters: [], groundItems: [], players: [] }; },
  });
  const io = makeIo();
  const first = createRoomCluster({ io, redisUrl: 'redis://test', world, clientFactory: redis.clientFactory() });
  const second = createRoomCluster({ io, redisUrl: 'redis://test', world, clientFactory: redis.clientFactory() });
  const firstRuntime = makeRuntime();
  const secondRuntime = makeRuntime();
  let ownerExecutions = 0;
  const command = async (socket, envelope) => {
    ownerExecutions += 1;
    socket.data.mapCode = 'field';
    return { requestId: envelope.requestId, command: envelope.type, result: { mapCode: 'field' } };
  };
  const disconnect = async () => {};
  first.bind({ runtime: firstRuntime, commandLocal: command, disconnectLocal: disconnect });
  second.bind({ runtime: secondRuntime, commandLocal: command, disconnectLocal: disconnect });
  await Promise.all([first.start(), second.start()]);
  t.after(async () => { await Promise.allSettled([first.close(), second.close()]); });

  const initialSocket = { id: 'socket_a', auth: { sub: 'user_a', username: 'a' }, data: {} };
  await first.command(initialSocket, { requestId: 'join-req-001', type: 'world.join', payload: {} }, 'field', async () => command(initialSocket, { requestId: 'join-req-001', type: 'world.join' }));

  const routedSocket = { id: 'socket_b', auth: { sub: 'user_b', username: 'b' }, data: {} };
  const response = await second.command(routedSocket, { requestId: 'join-req-002', type: 'world.join', payload: {} }, 'field', async () => assert.fail('non-owner must route the command'));
  assert.equal(ownerExecutions, 2);
  assert.equal(response.result.mapCode, 'field');
  assert.equal(routedSocket.data.mapCode, 'field');

  const attackEnvelope = { requestId: 'attack_req_001', type: 'combat.attack', payload: { targetId: 'mob_1' } };
  const attack = await second.command(routedSocket, attackEnvelope, 'field', async () => assert.fail('non-owner must route the command'));
  const replay = await second.command(routedSocket, attackEnvelope, 'field', async () => assert.fail('completed command must replay from Redis'));
  assert.deepEqual(replay, attack);
  assert.equal(ownerExecutions, 3);

  await first.close();
  const afterTakeover = { id: 'socket_c', auth: { sub: 'user_c', username: 'c' }, data: {} };
  await second.command(afterTakeover, { requestId: 'join-req-003', type: 'world.join', payload: {} }, 'field', async () => command(afterTakeover, { requestId: 'join-req-003', type: 'world.join' }));
  assert.ok(secondRuntime.restored.some((entry) => entry.code === 'field'));
  assert.equal(ownerExecutions, 4);
  assert.deepEqual(await second.command(routedSocket, attackEnvelope, 'field', async () => assert.fail('completed request must remain idempotent after owner failover')), attack);
  assert.equal(ownerExecutions, 4);
});

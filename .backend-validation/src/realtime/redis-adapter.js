const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');

function logRedisError(clientName) {
  let lastLoggedAt = 0;
  return () => {
    const now = Date.now();
    if (now - lastLoggedAt < 30000) return;
    lastLoggedAt = now;
    process.stderr.write(`${JSON.stringify({ level: 'error', event: 'realtime_redis_connection_error', client: clientName })}\n`);
  };
}

async function closeClient(client) {
  if (client.status === 'ready') await client.quit();
  else client.disconnect();
}

function pingWithTimeout(client) {
  let timeout;
  return Promise.race([
    client.ping(),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Redis health check timed out')), 1500);
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function attachRedisAdapter(io, redisUrl) {
  if (!redisUrl) {
    return {
      enabled: false,
      async healthCheck() { return false; },
      async close() {},
    };
  }

  const clientOptions = { lazyConnect: true, maxRetriesPerRequest: 1 };
  const pubClient = new Redis(redisUrl, clientOptions);
  const subClient = new Redis(redisUrl, clientOptions);
  pubClient.on('error', logRedisError('publisher'));
  subClient.on('error', logRedisError('subscriber'));

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
  } catch (error) {
    await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
    throw new Error('Could not initialize the Socket.IO Redis adapter from REDIS_URL', { cause: error });
  }

  return {
    enabled: true,
    async healthCheck() {
      const [publisher, subscriber] = await Promise.all([pingWithTimeout(pubClient), pingWithTimeout(subClient)]);
      return publisher === 'PONG' && subscriber === 'PONG';
    },
    async close() {
      await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
    },
  };
}

module.exports = { attachRedisAdapter };

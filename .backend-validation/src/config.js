const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'local-only-change-me');
if (!jwtSecret) throw new Error('JWT_SECRET is required in production');
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 10');
const dbPoolSize = Number(process.env.DB_POOL_SIZE || 10);
const dbQueueLimit = Number(process.env.DB_QUEUE_LIMIT || 100);
if (!Number.isSafeInteger(dbPoolSize) || dbPoolSize < 1) throw new Error('DB_POOL_SIZE must be a positive integer');
if (!Number.isSafeInteger(dbQueueLimit) || dbQueueLimit < 1) throw new Error('DB_QUEUE_LIMIT must be a positive integer');

const localOrigins = [3000, 3001, 4200].flatMap((port) =>
  ['localhost', '127.0.0.1', '[::1]'].map((host) => `http://${host}:${port}`));
const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : (isProduction ? [] : localOrigins);

module.exports = {
  port: Number(process.env.PORT || 3800),
  jwtSecret,
  corsOrigin: configuredOrigins.includes('*') ? '*' : configuredOrigins,
  redisUrl: process.env.REDIS_URL || '',
  isProduction,
  trustProxyHops,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'tu_tien_pixel',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: dbPoolSize,
    queueLimit: dbQueueLimit,
  },
};

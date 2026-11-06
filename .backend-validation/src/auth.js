const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { DomainError, publicUser } = require('./domain');

function createAuth({ store, secret }) {
  const sign = (user) => jwt.sign({ sub: user.id, username: user.username, role: user.role }, secret, { expiresIn: '15m' });
  const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
  const session = async (user, refreshToken = crypto.randomBytes(48).toString('base64url')) => {
    await store.saveRefreshToken(user.id, hashRefreshToken(refreshToken), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    const token = sign(user);
    return { user: publicUser(user), token, accessToken: token, refreshToken };
  };

  function normalizeCredentials(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new DomainError('INVALID_CREDENTIALS', 'Username hoặc password không hợp lệ');
    }
    const username = typeof input.username === 'string' ? input.username.trim().normalize('NFKC').toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const usernameLength = [...username].length;
    const passwordBytes = Buffer.byteLength(password, 'utf8');
    if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username) || usernameLength < 3 || usernameLength > 20 || passwordBytes < 8 || passwordBytes > 72) {
      throw new DomainError('INVALID_CREDENTIALS', 'Username phải dài 3-20 ký tự; password phải dài 8-72 byte');
    }
    return { username, password };
  }

  async function register(input) {
    const { username, password } = normalizeCredentials(input);
    const user = { id: `usr_${crypto.randomUUID()}`, username, passwordHash: await bcrypt.hash(password, 12), role: 'PLAYER', status: 'ACTIVE', createdAt: new Date().toISOString() };
    if (await store.findUserByUsername(username)) throw new DomainError('USERNAME_TAKEN', 'Username đã tồn tại', 409);
    await store.insertUser(user);
    return session(user);
  }

  async function login(input) {
    let credentials;
    try { credentials = normalizeCredentials(input); }
    catch { throw new DomainError('INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng', 401); }
    const user = await store.findUserByUsername(credentials.username);
    if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(credentials.password, user.passwordHash))) {
      throw new DomainError('INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng', 401);
    }
    return session(user);
  }

  async function authenticateToken(token) {
    let claims;
    try { claims = jwt.verify(token || '', secret); }
    catch { throw new DomainError('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401); }
    if (typeof claims.sub !== 'string' || !claims.sub) throw new DomainError('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401);
    const user = await store.findUserById(claims.sub);
    if (!user || user.status !== 'ACTIVE') throw new DomainError('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401);
    return { sub: user.id, username: user.username, role: user.role };
  }

  async function authenticate(req, _res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try { req.auth = await authenticateToken(token); next(); }
    catch (error) { next(error); }
  }

  async function me(userId) {
    const user = await store.findUserById(userId);
    if (!user || user.status !== 'ACTIVE') throw new DomainError('UNAUTHORIZED', 'Tài khoản không tồn tại hoặc đã bị khóa', 401);
    return publicUser(user);
  }

  async function createDemo() {
    const username = `demo_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const user = {
      id: `usr_${crypto.randomUUID()}`,
      username,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      role: 'PLAYER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    await store.insertUser(user);
    return session(user);
  }

  async function refresh(input) {
    const priorToken = typeof input?.refreshToken === 'string' ? input.refreshToken : '';
    if (!/^[A-Za-z0-9_-]{60,80}$/.test(priorToken)) throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ', 401);
    const nextToken = crypto.randomBytes(48).toString('base64url');
    const user = await store.rotateRefreshToken(
      hashRefreshToken(priorToken),
      hashRefreshToken(nextToken),
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );
    if (!user) throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token đã hết hạn, bị thu hồi hoặc không hợp lệ', 401);
    const token = sign(user);
    return { user: publicUser(user), token, accessToken: token, refreshToken: nextToken };
  }

  async function logout(input) {
    const refreshToken = typeof input?.refreshToken === 'string' ? input.refreshToken : '';
    if (!/^[A-Za-z0-9_-]{60,80}$/.test(refreshToken)) throw new DomainError('INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ', 401);
    await store.revokeRefreshToken(hashRefreshToken(refreshToken));
    return { ok: true };
  }

  return { register, login, refresh, logout, authenticate, authenticateToken, me, createDemo };
}

module.exports = { createAuth };

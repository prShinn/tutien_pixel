/**
 * middleware/auth.js
 * JWT verification middleware — dùng cho mọi route cần login
 */
const jwt = require('jsonwebtoken');
const { UserDB } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-tien-dev-secret-change-in-production';

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Thiếu token xác thực' });

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId   = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

function signToken(userId, username) {
  return jwt.sign(
    { userId, username },
    JWT_SECRET,
    { expiresIn: '7d' }  // token sống 7 ngày
  );
}

module.exports = { authMiddleware, signToken, JWT_SECRET };

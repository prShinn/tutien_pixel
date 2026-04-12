/**
 * routes/auth.js
 * POST /api/auth/register  — Đăng ký tài khoản
 * POST /api/auth/login     — Đăng nhập, nhận JWT
 * GET  /api/auth/me        — Kiểm tra token (dùng khi app load)
 */
const express  = require('express');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('crypto'); // built-in
const { UserDB } = require('../db');
const { signToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── Register ──────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'Thiếu username hoặc password' });
    if (username.length < 3 || username.length > 20)
      return res.status(400).json({ error: 'Username 3-20 ký tự' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password tối thiểu 6 ký tự' });
    if (UserDB.findByUsername(username))
      return res.status(409).json({ error: 'Username đã tồn tại' });

    const passwordHash = await bcrypt.hash(password, 10);
    const id = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const user = UserDB.create({ id, username, passwordHash });

    const token = signToken(user.id, user.username);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (e) {
    console.error('[register]', e);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// ── Login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });

    const user = UserDB.findByUsername(username);
    if (!user) return res.status(401).json({ error: 'Sai username hoặc password' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Sai username hoặc password' });

    UserDB.updateLastLogin(user.id);
    const token = signToken(user.id, user.username);

    res.json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (e) {
    console.error('[login]', e);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});

// ── Me (verify token) ─────────────────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  res.json({ userId: req.userId, username: req.username });
});

module.exports = router;

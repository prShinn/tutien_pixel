/**
 * server.js — Entry point
 * 
 * Stack:
 *   Express  — REST API (auth, save/load)
 *   Socket.io — Real-time co-op (move sync, chat, combat fx)
 *   Data     — in-memory API placeholders (no file DB)
 * 
 * Start: node server.js
 * Port:  3000 (hoặc PORT env)
 */

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const { authMiddleware, signToken } = require('./middleware/auth');

// const authRoutes   = require('./routes/auth');
// const playerRoutes = require('./routes/player');
const { setupSocket } = require('./socket/game');

// ── App setup ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: '*',   // production: đổi thành domain cụ thể
    methods: ['GET', 'POST'],
  },
});

// ── Middleware ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '512kb' }));

// Auth API
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username và password là bắt buộc' });
  const existing = [...users.values()].find((u) => u.username === username);
  if (existing) return res.status(409).json({ error: 'Tên tài khoản đã tồn tại' });
  const id = nextUserId++;
  const user = { id, username, password };
  users.set(id, user);
  res.json({ token: signToken(id, username), user: { id, username } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username và password là bắt buộc' });
  const user = [...users.values()].find(
    (u) => u.username === username && u.password === password,
  );
  if (!user) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu sai' });
  res.json({ token: signToken(user.id, user.username), user: { id: user.id, username: user.username } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: { id: req.userId, username: req.username } });
});

app.get('/api/player/by-user/:userId', authMiddleware, (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId || userId !== req.userId)
    return res.status(403).json({ error: 'Không được phép' });
  const player = [...players.values()].find((p) => p.userId === userId);
  if (!player) return res.status(404).json({ error: 'Không tìm thấy nhân vật' });
  res.json(player);
});

// Serve game client (nếu build Angular vào dist/)
app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
let nextUserId = 1;
const players = new Map();
let nextPlayerId = 1;
const worlds = [
  // TODO: populate world API from backend data
];
const canhGiois = [
  // TODO: populate realm API from backend data
];

// ── REST Routes ────────────────────────────────────────────────────
app.get('/api/player/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid player id' });
  const player = players.get(id);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json(player);
});

app.post('/api/player', (req, res) => {
  const body = req.body || {};
  const id = nextPlayerId++;
  const player = { ...body, id };
  players.set(id, player);
  res.json(player);
});

app.put('/api/player/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid player id' });
  const existing = players.get(id);
  if (!existing) return res.status(404).json({ error: 'Player not found' });
  const updated = { ...existing, ...req.body, id };
  players.set(id, updated);
  res.json(updated);
});

app.get('/api/worlds/default', (req, res) => {
  const world = worlds.find((w) => w.isDefault) || worlds[0];
  if (!world) return res.status(404).json({ error: 'Default world not available' });
  res.json(world);
});

app.get('/api/worlds/by-code', (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: 'Missing world code' });
  const world = worlds.find((w) => w.code === code);
  if (!world) return res.status(404).json({ error: 'World not found' });
  res.json(world);
});

app.get('/api/canh-gioi/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid realm id' });
  const realm = canhGiois.find((r) => r.stt === id || r.id === id);
  if (!realm) return res.status(404).json({ error: 'Realm not found' });
  res.json(realm);
});

// app.use('/api/auth',   authRoutes);
// app.use('/api/player', playerRoutes);

// Health check
// app.get('/api/health', (req, res) => {
//   res.json({
//     status: 'ok',
//     uptime: Math.floor(process.uptime()),
//     ts: Date.now(),
//   });
// });

// Catch-all → serve Angular SPA (nếu có)
app.get('*', (req, res) => {
  const index = path.join(__dirname, 'public', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.json({ message: 'Tu Tiên API Server đang chạy' });
});

// ── Socket.io ─────────────────────────────────────────────────────
const { broadcast, sessions } = setupSocket(io, players);

// Optional: periodic world stats broadcast
setInterval(() => {
  const online = sessions.size;
  if (online > 0) broadcast('server_msg', { text: `[System] ${online} tu sĩ đang trực tuyến` });
}, 5 * 60 * 1000); // every 5 minutes

// ── Start ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  TU TIÊN SERVER — ĐANG CHẠY             ║
║  http://localhost:${PORT}                   ║
║  REST  : /api/player  /api/worlds  /api/canh-gioi
║  Socket: ws://localhost:${PORT}              ║
╚══════════════════════════════════════════╝
  `);
});

/**
 * server.js — Entry point
 * 
 * Stack:
 *   Express  — REST API (auth, save/load)
 *   Socket.io — Real-time co-op (move sync, chat, combat fx)
 *   lowdb     — JSON file DB (dễ migrate sang PostgreSQL/MongoDB)
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
const fs         = require('fs');
const low        = require('lowdb');
const FileSync   = require('lowdb/adapters/FileSync');

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

// Serve game client (nếu build Angular vào dist/)
app.use(express.static(path.join(__dirname, 'public')));

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbFile = path.join(dbDir, 'db.json');
const adapter = new FileSync(dbFile);
const db = low(adapter);
db.defaults({ players: [] }).write();

// ── REST Routes ────────────────────────────────────────────────────
app.get('/api/player/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid player id' });
  const player = db.get('players').find({ id }).value();
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json(player);
});

app.post('/api/player', (req, res) => {
  const body = req.body || {};
  const player = {
    ...body,
    id: Date.now(),
  };
  db.get('players').push(player).write();
  res.json(player);
});

app.put('/api/player/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid player id' });
  const existing = db.get('players').find({ id }).value();
  if (!existing) return res.status(404).json({ error: 'Player not found' });
  const updated = {
    ...existing,
    ...req.body,
    id,
  };
  db.get('players').find({ id }).assign(updated).write();
  res.json(updated);
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
const { broadcast, sessions } = setupSocket(io);

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
║  REST  : /api/auth  /api/player         ║
║  Socket: ws://localhost:${PORT}              ║
╚══════════════════════════════════════════╝
  `);
});

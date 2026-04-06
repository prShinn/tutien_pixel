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

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const playerRoutes = require("./routes/player");
const { setupSocket } = require("./socket/game");

// ── App setup ──────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // production: đổi thành domain cụ thể
    methods: ["GET", "POST"],
  },
});

// ── Middleware ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "512kb" }));

// Serve game client (nếu build Angular vào dist/)
app.use(express.static(path.join(__dirname, "public")));

// ── REST Routes ────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/player", playerRoutes);

// Catch-all → serve Angular SPA (nếu có)
app.get("*", (req, res) => {
  const index = path.join(__dirname, "public", "test.html");
  const fs = require("fs");
  if (fs.existsSync(index)) res.sendFile(index);
  else res.json({ message: "Tu Tiên API Server đang chạy" });
});

// ── Socket.io ─────────────────────────────────────────────────────
const { broadcast, sessions } = setupSocket(io);

// Optional: periodic world stats broadcast
setInterval(
  () => {
    const online = sessions.size;
    broadcast("server_msg", {
      text: `[System] ${online} tu sĩ đang trực tuyến`,
    });
  },
  5 * 60 * 1000,
); // every 5 minutes

// ── Start ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  TU TIÊN SERVER — ĐANG CHẠY             ║
║  http://localhost:${PORT}                   ║
║  Socket: ws://localhost:${PORT}              ║
╚══════════════════════════════════════════╝
  `);
});

require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const { authMiddleware, signToken } = require("./middleware/auth");
const { setupSocket } = require("./socket/game");
const { realms, roots, items, skills, monsterDefs, worlds } = require("./data/mock-data");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const users = new Map();
const players = new Map();
let nextUserId = 1;
let nextPlayerId = 1;

app.use(cors());
app.use(express.json({ limit: "512kb" }));

function publicUser(user) {
  return { id: user.id, username: user.username };
}

function findUserByUsername(username) {
  return [...users.values()].find((user) => user.username === username);
}

app.post("/api/auth/register", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (username.length < 3 || password.length < 4) return res.status(400).json({ error: "Username tối thiểu 3 ký tự, password tối thiểu 4 ký tự" });
  if (findUserByUsername(username)) return res.status(409).json({ error: "Tên tài khoản đã tồn tại" });
  const user = { id: nextUserId++, username, passwordHash: await bcrypt.hash(password, 10) };
  users.set(user.id, user);
  res.json({ token: signToken(user.id, user.username), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = findUserByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu sai" });
  res.json({ token: signToken(user.id, user.username), user: publicUser(user) });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: { id: req.userId, username: req.username } });
});

app.get("/api/worlds", (req, res) => res.json(worlds));
app.get("/api/worlds/default", (req, res) => res.json(worlds.find((world) => world.isDefault)));
app.get("/api/worlds/by-code", (req, res) => {
  const world = worlds.find((item) => item.code === String(req.query.code || "").toLowerCase());
  if (!world) return res.status(404).json({ error: "World not found" });
  res.json(world);
});
app.get("/api/canh-gioi", (req, res) => res.json(realms));
app.get("/api/canh-gioi/stt/:stt", (req, res) => {
  const realm = realms.find((item) => item.stt === Number(req.params.stt));
  if (!realm) return res.status(404).json({ error: "Realm not found" });
  res.json(realm);
});
app.get("/api/canh-gioi/:id", (req, res) => {
  const realm = realms.find((item) => item.id === Number(req.params.id));
  if (!realm) return res.status(404).json({ error: "Realm not found" });
  res.json(realm);
});
app.get("/api/linh-can", (req, res) => res.json(roots));
app.get("/api/items", (req, res) => res.json(items));
app.get("/api/skills", (req, res) => res.json(skills));
app.get("/api/monsters", (req, res) => res.json(monsterDefs));
app.get("/api/health", (req, res) => res.json({ status: "ok", uptime: Math.floor(process.uptime()) }));

app.get("/api/player/me", authMiddleware, (req, res) => {
  const player = [...players.values()].find((item) => item.userId === req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json(player);
});
app.get("/api/player/by-user/:userId", authMiddleware, (req, res) => {
  if (Number(req.params.userId) !== req.userId) return res.status(403).json({ error: "Không được phép" });
  const player = [...players.values()].find((item) => item.userId === req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json(player);
});
app.post("/api/player", authMiddleware, (req, res) => {
  if (Number(req.body?.userId) !== req.userId) return res.status(403).json({ error: "Player không thuộc tài khoản" });
  const existing = [...players.values()].find((item) => item.userId === req.userId);
  if (existing) return res.status(409).json(existing);
  const player = { ...req.body, id: nextPlayerId++, userId: req.userId };
  players.set(player.id, player);
  res.json(player);
});
app.put("/api/player/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const current = players.get(id);
  if (!current) return res.status(404).json({ error: "Player not found" });
  if (current.userId !== req.userId) return res.status(403).json({ error: "Không được phép" });
  const player = { ...current, ...req.body, id, userId: req.userId };
  players.set(id, player);
  res.json(player);
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const { broadcast, sessions } = setupSocket(io, players);
setInterval(() => {
  if (sessions.size) broadcast("server_msg", { text: `[System] ${sessions.size} tu sĩ đang trực tuyến` });
}, 300000);

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`Tu Tien demo running at http://localhost:${PORT}`));

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
const { BALANCE, deriveStats, combatPower, calcTuViNeeded, breakthroughGain } = require("./data/balance");

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

app.post("/api/auth/demo", (req, res) => {
  const username = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = { id: nextUserId++, username, passwordHash: "demo" };
  users.set(user.id, user);
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
app.get("/api/balance", (req, res) => res.json(BALANCE));
app.get("/api/skills/catalog", authMiddleware, (req, res) => {
  const player = [...players.values()].find((item) => item.userId === req.userId);
  res.json({
    skills,
    learnedSkills: player?.learnedSkills || [],
    equippedSkills: player?.equippedSkills || [],
  });
});
app.get("/api/monsters", (req, res) => res.json(monsterDefs));
app.get("/api/health", (req, res) => res.json({ status: "ok", uptime: Math.floor(process.uptime()) }));

function playerFor(userId) {
  return [...players.values()].find((item) => item.userId === userId);
}

app.post("/api/player/cultivation/absorb", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  const amount = Math.floor(Number(req.body?.amount) || 0);
  if (!player) return res.status(404).json({ error: "Player not found" });
  if (amount <= 0 || amount > 5000) return res.status(400).json({ error: "Lượng tu vi không hợp lệ" });
  player.tuViHienTai = Math.max(0, Number(player.tuViHienTai || 0) + amount);
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json({ player, result: { type: "cultivation_absorbed", amount } });
});

app.post("/api/player/cultivation/breakthrough", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  const realm = realms.find((item) => item.code === player.maCanhGioi) || realms.find((item) => item.stt === Number(player.realm || 1)) || realms[0];
  const stage = Number(player.tangTuVi || player.stage || 1);
  const threshold = Number(player.tuViLenCap || calcTuViNeeded(realm, stage));
  if (Number(player.tuViHienTai || 0) < threshold) return res.status(400).json({ error: "Tu vi chưa đủ", required: threshold, current: player.tuViHienTai || 0 });
  const major = stage >= 9;
  const gain = breakthroughGain(realm, stage, major);
  player.tuViHienTai = Math.max(0, Number(player.tuViHienTai || 0) - threshold);
  player.stats = { ...(player.stats || {}), str: (player.stats?.str || 0) + gain.str, agi: (player.stats?.agi || 0) + gain.agi, vit: (player.stats?.vit || 0) + gain.vit, ene: (player.stats?.ene || 0) + gain.ene };
  if (major) {
    const next = realms.find((item) => item.stt === Number(realm.stt) + 1);
    if (next) { player.maCanhGioi = next.code; player.canhGioi = next; player.tenCanhGioi = next.tenCanhGioi; player.realm = next.stt; }
    player.tangTuVi = 1;
  } else {
    player.tangTuVi = stage + 1;
  }
  const currentRealm = player.canhGioi || realm;
  player.tuViLenCap = calcTuViNeeded(currentRealm, player.tangTuVi);
  player.maxHp = 100 + player.stats.vit * 12;
  player.maxMp = 50 + player.stats.ene * 8;
  player.hp = Math.min(Number(player.hp || player.maxHp) + gain.vit * 12, player.maxHp);
  player.mp = Math.min(Number(player.mp || player.maxMp) + gain.ene * 8, player.maxMp);
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json({ player, result: { type: major ? "realm_breakthrough" : "stage_breakthrough", gain, major } });
});

app.get("/api/player/me", authMiddleware, (req, res) => {
  const player = [...players.values()].find((item) => item.userId === req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json(player);
});
app.get("/api/player/state", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json(player);
});

app.get("/api/player/by-user/:userId", authMiddleware, (req, res) => {
  if (Number(req.params.userId) !== req.userId) return res.status(403).json({ error: "Không được phép" });
  const player = [...players.values()].find((item) => item.userId === req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json(player);
});
app.post("/api/player/inventory/use", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  let inventory = [];
  try { inventory = typeof player.jsonIventory === "string" ? JSON.parse(player.jsonIventory || "[]") : (player.inventory || []); } catch { inventory = []; }
  const index = Number.isInteger(req.body?.index) ? req.body.index : inventory.findIndex((item) => item.id === req.body?.itemId);
  const item = inventory[index];
  if (!item) return res.status(404).json({ error: "Item not found" });
  const type = item.type || item.loai;
  const result = { type: "item_used", itemId: item.id, hp: 0, mp: 0, stat: null };
  if (type === "STONE" || type === "ELEMSTONE") {
    player.tuViHienTai = Number(player.tuViHienTai || 0) + Number(item.giaTriTuVi || 0);
    result.type = "cultivation_absorbed";
  } else if (type === "LINDAN") {
    player.tuViLinhCan = Number(player.tuViLinhCan || 0) + Number(item.tuViLinhCanVal || 0);
    result.type = "root_cultivation";
  } else if (type === "POTION" || type === "CONSUME") {
    result.hp = Number(item.healHp || 0);
    result.mp = Number(item.healMp || 0);
    player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + result.hp);
    player.mp = Math.min(Number(player.maxMp || 50), Number(player.mp || 0) + result.mp);
    if (item.statBoost) {
      const stat = item.statKey || "str";
      player.stats = { ...(player.stats || {}), [stat]: Number(player.stats?.[stat] || 0) + Number(item.statBoost) };
      result.stat = { key: stat, amount: Number(item.statBoost) };
    }
  } else return res.status(400).json({ error: "Item chưa có logic sử dụng" });
  item.count = Number(item.count || 1) - 1;
  if (item.count <= 0) inventory.splice(index, 1);
  player.inventory = inventory;
  player.jsonIventory = JSON.stringify(inventory);
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json({ player, result });
});

app.post("/api/player/shop/buy", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  const item = items.find((entry) => entry.id === req.body?.itemId);
  if (!player || !item) return res.status(404).json({ error: "Item not found" });
  if (Number(player.xu || 0) < Number(item.giaMua || 0)) return res.status(400).json({ error: "Không đủ xu" });
  let inventory = [];
  try { inventory = JSON.parse(player.jsonIventory || "[]"); } catch { inventory = []; }
  const existing = inventory.find((entry) => entry.id === item.id);
  if (existing) existing.count = Math.min(99, Number(existing.count || 0) + 1);
  else if (inventory.length < 40) inventory.push({ ...item, count: 1 });
  else return res.status(400).json({ error: "Túi đồ đầy" });
  player.xu -= Number(item.giaMua || 0);
  player.inventory = inventory;
  player.jsonIventory = JSON.stringify(inventory);
  players.set(player.id, player);
  res.json({ player, result: { type: "bought", itemId: item.id } });
});

app.post("/api/player/shop/sell", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  let inventory = [];
  try { inventory = JSON.parse(player.jsonIventory || "[]"); } catch { inventory = []; }
  const index = Number(req.body?.index);
  const item = inventory[index];
  if (!item) return res.status(404).json({ error: "Item not found" });
  const price = Number(item.giaBan || 0);
  player.xu = Number(player.xu || 0) + price;
  item.count = Number(item.count || 1) - 1;
  if (item.count <= 0) inventory.splice(index, 1);
  player.inventory = inventory;
  player.jsonIventory = JSON.stringify(inventory);
  players.set(player.id, player);
  res.json({ player, result: { type: "sold", itemId: item.id, price } });
});

app.post("/api/player", authMiddleware, (req, res) => {
  if (Number(req.body?.userId) !== req.userId) return res.status(403).json({ error: "Player không thuộc tài khoản" });
  const existing = [...players.values()].find((item) => item.userId === req.userId);
  if (existing) return res.status(409).json(existing);
  const inputStats = req.body?.stats || {};
  const stats = Object.fromEntries(["str", "agi", "vit", "ene"].map((key) => [key, Math.floor(Number(inputStats[key]) || 0)]));
  const statTotal = Object.values(stats).reduce((sum, value) => sum + value, 0);
  if (Object.values(stats).some((value) => value < BALANCE.creation.minStat) || statTotal !== (BALANCE.creation.minStat * 4 + BALANCE.creation.bonusPoints)) {
    return res.status(400).json({ error: `Phân bổ thuộc tính phải đủ ${BALANCE.creation.bonusPoints} điểm, mỗi chỉ số tối thiểu ${BALANCE.creation.minStat}.` });
  }
  const rootSkills = skills.filter((skill) => skill.linhCan === req.body.linhCan && skill.category !== "PASSIVE");
  const initialSkills = rootSkills.slice(0, 4);
  const player = {
    ...req.body,
    stats,
    id: nextPlayerId++,
    userId: req.userId,
    learnedSkills: [...skills.filter((skill) => skill.linhCan === "COMMON"), ...rootSkills.slice(0, 2), ...skills.filter((skill) => skill.linhCan === req.body.linhCan && skill.category === "PASSIVE")].map((skill) => skill.code),
    equippedSkills: initialSkills.map((skill) => skill.code),
    unspentStatPoints: 0,
    skills: req.body.skills || initialSkills,
  };
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json(player);
});

app.post("/api/player/stats/allocate", authMiddleware, (req, res) => {
  const player = [...players.values()].find((item) => item.userId === req.userId);
  const stat = String(req.body?.stat || "");
  const amount = Math.max(1, Math.floor(Number(req.body?.amount) || 1));
  if (!player) return res.status(404).json({ error: "Player not found" });
  if (!Object.prototype.hasOwnProperty.call(BALANCE.stats, stat)) return res.status(400).json({ error: "Stat không hợp lệ" });
  if ((player.unspentStatPoints || 0) < amount) return res.status(400).json({ error: "Không đủ điểm thuộc tính" });
  player.stats = { ...(player.stats || {}), [stat]: (player.stats?.[stat] || 0) + amount };
  player.unspentStatPoints -= amount;
  player.derivedStats = deriveStats(player.stats, player.equipment || {});
  players.set(player.id, player);
  res.json({ stats: player.stats, unspentStatPoints: player.unspentStatPoints, derivedStats: player.derivedStats });
});
app.put("/api/player/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const current = players.get(id);
  if (!current) return res.status(404).json({ error: "Player not found" });
  if (current.userId !== req.userId) return res.status(403).json({ error: "Không được phép" });
  const player = { ...current, id, userId: req.userId };
  for (const key of ["name", "x", "y", "mapCode", "mapId", "equip_slot", "faction", "guildId", "gender", "img"]) {
    if (req.body?.[key] !== undefined) player[key] = req.body[key];
  }
  player.combatPower = combatPower(player);
  players.set(id, player);
  res.json(player);
});

app.get("/api/player/power", authMiddleware, (req, res) => {
  const player = [...players.values()].find((item) => item.userId === req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json({ combatPower: combatPower(player) });
});

app.post("/api/player/skills/learn", authMiddleware, (req, res) => {
  const player = [...players.values()].find((item) => item.userId === req.userId);
  const code = String(req.body?.skillCode || "");
  const skill = skills.find((item) => item.code === code);
  if (!player || !skill) return res.status(404).json({ error: "Skill not found" });
  if (skill.linhCan !== "COMMON" && skill.linhCan !== player.linhCan) return res.status(403).json({ error: "Skill không thuộc linh căn" });
  player.learnedSkills = Array.from(new Set([...(player.learnedSkills || []), code]));
  players.set(player.id, player);
  res.json({ learnedSkills: player.learnedSkills, skill });
});

app.put("/api/player/skills/equip", authMiddleware, (req, res) => {
  const player = [...players.values()].find((item) => item.userId === req.userId);
  const codes = Array.isArray(req.body?.skillCodes) ? req.body.skillCodes.slice(0, 4) : [];
  if (!player) return res.status(404).json({ error: "Player not found" });
  const learned = new Set(player.learnedSkills || []);
  if (codes.some((code) => !learned.has(code))) return res.status(400).json({ error: "Chỉ được trang bị skill đã học" });
  player.equippedSkills = codes;
  player.skills = codes.map((code) => skills.find((skill) => skill.code === code)).filter(Boolean);
  players.set(player.id, player);
  res.json({ equippedSkills: player.equippedSkills, skills: player.skills });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const { broadcast, sessions } = setupSocket(io, players);
setInterval(() => {
  if (sessions.size) broadcast("server_msg", { text: `[System] ${sessions.size} tu sĩ đang trực tuyến` });
}, 300000);

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`Tu Tien demo running at http://localhost:${PORT}`));

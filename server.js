// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: server.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Máy chủ chính (Express Backend Server & REST API Gateway): Cung cấp các endpoint xác thực
//      (/api/auth/register, login, me), quản lý nhân vật (/api/character/create), túi đồ & trang bị,
//      tu luyện & hấp thụ tu vi (/api/cultivation/absorb), danh mục thần thông (/api/skills/catalog),
//      cửa hàng NPC, và lưu trữ bản đồ thế giới từ Map Editor (/api/admin/worlds).
// 2. CẤU HÌNH LIÊN QUAN:
//    - PORT (mặc định 3000), JWT_SECRET, CORS.
//    - Phụ thuộc: middleware/auth, middleware/rate-limit, socket/game, data/mock-data, data/balance.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Bảo mật DTO: Whitelist nghiêm ngặt thuộc tính nhân vật, chặn cheat tọa độ/thuộc tính qua REST.
//    - Chống spam/DDoS: Tích hợp rate limiter cho các API trọng yếu.
//    - Ghi file async atomic tránh block Node event loop khi admin lưu bản đồ lớn.
// ════════════════════════════════════════════════════════════════════════════════════════

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const { authMiddleware, signToken } = require("./middleware/auth");
const { createRateLimiter } = require("./middleware/rate-limit");
const { setupSocket } = require("./socket/game");
const ENV = require("./config/env");
const { realms, roots, items, skills, monsterDefs, worlds } = require("./data/mock-data");
const { getWorldStructure } = require("./data/world-structure");
const { BALANCE, deriveStats, combatPower, calcTuViNeeded, breakthroughThreshold, minimumBreakthroughOvr, breakthroughGain } = require("./data/balance");
const QuestService = require("./game/quest-service");
const SkillVfxProfileStore = require("./game/skill-vfx-profile-store");
const AdminContentService = require("./game/admin-content-service");
const GameStateStore = require("./game/game-state-store");
const createAdminContentRouter = require("./routes/admin-content");
const createQuestRouter = require("./routes/quests");
const createPlayerRouter = require("./routes/player");

const app = express();
const server = http.createServer(app);
app.set("trust proxy", ENV.trustProxyHops);
const io = new Server(server, {
  cors: {
    origin: ENV.isProduction ? ENV.corsOrigins : true,
    credentials: true,
  },
});
class PersistedMap extends Map {
  constructor(onChange) {
    super();
    this.onChange = onChange;
  }

  set(key, value) {
    super.set(key, value);
    this.onChange?.();
    return this;
  }

  delete(key) {
    const deleted = super.delete(key);
    if (deleted) this.onChange?.();
    return deleted;
  }

  clear() {
    if (this.size) {
      super.clear();
      this.onChange?.();
    }
  }

  restore(key, value) {
    return Map.prototype.set.call(this, key, value);
  }
}

const GAME_STATE_FILE = process.env.GAME_STATE_FILE
  ? path.resolve(process.env.GAME_STATE_FILE)
  : path.join(__dirname, "data", "game-state.json");
const gameStateStore = new GameStateStore(GAME_STATE_FILE, {
  onError: (error) => console.error("Game state persistence failed:", error.message),
});
const restoredGameState = gameStateStore.load();
const users = new Map();
const usersByUsername = new Map();
const registeringUsernames = new Set();
const players = new PersistedMap(scheduleGameStateSave);
const playersByUserId = new Map();
const worldResponseCache = new Map();
let socketRuntime = null;
let nextUserId = 1;
let nextPlayerId = 1;
for (const user of restoredGameState.users) {
  users.set(user.id, user);
  usersByUsername.set(user.username.toLowerCase(), user);
  nextUserId = Math.max(nextUserId, user.id + 1);
}
for (const player of restoredGameState.players) {
  players.restore(player.id, player);
  playersByUserId.set(Number(player.userId), player);
  nextPlayerId = Math.max(nextPlayerId, Number(player.id) + 1);
}
const ADMIN_MAP_KEY = ENV.adminMapKey;
const ADMIN_MAP_FILE = path.join(__dirname, "data", "admin-worlds.json");
const SKILL_VFX_FILE = path.join(__dirname, "data", "skill-vfx.json");
const skillVfxProfileStore = new SkillVfxProfileStore(SKILL_VFX_FILE);
const MAP_MIN_W = 320;
const MAP_MIN_H = 240;
const MAP_MAX_SIZE = 1024;
const PORTAL_EDGE_MARGIN = 12;
const PORTAL_EXIT_OFFSET = 24;
const SEEDED_WORLDS = new Map(worlds.map((world) => [world.code, JSON.parse(JSON.stringify(world))]));

const authLimiter = createRateLimiter({ windowMs: 60000, max: 30, message: "Quá nhiều yêu cầu xác thực, vui lòng thử lại sau." });
const demoLimiter = createRateLimiter({ windowMs: 60000, max: 60, message: "Đã đạt giới hạn tạo phiên demo." });

app.use(cors({
  origin: ENV.isProduction ? ENV.corsOrigins : true,
  credentials: true,
}));
app.use("/api/admin/worlds", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "512kb" }));

function clampInteger(value, min, max, fallback = min) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeGrid(value, width, height, allowed, fallback) {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const tile = Number(value?.[y]?.[x]);
    return allowed.has(tile) ? tile : fallback;
  }));
}

function deriveLayers(payload, width, height) {
  const source = Array.isArray(payload?.jsonMap) ? payload.jsonMap : [];
  const rawLayers = payload?.layers && typeof payload.layers === "object" ? payload.layers : {};
  const groundSource = Array.isArray(rawLayers.ground)
    ? rawLayers.ground
    : source.map((row) => row.map((tile) => ([3, 5, 6].includes(Number(tile)) ? 0 : Number(tile))));
  const objectSource = Array.isArray(rawLayers.objects)
    ? rawLayers.objects
    : source.map((row) => row.map((tile) => ([3, 5, 6].includes(Number(tile)) ? Number(tile) : -1)));
  const ground = normalizeGrid(groundSource, width, height, new Set([0, 1, 2, 4, 7]), 0);
  const objects = normalizeGrid(objectSource, width, height, new Set([-1, 3, 5, 6]), -1);
  const elevation = normalizeGrid(rawLayers.elevation, width, height, new Set([0, 1, 2, 3]), 0);
  const collision = ground.map((row, y) => row.map((tile, x) => objects[y][x] >= 0 ? objects[y][x] : tile));
  return { ground, objects, elevation, collision };
}

function normalizePortals(value, width, height) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((portal, index) => {
    const denMap = String(portal?.denMap || portal?.toMap || "").trim().toLowerCase();
    return {
      ...portal,
      id: String(portal?.id || `portal_${index}`).trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100),
      x: clampInteger(portal?.x, 0, width - 1, 0),
      y: clampInteger(portal?.y, 0, height - 1, 0),
      denMap,
      toMap: denMap,
      toX: Math.round(Number(portal?.toX) || 0),
      toY: Math.round(Number(portal?.toY) || 0),
      tenMapDen: String(portal?.tenMapDen || denMap).trim().slice(0, 80),
      bidirectional: Boolean(portal?.bidirectional),
    };
  }).filter((portal) => portal.denMap);
}

function normalizeStringList(value, max = 12) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, max);
}

function normalizeWorldRules(value = {}, type = "PLAIN") {
  const safeZone = Boolean(value.safeZone) || String(type).toUpperCase() === "CITY";
  return {
    safeZone,
    noMonsters: safeZone || Boolean(value.noMonsters),
    allowRecall: value.allowRecall !== false,
    deathPenalty: Math.max(0, Math.min(100, Number(value.deathPenalty || 0))),
  };
}

function normalizeMonsterSpawns(value, width, height) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, 100).map((spawn, index) => {
    const templateId = String(spawn?.templateId || "").trim().toUpperCase();
    if (!monsterDefs.some((monster) => monster.id === templateId || monster.code === templateId)) return null;
    let packId = String(spawn?.packId || `PACK_${templateId}_${index + 1}`).trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_").slice(0, 80);
    while (seen.has(packId)) packId = `${packId}_${index + 1}`;
    seen.add(packId);
    return {
      packId,
      templateId,
      centerX: clampInteger(spawn?.centerX, 4, width - 5, Math.floor(width / 2)),
      centerY: clampInteger(spawn?.centerY, 4, height - 5, Math.floor(height / 2)),
      count: clampInteger(spawn?.count, 1, 20, 4),
      radius: clampInteger(spawn?.radius, 2, 80, 18),
      aggroRange: clampInteger(spawn?.aggroRange, 8, 160, 40),
      leashDistance: clampInteger(spawn?.leashDistance, 16, 240, 72),
      chaseDurationMs: clampInteger(spawn?.chaseDurationMs, 1000, 30000, 7000),
    };
  }).filter(Boolean);
}

function worldStatus(world) {
  return String(world?.status || "PUBLISHED").toUpperCase() === "DRAFT" ? "DRAFT" : "PUBLISHED";
}

function isWorldPublished(world) {
  return worldStatus(world) === "PUBLISHED";
}

function validateWorldForPublish(world) {
  const errors = [];
  const warnings = [];
  if (!world || !world.code) return { valid: false, errors: ["Map không tồn tại"], warnings };
  if (!isWalkablePoint(world, world.spawnX, world.spawnY)) errors.push("Điểm sinh nhân vật bị chặn hoặc quá sát biên");
  for (const portal of world.portals || []) {
    const target = worlds.find((item) => item.code === String(portal.denMap || portal.toMap || "").toLowerCase());
    if (!target) errors.push(`Portal ${portal.id} trỏ tới map không tồn tại`);
    else if (!isWorldPublished(target)) warnings.push(`Portal ${portal.id} trỏ tới map nháp ${target.code}`);
    if (!isWalkablePoint(world, portal.x, portal.y)) errors.push(`Portal ${portal.id} nằm tại vị trí bị chặn`);
  }
  if (!world.rules?.noMonsters && !(world.monsterSpawns || []).length) warnings.push("Map cho phép quái nhưng chưa có bãi quái");
  return { valid: errors.length === 0, errors, warnings };
}

function isWalkablePoint(world, x, y) {
  const tx = Math.round(Number(x));
  const ty = Math.round(Number(y));
  if (tx < 4 || ty < 4 || tx >= Number(world?.w || 0) - 4 || ty >= Number(world?.h || 0) - 4) return false;
  return Number(world?.jsonMap?.[ty]?.[tx]) !== 2;
}

function nearestWalkablePoint(world, x, y) {
  const width = Number(world?.w || 0);
  const height = Number(world?.h || 0);
  if (width < 9 || height < 9) return null;
  const centerX = clampInteger(x, 4, width - 5, Math.floor(width / 2));
  const centerY = clampInteger(y, 4, height - 5, Math.floor(height / 2));
  if (isWalkablePoint(world, centerX, centerY)) return { x: centerX, y: centerY };
  for (let radius = 1; radius <= 16; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
        const candidateX = centerX + offsetX;
        const candidateY = centerY + offsetY;
        if (isWalkablePoint(world, candidateX, candidateY)) return { x: candidateX, y: candidateY };
      }
    }
  }
  return null;
}

function portalSide(world, x, y) {
  const width = Number(world?.w || 1);
  const height = Number(world?.h || 1);
  const distances = [
    ["left", Number(x)], ["right", width - 1 - Number(x)],
    ["top", Number(y)], ["bottom", height - 1 - Number(y)],
  ];
  return distances.reduce((nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest)[0];
}

function oppositePortalSide(side) {
  return ({ left: "right", right: "left", top: "bottom", bottom: "top" })[side] || "left";
}

function portalPointOnSide(world, side, anchorX, anchorY) {
  const width = Number(world?.w || MAP_MIN_W);
  const height = Number(world?.h || MAP_MIN_H);
  const clampX = (value) => clampInteger(value, PORTAL_EDGE_MARGIN, width - PORTAL_EDGE_MARGIN - 1, Math.floor(width / 2));
  const clampY = (value) => clampInteger(value, PORTAL_EDGE_MARGIN, height - PORTAL_EDGE_MARGIN - 1, Math.floor(height / 2));
  if (side === "right") return { x: width - PORTAL_EDGE_MARGIN - 1, y: clampY(anchorY) };
  if (side === "top") return { x: clampX(anchorX), y: PORTAL_EDGE_MARGIN };
  if (side === "bottom") return { x: clampX(anchorX), y: height - PORTAL_EDGE_MARGIN - 1 };
  return { x: PORTAL_EDGE_MARGIN, y: clampY(anchorY) };
}

function portalExitPoint(world, entrance, side) {
  const offset = { left: [PORTAL_EXIT_OFFSET, 0], right: [-PORTAL_EXIT_OFFSET, 0], top: [0, PORTAL_EXIT_OFFSET], bottom: [0, -PORTAL_EXIT_OFFSET] }[side] || [PORTAL_EXIT_OFFSET, 0];
  const width = Number(world?.w || MAP_MIN_W);
  const height = Number(world?.h || MAP_MIN_H);
  return {
    x: clampInteger(entrance.x + offset[0], 4, width - 5, Math.floor(width / 2)),
    y: clampInteger(entrance.y + offset[1], 4, height - 5, Math.floor(height / 2)),
  };
}

function touchAdminWorld(world) {
  world.managedBy = "ADMIN";
  world.version = Number(world.version || 0) + 1;
  world.updatedAt = new Date().toISOString();
}

function normalizeWorldPayload(payload, existing = null) {
  const code = String(payload?.code || existing?.code || "")
    .trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (code.length < 3 || code.length > 40) throw new Error("Mã map phải có 3-40 ký tự a-z, 0-9 hoặc _");
  const width = clampInteger(payload?.w ?? payload?.width, MAP_MIN_W, MAP_MAX_SIZE, existing?.w || 600);
  const height = clampInteger(payload?.h ?? payload?.height, MAP_MIN_H, MAP_MAX_SIZE, existing?.h || 400);
  const layers = deriveLayers(payload, width, height);
  const spawnX = clampInteger(payload?.spawnX, 8, width - 9, Math.floor(width / 2));
  const spawnY = clampInteger(payload?.spawnY, 8, height - 9, Math.floor(height / 2));
  const type = String(payload?.type || existing?.type || "PLAIN").toUpperCase();
  const status = String(payload?.status || existing?.status || (existing ? "PUBLISHED" : "DRAFT")).toUpperCase() === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const recommendedRealmMin = clampInteger(payload?.recommendedRealmMin, 1, 13, existing?.recommendedRealmMin || 1);
  const recommendedRealmMax = clampInteger(payload?.recommendedRealmMax, recommendedRealmMin, 13, Math.max(recommendedRealmMin, existing?.recommendedRealmMax || 13));
  for (let y = spawnY - 8; y <= spawnY + 8; y += 1) {
    for (let x = spawnX - 8; x <= spawnX + 8; x += 1) {
      if (Math.hypot(x - spawnX, y - spawnY) > 8) continue;
      layers.ground[y][x] = 0;
      layers.objects[y][x] = -1;
      layers.collision[y][x] = 0;
      layers.elevation[y][x] = Math.min(1, layers.elevation[y][x]);
    }
  }
  return {
    ...(existing || {}),
    id: existing?.id || `world_${code}`,
    code,
    tenMap: String(payload?.tenMap || payload?.name || existing?.tenMap || code).trim().slice(0, 80),
    type,
    biome: String(payload?.biome || existing?.biome || "PLAINS").toUpperCase(),
    status,
    regionId: String(payload?.regionId || existing?.regionId || "ADMIN_PUBLISHED").trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_").slice(0, 60),
    tier: clampInteger(payload?.tier, 0, 99, existing?.tier || 0),
    recommendedRealmMin,
    recommendedRealmMax,
    tags: normalizeStringList(payload?.tags ?? existing?.tags),
    seed: String(payload?.seed || existing?.seed || code).slice(0, 80),
    w: width,
    h: height,
    isDefault: payload?.isDefault === undefined ? Boolean(existing?.isDefault) : Boolean(payload.isDefault),
    spawnX,
    spawnY,
    jsonMap: layers.collision,
    layers: { ground: layers.ground, objects: layers.objects, elevation: layers.elevation },
    portals: normalizePortals(payload?.portals ?? existing?.portals, width, height),
    monsters: Array.isArray(payload?.monsters) ? payload.monsters : (existing?.monsters || []),
    monsterSpawns: normalizeMonsterSpawns(payload?.monsterSpawns ?? existing?.monsterSpawns, width, height),
    npcs: Array.isArray(payload?.npcs) ? payload.npcs : (existing?.npcs || []),
    rules: normalizeWorldRules(payload?.rules && typeof payload.rules === "object" ? payload.rules : (existing?.rules || {}), type),
    managedBy: "ADMIN",
    version: Number(existing?.version || 0) + 1,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

let isSavingAdminWorlds = false;
let pendingAdminWorldsSave = false;

async function persistAdminWorlds() {
  if (isSavingAdminWorlds) {
    pendingAdminWorldsSave = true;
    return;
  }
  isSavingAdminWorlds = true;
  try {
    const adminWorlds = worlds.filter((world) => world.managedBy === "ADMIN");
    const json = JSON.stringify(adminWorlds);
    const tmpFile = `${ADMIN_MAP_FILE}.tmp`;
    await fs.promises.writeFile(tmpFile, json, "utf8");
    await fs.promises.rename(tmpFile, ADMIN_MAP_FILE);
  } catch (error) {
    console.error("Failed to persist admin maps:", error.message);
  } finally {
    isSavingAdminWorlds = false;
    if (pendingAdminWorldsSave) {
      pendingAdminWorldsSave = false;
      persistAdminWorlds();
    }
  }
}

function loadAdminWorlds() {
  if (!fs.existsSync(ADMIN_MAP_FILE)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(ADMIN_MAP_FILE, "utf8"));
    for (const world of Array.isArray(saved) ? saved : []) {
      const index = worlds.findIndex((item) => item.code === world.code);
      if (index >= 0) worlds[index] = world;
      else worlds.push(world);
    }
  } catch (error) {
    console.error("Cannot load admin maps:", error.message);
  }
}

function adminMapMiddleware(req, res, next) {
  if (req.get("x-admin-key") !== ADMIN_MAP_KEY) return res.status(401).json({ error: "Admin key không hợp lệ" });
  next();
}

// Demo content registry: giữ cùng contract với DB tương lai, hiện chạy in-memory.
const adminContent = {
  quests: [
    { id: "quest_intro_001", name: "Rời Thanh Vân Trấn", status: "DRAFT", level: 1, steps: 3, reward: "Linh thạch nhỏ x10" },
    { id: "quest_wolf_001", name: "Dẹp bầy Hoang Sói", status: "DRAFT", level: 2, steps: 2, reward: "Huyết ngọc nhỏ x2" },
  ],
  npcs: [
    { id: "npc_huong_dan", name: "Lão Tu Sĩ", role: "GUIDE", mapCode: "thanh_van_tran", status: "ACTIVE" },
    { id: "npc_shop", name: "Chủ Tiệm", role: "SHOP", mapCode: "thanh_van_tran", status: "ACTIVE" },
  ],
  items,
  skills,
};

function adminCollection(name) {
  const key = String(name || "").toLowerCase();
  if (key === "accounts") return [...users.values()].map((user) => publicUser(user));
  return adminContent[key] || null;
}

function adminContentId(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
}

loadAdminWorlds();

function publicUser(user) {
  return { id: user.id, username: user.username };
}

function findUserByUsername(username) {
  return usersByUsername.get(String(username || "").toLowerCase());
}

function storeUser(user) {
  users.set(user.id, user);
  usersByUsername.set(String(user.username).toLowerCase(), user);
  if (!user.isDemo) scheduleGameStateSave();
  return user;
}

function scheduleGameStateSave() {
  const durableUsers = [...users.values()].filter((user) => !user.isDemo);
  const durableUserIds = new Set(durableUsers.map((user) => Number(user.id)));
  gameStateStore.schedule(() => ({
    schemaVersion: 1,
    users: durableUsers.map(({ id, username, passwordHash }) => ({ id, username, passwordHash })),
    players: [...players.values()]
      .filter((player) => durableUserIds.has(Number(player.userId)))
      .map((player) => JSON.parse(JSON.stringify(player))),
  }));
}

function worldSummary(world) {
  return {
    id: world.id,
    code: world.code,
    tenMap: world.tenMap,
    type: world.type,
    biome: world.biome || "LEGACY",
    w: world.w,
    h: world.h,
    isDefault: Boolean(world.isDefault),
    status: worldStatus(world),
    regionId: world.regionId || "UNASSIGNED",
    tier: Number(world.tier || 0),
    recommendedRealmMin: Number(world.recommendedRealmMin || 1),
    recommendedRealmMax: Number(world.recommendedRealmMax || 13),
    tags: normalizeStringList(world.tags),
    rules: normalizeWorldRules(world.rules, world.type),
    portalCount: (world.portals || []).length,
    monsterPackCount: (world.monsterSpawns || []).length,
    version: Number(world.version || 0),
  };
}

function sendCachedWorld(req, res, world) {
  if (!world) return res.status(404).json({ error: "World not found" });
  const cacheKey = `${world.code}:${world.version || 0}:${world.updatedAt || "seed"}`;
  let cached = worldResponseCache.get(cacheKey);
  if (!cached) {
    const json = Buffer.from(JSON.stringify(world));
    cached = {
      json,
      gzip: zlib.gzipSync(json, { level: zlib.constants.Z_BEST_SPEED }),
      etag: `W/\"${Buffer.byteLength(json)}-${world.version || 0}-${world.code}\"`,
    };
    worldResponseCache.set(cacheKey, cached);
  }
  res.set({
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    ETag: cached.etag,
    Vary: "Accept-Encoding",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (req.get("if-none-match") === cached.etag) return res.status(304).end();
  if (/\bgzip\b/i.test(req.get("accept-encoding") || "")) {
    res.set("Content-Encoding", "gzip");
    return res.send(cached.gzip);
  }
  return res.send(cached.json);
}

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const usernameKey = username.toLowerCase();
  const passwordBytes = Buffer.byteLength(password, "utf8");
  if (username.length < 3 || username.length > 20 || !/^[\p{L}\p{N}_-]+$/u.test(username)) {
    return res.status(400).json({ error: "Username phải dài 3-20 ký tự, chỉ gồm chữ, số, _ hoặc -" });
  }
  if (passwordBytes < 8 || passwordBytes > 72) {
    return res.status(400).json({ error: "Password phải dài ít nhất 8 byte và không quá 72 byte" });
  }
  if (findUserByUsername(username) || registeringUsernames.has(usernameKey)) {
    return res.status(409).json({ error: "Tên tài khoản đã tồn tại" });
  }

  registeringUsernames.add(usernameKey);
  let createdUser = null;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    if (findUserByUsername(username)) return res.status(409).json({ error: "Tên tài khoản đã tồn tại" });
    createdUser = { id: nextUserId++, username, passwordHash };
    storeUser(createdUser);
    await gameStateStore.flush();
    return res.json({ token: signToken(createdUser.id, createdUser.username), user: publicUser(createdUser) });
  } catch (error) {
    if (createdUser && users.get(createdUser.id) === createdUser) {
      users.delete(createdUser.id);
      usersByUsername.delete(usernameKey);
      scheduleGameStateSave();
    }
    console.error("Registration failed");
    return res.status(500).json({ error: "Không thể tạo tài khoản lúc này" });
  } finally {
    registeringUsernames.delete(usernameKey);
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (username.length > 20 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu sai" });
  }
  const user = findUserByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu sai" });
  res.json({ token: signToken(user.id, user.username), user: publicUser(user) });
});

app.post("/api/auth/demo", demoLimiter, (req, res) => {
  if (ENV.isProduction) return res.status(404).json({ error: "Không tìm thấy endpoint" });
  const username = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = { id: nextUserId++, username, passwordHash: "demo", isDemo: true };
  storeUser(user);
  res.json({ token: signToken(user.id, user.username), user: publicUser(user) });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: { id: req.userId, username: req.username } });
});

app.get("/api/worlds", (req, res) => res.json(worlds.filter(isWorldPublished).map(worldSummary)));
app.get("/api/worlds/default", (req, res) => sendCachedWorld(req, res, worlds.find((world) => world.isDefault && isWorldPublished(world)) || worlds.find(isWorldPublished)));
app.get("/api/worlds/by-code", (req, res) => {
  const world = worlds.find((item) => item.code === String(req.query.code || "").toLowerCase() && isWorldPublished(item));
  return sendCachedWorld(req, res, world);
});

app.get("/api/world-structure", (_req, res) => {
  const structure = getWorldStructure();
  const publishedWorlds = worlds.filter(isWorldPublished);
  const activeCodes = new Set(publishedWorlds.map((world) => String(world.code || "").toLowerCase()));
  for (const region of structure.regions) {
    for (const map of region.maps) {
      map.playable = activeCodes.has(map.code);
      if (map.playable) map.runtime = { code: map.code, version: publishedWorlds.find((world) => world.code === map.code)?.version || 1 };
    }
  }
  const knownCodes = new Set(structure.regions.flatMap((region) => region.maps.map((map) => map.code)));
  const unmanaged = publishedWorlds.filter((world) => !knownCodes.has(String(world.code || "").toLowerCase()));
  if (unmanaged.length) {
    structure.regions.push({
      id: "ADMIN_PUBLISHED",
      name: "Bản đồ mới xuất bản",
      terrain: "custom",
      order: 99,
      description: "Map được tạo từ Admin và chưa gắn vào vùng địa lý chính.",
      maps: unmanaged.map((world) => ({ code: world.code, name: world.tenMap || world.name || world.code, type: world.type || "CUSTOM", status: "ACTIVE", playable: true, tier: 0, level: "chưa định", role: "admin_published", connections: [], runtime: { code: world.code, version: world.version || 1 } })),
    });
  }
  res.json(structure);
});
app.get("/api/admin/worlds", adminMapMiddleware, (req, res) => {
  res.json(worlds.map((world) => ({
    ...worldSummary(world),
    spawnX: world.spawnX,
    spawnY: world.spawnY,
    managedBy: world.managedBy || "SEED",
    validation: validateWorldForPublish(world),
  })));
});
app.get("/api/admin/skill-vfx", adminMapMiddleware, (_req, res) => {
  res.set("Cache-Control", "no-store").json({ profiles: skillVfxProfileStore.list() });
});
app.post("/api/admin/skill-vfx", adminMapMiddleware, async (req, res) => {
  try {
    const result = await skillVfxProfileStore.create(req.body);
    if (!result.ok) return res.status(result.status).json({ error: result.message, code: result.code });
    return res.status(201).json(result);
  } catch (error) {
    console.error("Failed to persist skill VFX profile:", error.message);
    return res.status(500).json({ error: "Không lưu được cấu hình animation" });
  }
});
app.put("/api/admin/skill-vfx/:skillCode", adminMapMiddleware, async (req, res) => {
  try {
    const result = await skillVfxProfileStore.update(req.params.skillCode, req.body);
    if (!result.ok) return res.status(result.status).json({ error: result.message, code: result.code });
    return res.json(result);
  } catch (error) {
    console.error("Failed to persist skill VFX profile:", error.message);
    return res.status(500).json({ error: "Không lưu được cấu hình animation" });
  }
});
app.delete("/api/admin/skill-vfx/:skillCode", adminMapMiddleware, async (req, res) => {
  try {
    const result = await skillVfxProfileStore.remove(req.params.skillCode);
    if (!result.ok) return res.status(result.status).json({ error: result.message, code: result.code });
    return res.json(result);
  } catch (error) {
    console.error("Failed to persist skill VFX profile:", error.message);
    return res.status(500).json({ error: "Không lưu được cấu hình animation" });
  }
});
app.use("/api/admin/content", createAdminContentRouter({
  adminMapMiddleware,
  adminCollection,
  adminContent,
  normalizeId: adminContentId,
  contentService: AdminContentService,
}));
app.get("/api/admin/worlds/:code", adminMapMiddleware, (req, res) => {
  const world = worlds.find((item) => item.code === String(req.params.code || "").toLowerCase());
  if (!world) return res.status(404).json({ error: "Map không tồn tại" });
  return res.json({ ...world, status: worldStatus(world), validation: validateWorldForPublish(world) });
});
app.post("/api/admin/worlds", adminMapMiddleware, (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toLowerCase();
    if (worlds.some((world) => world.code === code)) return res.status(409).json({ error: "Mã map đã tồn tại" });
    const world = normalizeWorldPayload(req.body);
    const validation = validateWorldForPublish(world);
    if (isWorldPublished(world) && !validation.valid) return res.status(400).json({ error: "Map chưa đủ điều kiện xuất bản", validation });
    if (!isWorldPublished(world)) world.isDefault = false;
    if (world.isDefault) worlds.forEach((item) => { item.isDefault = false; });
    worlds.push(world);
    worldResponseCache.clear();
    persistAdminWorlds();
    res.status(201).json(world);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.put("/api/admin/worlds/:code", adminMapMiddleware, (req, res) => {
  try {
    const code = String(req.params.code || "").toLowerCase();
    const index = worlds.findIndex((world) => world.code === code);
    if (index < 0) return res.status(404).json({ error: "Map không tồn tại" });
    const world = normalizeWorldPayload({ ...req.body, code }, worlds[index]);
    const validation = validateWorldForPublish(world);
    if (isWorldPublished(world) && !validation.valid) return res.status(400).json({ error: "Map chưa đủ điều kiện xuất bản", validation });
    if (!isWorldPublished(world)) world.isDefault = false;
    if (world.isDefault) worlds.forEach((item, itemIndex) => { if (itemIndex !== index) item.isDefault = false; });
    worlds[index] = world;
    worldResponseCache.clear();
    persistAdminWorlds();
    res.json(world);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.get("/api/admin/worlds/:code/validate", adminMapMiddleware, (req, res) => {
  const world = worlds.find((item) => item.code === String(req.params.code || "").toLowerCase());
  if (!world) return res.status(404).json({ error: "Map không tồn tại" });
  return res.json(validateWorldForPublish(world));
});
app.post("/api/admin/worlds/:code/publish", adminMapMiddleware, (req, res) => {
  const world = worlds.find((item) => item.code === String(req.params.code || "").toLowerCase());
  if (!world) return res.status(404).json({ error: "Map không tồn tại" });
  const validation = validateWorldForPublish(world);
  if (!validation.valid) return res.status(400).json({ error: "Map chưa đủ điều kiện xuất bản", validation });
  world.status = "PUBLISHED";
  touchAdminWorld(world);
  worldResponseCache.clear();
  persistAdminWorlds();
  return res.json({ world, validation });
});
app.delete("/api/admin/worlds/:code", adminMapMiddleware, (req, res) => {
  const code = String(req.params.code || "").toLowerCase();
  const index = worlds.findIndex((world) => world.code === code);
  if (index < 0) return res.status(404).json({ error: "Map không tồn tại" });
  if (worlds[index].managedBy !== "ADMIN") return res.status(409).json({ error: "Không xóa trực tiếp map seed" });
  const seed = SEEDED_WORLDS.get(code);
  const removed = worlds[index];
  if (seed) worlds[index] = seed;
  else worlds.splice(index, 1);
  worldResponseCache.clear();
  persistAdminWorlds();
  res.json({ removed: removed.code, restoredSeed: Boolean(seed) });
});
app.post("/api/admin/portals/link", adminMapMiddleware, (req, res) => {
  try {
    const sourceCode = String(req.body?.sourceCode || "").trim().toLowerCase();
    const targetCode = String(req.body?.targetCode || "").trim().toLowerCase();
    const sourceWorld = worlds.find((world) => world.code === sourceCode);
    const targetWorld = worlds.find((world) => world.code === targetCode);
    if (!sourceWorld || !targetWorld) return res.status(404).json({ error: "Map nguồn hoặc map đích không tồn tại" });
    if (sourceCode === targetCode) return res.status(400).json({ error: "Portal liên map phải có map đích khác map nguồn" });

    const sourceX = Math.round(Number(req.body?.sourceX));
    const sourceY = Math.round(Number(req.body?.sourceY));
    const targetX = Math.round(Number(req.body?.targetX));
    const targetY = Math.round(Number(req.body?.targetY));
    if (!isWalkablePoint(sourceWorld, sourceX, sourceY)) return res.status(400).json({ error: "Điểm đặt portal nguồn bị chặn hoặc ngoài map" });
    if (![targetX, targetY].every(Number.isFinite)) return res.status(400).json({ error: "Tọa độ neo portal đích không hợp lệ" });

    // Portal is a border crossing: leaving from one side always enters through
    // the opposite side of the destination, then exits safely into that map.
    const sourceSide = portalSide(sourceWorld, sourceX, sourceY);
    const targetSide = oppositePortalSide(sourceSide);
    const targetEntrance = portalPointOnSide(targetWorld, targetSide, targetX, targetY);
    const targetArrival = portalExitPoint(targetWorld, targetEntrance, targetSide);
    const sourceArrival = portalExitPoint(sourceWorld, { x: sourceX, y: sourceY }, sourceSide);
    if (!isWalkablePoint(targetWorld, targetEntrance.x, targetEntrance.y) || !isWalkablePoint(targetWorld, targetArrival.x, targetArrival.y)) {
      return res.status(400).json({ error: "Cạnh map đích tại vị trí portal bị chặn; hãy đổi trục neo hoặc dọn địa hình" });
    }

    const requestedId = String(req.body?.id || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
    const id = requestedId || `portal_${sourceCode}_${targetCode}_${sourceX}_${sourceY}`;
    const previous = (sourceWorld.portals || []).find((portal) => portal.id === id);
    if (previous?.reverseId) {
      const previousTarget = worlds.find((world) => world.code === String(previous.denMap || previous.toMap || "").toLowerCase());
      if (previousTarget) {
        previousTarget.portals = (previousTarget.portals || []).filter((portal) => portal.id !== previous.reverseId);
        touchAdminWorld(previousTarget);
      }
    }

    const reverseId = `${id}__return`;
    const sourcePortal = {
      id, x: sourceX, y: sourceY,
      denMap: targetCode, toMap: targetCode, toX: targetArrival.x, toY: targetArrival.y,
      side: sourceSide, targetSide,
      tenMapDen: String(req.body?.targetName || targetWorld.tenMap || targetCode).slice(0, 80),
      bidirectional: Boolean(req.body?.twoWay),
      reverseId: Boolean(req.body?.twoWay) ? reverseId : null,
    };
    sourceWorld.portals = [...(sourceWorld.portals || []).filter((portal) => portal.id !== id), sourcePortal];
    touchAdminWorld(sourceWorld);

    let reversePortal = null;
    if (sourcePortal.bidirectional) {
      reversePortal = {
        id: reverseId, x: targetEntrance.x, y: targetEntrance.y,
        denMap: sourceCode, toMap: sourceCode, toX: sourceArrival.x, toY: sourceArrival.y,
        side: targetSide, targetSide: sourceSide,
        tenMapDen: String(req.body?.sourceName || sourceWorld.tenMap || sourceCode).slice(0, 80),
        bidirectional: true,
        reverseOf: id,
      };
      const matchingReverse = (targetWorld.portals || []).find((portal) => portal.id === reverseId
        || (String(portal.denMap || portal.toMap || "").toLowerCase() === sourceCode
          && Number(portal.x) === targetEntrance.x && Number(portal.y) === targetEntrance.y));
      if (matchingReverse) reversePortal.id = matchingReverse.id;
      sourcePortal.reverseId = reversePortal.id;
      targetWorld.portals = [...(targetWorld.portals || []).filter((portal) => portal.id !== reversePortal.id), reversePortal];
      touchAdminWorld(targetWorld);
    }

    worldResponseCache.clear();
    persistAdminWorlds();
    res.json({ source: sourcePortal, reverse: reversePortal, sourceVersion: sourceWorld.version, targetVersion: targetWorld.version });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.delete("/api/admin/worlds/:code/portals/:portalId", adminMapMiddleware, (req, res) => {
  const sourceWorld = worlds.find((world) => world.code === String(req.params.code || "").toLowerCase());
  if (!sourceWorld) return res.status(404).json({ error: "Map nguồn không tồn tại" });
  const portalId = String(req.params.portalId || "");
  const portal = (sourceWorld.portals || []).find((item) => item.id === portalId);
  if (!portal) return res.status(404).json({ error: "Portal không tồn tại" });
  sourceWorld.portals = sourceWorld.portals.filter((item) => item.id !== portalId);
  touchAdminWorld(sourceWorld);
  if (portal.reverseId) {
    const targetWorld = worlds.find((world) => world.code === String(portal.denMap || portal.toMap || "").toLowerCase());
    if (targetWorld) {
      targetWorld.portals = (targetWorld.portals || []).filter((item) => item.id !== portal.reverseId);
      touchAdminWorld(targetWorld);
    }
  }
  worldResponseCache.clear();
  persistAdminWorlds();
  res.json({ removed: portalId, reverseRemoved: portal.reverseId || null });
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
app.get("/api/skill-vfx", (_req, res) => res.set("Cache-Control", "no-store").json({ profiles: skillVfxProfileStore.list() }));
app.get("/api/balance", (req, res) => res.json(BALANCE));
app.get("/api/skills/catalog", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  res.json({
    skills,
    learnedSkills: player?.learnedSkills || [],
    equippedSkills: player?.equippedSkills || [],
  });
});
app.get("/api/monsters", (req, res) => res.json(monsterDefs));
app.get("/api/health", (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    users: users.size,
    players: players.size,
    sessions: socketRuntime?.sessions.size || 0,
    maps: worlds.length,
    memoryMb: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
    },
  });
});

function playerFor(userId) {
  return playersByUserId.get(Number(userId));
}

function storePlayer(player) {
  players.set(player.id, player);
  playersByUserId.set(Number(player.userId), player);
  return player;
}

const EQUIPMENT_SLOTS = ["weapon", "hat", "armor", "pants", "boots", "ring", "amulet", "belt", "gem"];

function emptyEquipment() {
  return Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
}

function normalizeEquipment(value) {
  const equipment = emptyEquipment();
  if (!value || typeof value !== "object") return equipment;
  for (const slot of EQUIPMENT_SLOTS) if (value[slot]) equipment[slot] = value[slot];
  return equipment;
}

function readInventory(player) {
  try {
    const value = typeof player.jsonIventory === "string" ? JSON.parse(player.jsonIventory || "[]") : player.inventory;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeInventory(player, inventory) {
  player.inventory = inventory;
  player.jsonIventory = JSON.stringify(inventory);
}

app.use("/api/quests", createQuestRouter({
  authenticate: authMiddleware,
  playerFor,
  players,
  questService: QuestService,
  items,
  readInventory,
}));

app.use("/api/player", createPlayerRouter({
  authenticate: authMiddleware,
  playerFor,
  players,
  playersByUserId,
  createPlayerId: () => nextPlayerId++,
  readInventory,
  writeInventory,
  combatPower,
  realms,
  breakthroughThreshold,
  minimumBreakthroughOvr,
  breakthroughGain,
  items,
  BALANCE,
  roots,
  worlds,
  isWorldPublished,
  nearestWalkablePoint,
  deriveStats,
  calcTuViNeeded,
  skills,
  emptyEquipment,
  normalizeEquipment,
  EQUIPMENT_SLOTS,
  gameStateStore,
  storePlayer,
  users,
}));
app.get(["/admin", "/admin/"], (req, res) => res.sendFile(path.join(__dirname, "public", "admin", "index.html")));
app.get(["/admin/map-editor", "/admin/map-editor/"], (req, res) => res.sendFile(path.join(__dirname, "public", "admin", "map-editor.html")));
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

socketRuntime = setupSocket(io, players, {
  getPlayerByUserId: playerFor,
  isDemoUser: (userId) => users.get(Number(userId))?.isDemo === true,
  getWorldByCode: (code) => worlds.find((world) => world.code === String(code || "").toLowerCase() && isWorldPublished(world)) || null,
  getDefaultWorld: () => worlds.find((world) => world.isDefault && isWorldPublished(world)) || worlds.find(isWorldPublished) || null,
});
const { broadcast, sessions } = socketRuntime;
const serverMessageTimer = setInterval(() => {
  if (sessions.size) broadcast("server_msg", { text: `[System] ${sessions.size} tu sĩ đang trực tuyến` });
}, 300000);
serverMessageTimer.unref?.();

let shutdownPromise = null;
function shutdownServer(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    clearInterval(serverMessageTimer);
    await new Promise((resolve) => io.close(resolve));
    await gameStateStore.flush();
    console.log(`Server stopped cleanly after ${signal}.`);
  })();
  return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdownServer(signal).catch((error) => {
      console.error("Graceful shutdown failed:", error.message);
      process.exitCode = 1;
    });
  });
}
if (process.send) {
  process.on("message", (message) => {
    if (message?.type !== "shutdown") return;
    process.disconnect();
    shutdownServer("IPC").catch((error) => {
      console.error("Graceful shutdown failed:", error.message);
      process.exitCode = 1;
    });
  });
}

const PORT = ENV.port;
server.listen(PORT, () => console.log(`Tu Tien demo running at http://localhost:${PORT}`));

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

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const users = new Map();
const usersByUsername = new Map();
const players = new Map();
const playersByUserId = new Map();
const worldResponseCache = new Map();
let socketRuntime = null;
let nextUserId = 1;
let nextPlayerId = 1;
const ADMIN_MAP_KEY = ENV.adminMapKey;
if (ENV.isProduction && ADMIN_MAP_KEY === "demo-admin") {
  console.warn("CẢNH BÁO: ADMIN_MAP_KEY đang sử dụng giá trị mặc định trong môi trường production!");
}
const ADMIN_MAP_FILE = path.join(__dirname, "data", "admin-worlds.json");
const MAP_MIN_W = 320;
const MAP_MIN_H = 240;
const MAP_MAX_SIZE = 1024;
const PORTAL_EDGE_MARGIN = 12;
const PORTAL_EXIT_OFFSET = 24;
const SEEDED_WORLDS = new Map(worlds.map((world) => [world.code, JSON.parse(JSON.stringify(world))]));

const authLimiter = createRateLimiter({ windowMs: 60000, max: 120, message: "Quá nhiều yêu cầu xác thực, vui lòng thử lại sau." });

app.use(cors());
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

function isWalkablePoint(world, x, y) {
  const tx = Math.round(Number(x));
  const ty = Math.round(Number(y));
  if (tx < 4 || ty < 4 || tx >= Number(world?.w || 0) - 4 || ty >= Number(world?.h || 0) - 4) return false;
  return Number(world?.jsonMap?.[ty]?.[tx]) !== 2;
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
    type: String(payload?.type || existing?.type || "PLAIN").toUpperCase(),
    biome: String(payload?.biome || existing?.biome || "PLAINS").toUpperCase(),
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
    monsterSpawns: Array.isArray(payload?.monsterSpawns) ? payload.monsterSpawns : (existing?.monsterSpawns || []),
    npcs: Array.isArray(payload?.npcs) ? payload.npcs : (existing?.npcs || []),
    rules: payload?.rules && typeof payload.rules === "object" ? payload.rules : (existing?.rules || {}),
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
  return user;
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
  if (username.length < 3 || password.length < 4) return res.status(400).json({ error: "Username tối thiểu 3 ký tự, password tối thiểu 4 ký tự" });
  if (findUserByUsername(username)) return res.status(409).json({ error: "Tên tài khoản đã tồn tại" });
  const user = { id: nextUserId++, username, passwordHash: await bcrypt.hash(password, 10) };
  storeUser(user);
  res.json({ token: signToken(user.id, user.username), user: publicUser(user) });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = findUserByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu sai" });
  res.json({ token: signToken(user.id, user.username), user: publicUser(user) });
});

app.post("/api/auth/demo", authLimiter, (req, res) => {
  const username = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = { id: nextUserId++, username, passwordHash: "demo" };
  storeUser(user);
  res.json({ token: signToken(user.id, user.username), user: publicUser(user) });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: { id: req.userId, username: req.username } });
});

app.get("/api/worlds", (req, res) => res.json(worlds.map(worldSummary)));
app.get("/api/worlds/default", (req, res) => sendCachedWorld(req, res, worlds.find((world) => world.isDefault)));
app.get("/api/worlds/by-code", (req, res) => {
  const world = worlds.find((item) => item.code === String(req.query.code || "").toLowerCase());
  return sendCachedWorld(req, res, world);
});

app.get("/api/world-structure", (_req, res) => {
  const structure = getWorldStructure();
  const activeCodes = new Set(worlds.map((world) => String(world.code || "").toLowerCase()));
  for (const region of structure.regions) {
    for (const map of region.maps) {
      map.playable = activeCodes.has(map.code);
      if (map.playable) map.runtime = { code: map.code, version: worlds.find((world) => world.code === map.code)?.version || 1 };
    }
  }
  const knownCodes = new Set(structure.regions.flatMap((region) => region.maps.map((map) => map.code)));
  const unmanaged = worlds.filter((world) => !knownCodes.has(String(world.code || "").toLowerCase()));
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
    id: world.id,
    code: world.code,
    tenMap: world.tenMap,
    type: world.type,
    biome: world.biome || "LEGACY",
    w: world.w,
    h: world.h,
    spawnX: world.spawnX,
    spawnY: world.spawnY,
    version: world.version || 0,
    managedBy: world.managedBy || "SEED",
  })));
});
app.post("/api/admin/worlds", adminMapMiddleware, (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toLowerCase();
    if (worlds.some((world) => world.code === code)) return res.status(409).json({ error: "Mã map đã tồn tại" });
    const world = normalizeWorldPayload(req.body);
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
    if (world.isDefault) worlds.forEach((item, itemIndex) => { if (itemIndex !== index) item.isDefault = false; });
    worlds[index] = world;
    worldResponseCache.clear();
    persistAdminWorlds();
    res.json(world);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
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

app.post("/api/player/cultivation/absorb", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });

  let amount = 0;
  if (req.body?.itemId) {
    const inventory = readInventory(player);
    const index = inventory.findIndex((item) => item.id === req.body.itemId);
    if (index < 0) return res.status(404).json({ error: "Không tìm thấy linh thạch trong túi đồ" });
    const item = inventory[index];
    amount = Math.max(1, Number(item.giaTriTuVi || item.value || 0));
    item.count = Number(item.count || 1) - 1;
    if (item.count <= 0) inventory.splice(index, 1);
    writeInventory(player, inventory);
  } else {
    return res.status(400).json({ error: "Chỉ được hấp thụ từ vật phẩm tu vi trong túi" });
  }

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
  const major = stage >= Number(realm.soTang || 9);
  const threshold = breakthroughThreshold(realm, stage);
  if (Number(player.tuViHienTai || 0) < threshold) return res.status(400).json({ error: "Tu vi chưa đủ", required: threshold, current: player.tuViHienTai || 0 });
  const currentPower = combatPower(player);
  const requiredPower = minimumBreakthroughOvr(realm, stage, major);
  if (currentPower < requiredPower) return res.status(400).json({ error: "OVR chưa đủ điều kiện đột phá", requiredOvr: requiredPower, currentOvr: currentPower });
  const next = major ? realms.find((item) => item.stt === Number(realm.stt) + 1) : null;
  if (major && !next) return res.status(400).json({ error: "Đã đạt cảnh giới tối cao" });
  if (major && realm.danPhaCanh) {
    const inventory = readInventory(player);
    const pillIndex = inventory.findIndex((item) => item.id === realm.danPhaCanh && Number(item.count || 0) > 0);
    if (pillIndex < 0) return res.status(400).json({ error: `Cần ${realm.danPhaCanh} để phá đại cảnh giới` });
    inventory[pillIndex].count -= 1;
    if (inventory[pillIndex].count <= 0) inventory.splice(pillIndex, 1);
    writeInventory(player, inventory);
  }
  const gain = breakthroughGain(realm, stage, major);
  player.tuViHienTai = Math.max(0, Number(player.tuViHienTai || 0) - threshold);
  player.stats = { ...(player.stats || {}), str: (player.stats?.str || 0) + gain.str, agi: (player.stats?.agi || 0) + gain.agi, vit: (player.stats?.vit || 0) + gain.vit, ene: (player.stats?.ene || 0) + gain.ene };
  if (major) {
    player.maCanhGioi = next.code; player.canhGioi = next; player.tenCanhGioi = next.tenCanhGioi; player.realm = next.stt;
    player.tangTuVi = 1;
  } else {
    player.tangTuVi = stage + 1;
  }
  const currentRealm = player.canhGioi || realm;
  player.tuViLenCap = breakthroughThreshold(currentRealm, player.tangTuVi);
  player.maxHp = 100 + player.stats.vit * 12;
  player.maxMp = 50 + player.stats.ene * 8;
  player.hp = Math.min(Number(player.hp || player.maxHp) + gain.vit * 12, player.maxHp);
  player.mp = Math.min(Number(player.mp || player.maxMp) + gain.ene * 8, player.maxMp);
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json({ player, result: { type: major ? "realm_breakthrough" : "stage_breakthrough", gain, major } });
});

app.get("/api/player/me", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
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
  const player = playerFor(req.userId);
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
    const definition = items.find((entry) => entry.id === item.id);
    if (!definition || (definition.type || definition.loai) !== "LINDAN") return res.status(400).json({ error: "Vật phẩm linh căn không hợp lệ" });
    const cap = BALANCE.progression.linhCan.itemCap;
    const current = Math.max(0, Number(player.tuViLinhCan || 0));
    const gain = Math.min(Math.max(0, Number(definition.tuViLinhCanVal || 0)), cap - current);
    if (gain <= 0) return res.status(400).json({ error: "Tu vi linh căn đã đạt giới hạn vật phẩm" });
    player.tuViLinhCan = current + gain;
    result.gain = gain;
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
  const price = Math.max(0, Math.floor(Number(item.giaMua) || 0));
  if (Number(player.xu || 0) < price) return res.status(400).json({ error: "Không đủ xu" });
  const inventory = readInventory(player);
  const existing = inventory.find((entry) => entry.id === item.id);
  if (existing) existing.count = Math.min(99, Number(existing.count || 0) + 1);
  else if (inventory.length < 40) inventory.push({ ...item, count: 1 });
  else return res.status(400).json({ error: "Túi đồ đầy" });
  player.xu -= price;
  writeInventory(player, inventory);
  players.set(player.id, player);
  res.json({ player, result: { type: "bought", itemId: item.id } });
});

app.post("/api/player/shop/sell", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  const inventory = readInventory(player);
  const index = Number(req.body?.index);
  if (!Number.isInteger(index) || index < 0 || index >= inventory.length) {
    return res.status(400).json({ error: "Vị trí vật phẩm không hợp lệ" });
  }
  const item = inventory[index];
  if (!item) return res.status(404).json({ error: "Item not found" });
  const price = Math.max(0, Math.floor(Number(item.giaBan) || 0));
  if (price <= 0) return res.status(400).json({ error: "Vật phẩm này không thể bán" });
  player.xu = Number(player.xu || 0) + price;
  item.count = Number(item.count || 1) - 1;
  if (item.count <= 0) inventory.splice(index, 1);
  writeInventory(player, inventory);
  players.set(player.id, player);
  res.json({ player, result: { type: "sold", itemId: item.id, price } });
});

app.post("/api/player", authMiddleware, (req, res) => {
  if (Number(req.body?.userId) !== req.userId) return res.status(403).json({ error: "Player không thuộc tài khoản" });
  const existing = playerFor(req.userId);
  if (existing) return res.status(409).json(existing);
  const inputStats = req.body?.stats || {};
  const stats = Object.fromEntries(["str", "agi", "vit", "ene"].map((key) => [key, Math.floor(Number(inputStats[key]) || 0)]));
  const statTotal = Object.values(stats).reduce((sum, value) => sum + value, 0);
  if (Object.values(stats).some((value) => value < BALANCE.creation.minStat) || statTotal !== (BALANCE.creation.minStat * 4 + BALANCE.creation.bonusPoints)) {
    return res.status(400).json({ error: `Phân bổ thuộc tính phải đủ ${BALANCE.creation.bonusPoints} điểm, mỗi chỉ số tối thiểu ${BALANCE.creation.minStat}.` });
  }

  const name = String(req.body?.name || "").trim().slice(0, 24) || `TuSĩ_${req.userId}`;
  const gender = ["FEMALE", "female", "nu"].includes(req.body?.gender) ? "FEMALE" : "MALE";
  const validRoot = roots.find((r) => r.id === req.body?.linhCan || r.code === req.body?.linhCan);
  const linhCan = validRoot ? validRoot.id : "KIM";
  const defaultRealm = realms.find((r) => r.stt === 1) || realms[0];
  const requestedMap = String(req.body?.mapCode || req.body?.mapId || "").trim().toLowerCase();
  const selectedWorld = (requestedMap && worlds.find((w) => w.code === requestedMap)) || worlds.find((w) => w.isDefault) || worlds[0];
  const rawX = Number(req.body?.x);
  const rawY = Number(req.body?.y);
  const spawnX = Number.isFinite(rawX) && isWalkablePoint(selectedWorld, Math.round(rawX), Math.round(rawY))
    ? Math.round(rawX)
    : Number(selectedWorld?.spawnX ?? 300);
  const spawnY = Number.isFinite(rawY) && isWalkablePoint(selectedWorld, Math.round(rawX), Math.round(rawY))
    ? Math.round(rawY)
    : Number(selectedWorld?.spawnY ?? 200);
  const derived = deriveStats(stats, {});

  const rootSkills = skills.filter((skill) => skill.linhCan === linhCan && skill.category !== "PASSIVE");
  const isAttack = (skill) => Number(skill.satThuong || 0) > 0 && skill.effect !== "heal" && !String(skill.effect || "").startsWith("buff_");
  const singleAttack = rootSkills.find((skill) => isAttack(skill) && Number(skill.dienRong || 0) <= 0);
  const areaAttack = rootSkills.find((skill) => isAttack(skill) && Number(skill.dienRong || 0) > 0);
  const initialSkills = [singleAttack, areaAttack, ...rootSkills.filter((skill) => skill !== singleAttack && skill !== areaAttack)].filter(Boolean).slice(0, 4);

  const player = {
    id: nextPlayerId++,
    userId: req.userId,
    name,
    gender,
    img: req.body?.img ? String(req.body.img) : null,
    linhCan,
    stats,
    derivedStats: derived,
    hp: derived.maxHp,
    maxHp: derived.maxHp,
    mp: derived.maxMp,
    maxMp: derived.maxMp,
    xu: 50,
    tuViHienTai: 0,
    tuViLenCap: calcTuViNeeded(defaultRealm, 1),
    tuViLinhCan: 0,
    tangTuVi: 1,
    maCanhGioi: defaultRealm.code,
    tenCanhGioi: defaultRealm.tenCanhGioi || defaultRealm.name || "Luyện Khí",
    canhGioi: defaultRealm,
    mapCode: selectedWorld.code,
    mapId: selectedWorld.code,
    x: spawnX,
    y: spawnY,
    learnedSkills: [...skills.filter((skill) => skill.linhCan === "COMMON"), ...rootSkills.slice(0, 2), ...skills.filter((skill) => skill.linhCan === linhCan && skill.category === "PASSIVE")].map((skill) => skill.code),
    equippedSkills: initialSkills.map((skill) => skill.code),
    skills: initialSkills,
    equipment: normalizeEquipment(req.body?.equipment),
    inventory: (() => { try { const value = typeof req.body?.jsonIventory === "string" ? JSON.parse(req.body.jsonIventory) : req.body?.inventory; return Array.isArray(value) ? value : []; } catch { return []; } })(),
    unspentStatPoints: 0,
  };
  player.jsonIventory = JSON.stringify(player.inventory);
  player.combatPower = combatPower(player);
  storePlayer(player);
  res.json(player);
});

app.post("/api/player/stats/allocate", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
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
  for (const key of ["name", "gender", "img"]) {
    if (req.body?.[key] !== undefined) player[key] = req.body[key];
  }
  if (req.body?.equipment !== undefined) player.equipment = normalizeEquipment(req.body.equipment);
  player.combatPower = combatPower(player);
  storePlayer(player);
  res.json(player);
});

app.get("/api/player/power", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json({ combatPower: combatPower(player) });
});

app.post("/api/player/skills/learn", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  const code = String(req.body?.skillCode || "");
  const skill = skills.find((item) => item.code === code);
  if (!player || !skill) return res.status(404).json({ error: "Skill not found" });
  if (skill.linhCan !== "COMMON" && skill.linhCan !== player.linhCan) return res.status(403).json({ error: "Skill không thuộc linh căn" });
  const playerRealm = Number(player.canhGioi?.stt || player.realm || 1);
  if (Number(skill.tier || 1) > playerRealm) {
    return res.status(400).json({ error: `Yêu cầu cảnh giới tầng ${skill.tier} trở lên để lĩnh hội thần thông này` });
  }
  player.learnedSkills = Array.from(new Set([...(player.learnedSkills || []), code]));
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json({ learnedSkills: player.learnedSkills, skill, combatPower: player.combatPower });
});

app.put("/api/player/skills/equip", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  const codes = Array.from(new Set(Array.isArray(req.body?.skillCodes) ? req.body.skillCodes : [])).slice(0, 4);
  if (!player) return res.status(404).json({ error: "Player not found" });
  const learned = new Set(player.learnedSkills || []);
  if (codes.some((code) => !learned.has(code))) return res.status(400).json({ error: "Chỉ được trang bị skill đã học" });
  const selectedSkills = codes.map((code) => skills.find((skill) => skill.code === code)).filter(Boolean);
  if (selectedSkills.some((skill) => String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE")) {
    return res.status(400).json({ error: "Skill bị động tự động hoạt động, không cần đưa vào ô kỹ năng" });
  }
  player.equippedSkills = codes;
  player.skills = selectedSkills;
  players.set(player.id, player);
  res.json({ equippedSkills: player.equippedSkills, skills: player.skills });
});

app.post("/api/player/equipment/equip", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  const inventory = readInventory(player);
  const index = Number.isInteger(req.body?.index) ? req.body.index : inventory.findIndex((item) => item.id === req.body?.itemId);
  const item = inventory[index];
  if (!item || (item.type || item.loai) !== "EQUIPMENT") return res.status(400).json({ error: "Vật phẩm không thể trang bị" });
  const slot = String(req.body?.slot || item.slot || "weapon");
  if (!EQUIPMENT_SLOTS.includes(slot)) return res.status(400).json({ error: "Ô trang bị không hợp lệ" });
  const equipment = normalizeEquipment(player.equipment);
  const previous = equipment[slot];
  equipment[slot] = { ...item, equipped: true };
  inventory.splice(index, 1);
  if (previous) inventory.push({ ...previous, equipped: false });
  player.equipment = equipment;
  writeInventory(player, inventory);
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json({ player, result: { type: "equipment_equipped", slot, itemId: item.id } });
});

app.post("/api/player/equipment/unequip", authMiddleware, (req, res) => {
  const player = playerFor(req.userId);
  const slot = String(req.body?.slot || "");
  if (!player) return res.status(404).json({ error: "Player not found" });
  if (!EQUIPMENT_SLOTS.includes(slot)) return res.status(400).json({ error: "Ô trang bị không hợp lệ" });
  const equipment = normalizeEquipment(player.equipment);
  const item = equipment[slot];
  if (!item) return res.status(404).json({ error: "Ô trang bị đang trống" });
  const inventory = readInventory(player);
  if (inventory.length >= 40) return res.status(400).json({ error: "Túi đồ đầy" });
  equipment[slot] = null;
  inventory.push({ ...item, equipped: false });
  player.equipment = equipment;
  writeInventory(player, inventory);
  player.combatPower = combatPower(player);
  players.set(player.id, player);
  res.json({ player, result: { type: "equipment_unequipped", slot, itemId: item.id } });
});

app.get(["/admin", "/admin/"], (req, res) => res.sendFile(path.join(__dirname, "public", "admin", "map-editor.html")));
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

socketRuntime = setupSocket(io, players, {
  getPlayerByUserId: playerFor,
  getWorldByCode: (code) => worlds.find((world) => world.code === String(code || "").toLowerCase()) || null,
  getDefaultWorld: () => worlds.find((world) => world.isDefault) || worlds[0] || null,
});
const { broadcast, sessions } = socketRuntime;
setInterval(() => {
  if (sessions.size) broadcast("server_msg", { text: `[System] ${sessions.size} tu sĩ đang trực tuyến` });
}, 300000);

const PORT = ENV.port;
server.listen(PORT, () => console.log(`Tu Tien demo running at http://localhost:${PORT}`));

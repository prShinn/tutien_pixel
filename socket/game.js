/**
 * socket/game.js
 * Real-time layer — Socket.io
 *
 * Events client → server:
 *   join_world   { token, mapId, x, y }
 *   move         { x, y, mapId }
 *   chat         { message }
 *   attack_effect { targetId, damage, mapId }
 *   map_change   { mapId, x, y }
 *
 * Events server → client:
 *   world_state  { players: [...] }  — on join
 *   player_join  { id, username, ... }
 *   player_leave { id }
 *   player_move  { id, x, y }
 *   player_map   { id, mapId, x, y }
 *   chat_message { id, username, message, ts }
 *   attack_fx    { attackerId, targetId, damage }
 *   server_msg   { text }
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const AUTH_BACKEND = process.env.AUTH_BACKEND || "http://localhost:8090";
const { skills, monsterDefs } = require("../data/mock-data");
const { deriveStats, affinityMultiplier, mitigateDamage } = require("../data/balance");

// In-memory session store: socketId → session
// Production: Redis pub/sub ở đây
const sessions = new Map();
const roomMonsters = new Map();
const MONSTER_ROOM_CAP = 6;
const MONSTER_MIN_ON_JOIN = 3;

function canSpawnAt(world, x, y) {
  const tiles = world?.jsonMap || world?.tiles;
  const tile = Array.isArray(tiles) ? tiles[y]?.[x] : 0;
  return x >= 1 && y >= 1 && x < Number(world?.w || 0) - 1 && y < Number(world?.h || 0) - 1
    && ![1, 2, 3, 5, 6].includes(Number(tile));
}

function createRoomMonster(roomId, world, serial) {
  const template = monsterDefs[serial % monsterDefs.length];
  let x = Math.floor(Number(world?.w || 40) / 2), y = Math.floor(Number(world?.h || 30) / 2);
  for (let i = 0; i < 30; i += 1) {
    const candidateX = 1 + Math.floor(Math.random() * Math.max(1, Number(world?.w || 40) - 2));
    const candidateY = 1 + Math.floor(Math.random() * Math.max(1, Number(world?.h || 30) - 2));
    if (canSpawnAt(world, candidateX, candidateY)) { x = candidateX; y = candidateY; break; }
  }
  const maxHp = Number(template.maxHp || template.hp || 1);
  return {
    ...template,
    id: `mon_${roomId}_${Date.now().toString(36)}_${serial}`,
    x, y, spawnX: x, spawnY: y,
    hp: maxHp, maxHp, dead: false,
  };
}

function ensureRoomMonsters(roomId, world) {
  if (!roomMonsters.has(roomId)) {
    roomMonsters.set(roomId, JSON.parse(JSON.stringify(world?.monsters || [])));
  }
  const monsters = roomMonsters.get(roomId);
  monsters.forEach((monster, index) => {
    monster.id = monster.id || `mon_${roomId}_seed_${index}`;
    monster.x = Number(monster.x ?? monster.spawnX ?? Math.floor(Number(world?.w || 40) / 2));
    monster.y = Number(monster.y ?? monster.spawnY ?? Math.floor(Number(world?.h || 30) / 2));
    monster.spawnX = Number(monster.spawnX ?? monster.x);
    monster.spawnY = Number(monster.spawnY ?? monster.y);
    monster.maxHp = Number(monster.maxHp || monster.hp || 1);
    monster.hp = Number(monster.hp ?? monster.maxHp);
    monster.dead = !!monster.dead;
  });
  let serial = monsters.length;
  while (monsters.length < MONSTER_MIN_ON_JOIN && serial < MONSTER_ROOM_CAP + 2) {
    monsters.push(createRoomMonster(roomId, world, serial++));
  }
  return monsters;
}

function monsterDistanceTiles(session, monster) {
  const mx = Number(monster.x ?? monster.spawnX ?? 0);
  const my = Number(monster.y ?? monster.spawnY ?? 0);
  return Math.hypot(mx - Number(session.x || 0), my - Number(session.y || 0));
}

function resolveMonsterAttack(player, monster, skillCode, session) {
  const skill = skillCode ? skills.find((item) => item.code === skillCode) : null;
  if (skillCode && (!skill || skill.category === "PASSIVE")) return { error: "Skill không hợp lệ" };
  if (skillCode && !((player.learnedSkills || []).includes(skillCode) || (player.skills || []).some((item) => item.code === skillCode || item.id === skillCode))) return { error: "Skill chưa học" };
  const now = Date.now();
  const cooldownMs = (skill?.hoiChieu || 1) * 1000;
  if (now - Number(session.lastAttackAt || 0) < cooldownMs) return { error: "Đang hồi chiêu" };
  const cost = Number(skill?.mpTieuHao || 0);
  if (Number(player.mp || 0) < cost) return { error: "Không đủ linh lực" };
  const derived = deriveStats(player.stats, player.equipment);
  const magic = skill?.type === "MAGIC";
  const attack = magic ? derived.mAtk : derived.pAtk;
  const scale = Number(skill?.satThuong || 1);
  const stat = Number(player.stats?.[magic ? "ene" : "str"] || 0);
  const affinity = affinityMultiplier(player.linhCan, monster.linhCan || monster.element || monster.nguHanh?.[0]);
  const defense = magic ? Number(monster.mDef ?? monster.def ?? 0) : Number(monster.pDef ?? monster.def ?? 0);
  const damage = Math.max(1, Math.floor(mitigateDamage((attack * scale + stat * 1.5) * affinity, defense)));
  player.mp = Math.max(0, Number(player.mp || 0) - cost);
  session.lastAttackAt = now;
  monster.hp = Math.max(0, Number(monster.hp || monster.maxHp || 1) - damage);
  monster.dead = monster.hp <= 0;
  let loot = null;
  if (monster.dead) {
    const xu = Math.max(1, Math.floor(Number(monster.level || 1) * 5));
    player.xu = Number(player.xu || 0) + xu;
    player.jsonIventory = JSON.stringify(player.inventory || []);
    monster.respawnAt = now + 10000;
    loot = { xu };
  }
  return { damage, hp: monster.hp, maxHp: monster.maxHp, dead: monster.dead, skillCode: skillCode || null, mp: player.mp, cooldownMs, loot };
}

function resolveSelfSkill(player, skillCode, session) {
  const skill = skills.find((item) => item.code === skillCode);
  if (!skill || skill.category === "PASSIVE") return { error: "Skill không hợp lệ" };
  if (!((player.learnedSkills || []).includes(skillCode) || (player.skills || []).some((item) => item.code === skillCode || item.id === skillCode))) return { error: "Skill chưa học" };
  const now = Date.now();
  const cooldownMs = (skill.hoiChieu || 1) * 1000;
  if (now - Number(session.lastSkillAt || 0) < cooldownMs) return { error: "Đang hồi chiêu" };
  const cost = Number(skill.mpTieuHao || 0);
  if (Number(player.mp || 0) < cost) return { error: "Không đủ linh lực" };
  const derived = deriveStats(player.stats, player.equipment);
  player.mp = Math.max(0, Number(player.mp || 0) - cost);
  let heal = 0;
  if (skill.effect === "heal") {
    heal = Math.floor(derived.mAtk * 0.5 + Number(player.tuViLinhCan || 0) * 0.3 + Number(skill.effectVal || 0));
    player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + heal);
  }
  if (skill.effect?.startsWith("buff_")) {
    player.buffs = { ...(player.buffs || {}), [skill.effect]: { value: skill.effectVal || 0, duration: (skill.thoiGianBuff || 4) * 1000 } };
  }
  session.lastSkillAt = now;
  return { skillCode, skillName: skill.name, hp: player.hp, mp: player.mp, heal, buffs: player.buffs || {}, cooldownMs };
}

async function requestJson(urlString, headers = {}) {
  const url = new URL(urlString);
  const lib = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(body || "{}");
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              json,
            });
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });

}

function setupSocket(io, players = new Map()) {
  // ── Auth middleware cho Socket.io ──────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Không có token"));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      return next();
    } catch (jwtError) {
      try {
        const authUrl = `${AUTH_BACKEND.replace(/\/+$/, "")}/api/auth/me`;
        const res = await requestJson(authUrl, {
          Authorization: `Bearer ${token}`,
        });
        if (!res.ok) throw new Error(`Remote auth failed: ${res.status}`);
        const data = res.json;
        if (!data?.user?.id || !data?.user?.username)
          throw new Error("Remote auth response missing user");
        socket.userId = data.user.id;
        socket.username = data.user.username;
        return next();
      } catch (remoteError) {
        console.warn(
          "Socket auth failed:",
          jwtError.message,
          remoteError.message,
        );
        return next(new Error("Token không hợp lệ"));
      }
    }
  });

  const mapCache = new Map();

  io.on("connection", (socket) => {
    // ── join_world ────────────────────────────────────────────────
    socket.on("join_world", async ({ mapCode, x = 26, y = 30 } = {}) => {
      if (sessions.has(socket.id)) return;
      let roomId = (mapCode || "").trim().toLowerCase();
      console.log(`[Socket] ${socket.username} gia nhập. MapCode nhận được: "${roomId || "RỖNG"}"`);

      const { ApiService } = require("./api-service");
      const token = socket.handshake.auth?.token;
      let worldData = null;

      // 1. Quy trình bắt buộc: Gọi API trực tiếp từ Backend (Bỏ qua cache để kiểm chứng)
      try {
        const endpoint = roomId
          ? `worlds/by-code?code=${roomId}`
          : `worlds/default`;

        console.log(`[Socket] ĐANG GỌI API BACKEND: ${endpoint}`);
        const res = await ApiService.get(endpoint, token);

        if (res && res.data && !res.data.error) {
          worldData = res.data;
          if (Array.isArray(worldData)) {
            worldData = { tiles: worldData, w: worldData[0]?.length || 0, h: worldData.length || 0 };
          }

          const backendCode = worldData.code || worldData.maMap || worldData.id;
          if (backendCode) roomId = String(backendCode).toLowerCase();
          
          // Cập nhật cache sau khi đã nạp thành công
          mapCache.set(roomId, worldData);
          console.log(`[Socket] Backend trả về Map: ${roomId} (${worldData.w}x${worldData.h})`);
        } else {
          console.error(`[Socket] Backend KHÔNG trả về dữ liệu hợp lệ cho ${endpoint}.`);
        }
      } catch (err) {
        console.error(`[Socket] Lỗi khi kết nối Backend:`, err.message);
      }


      if (!worldData) {
        console.error(`[Socket] Lỗi: Không có dữ liệu bản đồ cho ${socket.username}.`);
        return;
      }

      const monsters = ensureRoomMonsters(roomId, worldData);

      // Lấy tên nhân vật từ player data
      const playerData = [...players.values()].find((p) => p.userId === socket.userId);
      const session = {
        id: socket.id,
        userId: socket.userId,
        username: socket.username,
        name: playerData?.name || socket.username,
        gender: playerData?.gender || "MALE",
        img: playerData?.img || null,
        realm: playerData?.realm || 0,
        stage: playerData?.stage || playerData?.tangTuVi || 1,
        mapId: roomId,
        mapCode: roomId,
        x,
        y,
        joinedAt: Date.now(),
      };
      sessions.set(socket.id, session);

      // Join map room
      socket.join(`map:${roomId}`);

      // Gửi toàn bộ thông tin thế giới cho người chơi vừa vào
      const worldPlayers = [...sessions.values()].filter(
        (s) => s.mapId === roomId && s.id !== socket.id,
      );

      socket.emit("world_init", {
        map: worldData,
        player: playerData || null,
        players: worldPlayers,
        monsters
      });

      // Notify others on same map
      socket.to(`map:${roomId}`).emit("player_join", session);
    });

    // ── move ──────────────────────────────────────────────────────
    socket.on("move", ({ x, y, mapId, mapCode }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      const roomId = (mapId || mapCode || session.mapId).toLowerCase();
      const rawX = Number(x);
      const rawY = Number(y);
      const nextX = Math.floor(rawX);
      const nextY = Math.floor(rawY);
      const world = mapCache.get(roomId);
      const validBounds = !world || (nextX >= 0 && nextY >= 0 && nextX < Number(world.w || 999) && nextY < Number(world.h || 999));
      const validStep = Math.abs(rawX - Number(session.x)) <= 2.2 && Math.abs(rawY - Number(session.y)) <= 2.2;
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !validBounds || !validStep) {
        socket.emit("action_error", { action: "move", error: "Tọa độ di chuyển không hợp lệ" });
        return;
      }
      session.x = rawX;
      session.y = rawY;
      session.mapId = roomId;
      session.mapCode = roomId;
      const playerData = [...players.values()].find((p) => p.userId === socket.userId);
      if (playerData) { playerData.x = rawX; playerData.y = rawY; playerData.mapCode = roomId; playerData.mapId = roomId; players.set(playerData.id, playerData); }
      // Broadcast to same map only (không gửi cho chính mình)
      socket
        .to(`map:${roomId}`)
        .emit("player_move", { id: socket.id, x: rawX, y: rawY, mapCode: roomId });
    });

    // ── map_change ────────────────────────────────────────────────
    socket.on("map_change", async ({ mapId, mapCode, x, y }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      const roomId = (mapId || mapCode || session.mapId).toLowerCase();

      // Leave old room
      if (session.mapId) {
        socket.leave(`map:${session.mapId}`);
        socket.to(`map:${session.mapId}`).emit("player_leave", { id: socket.id });
      }

      const oldMapId = session.mapId;
      session.mapId = roomId;
      session.mapCode = roomId;
      session.x = x;
      session.y = y;
      socket.join(`map:${roomId}`);

      // CHỈ gửi world_init nếu thực sự đổi sang map KHÁC
      if (oldMapId === roomId) {
        return;
      }

      // 1. Đảm bảo Map đã được nạp vào RAM Server
      let worldData = mapCache.get(roomId);
      if (!worldData) {
        const { ApiService } = require("./api-service");
        try {
          const res = await ApiService.get(`worlds/by-code?code=${roomId}`);
          if (res.data && !res.data.error) {
            worldData = res.data;
            mapCache.set(roomId, worldData);
          }
        } catch (err) { }
      }

      const worldPlayers = [...sessions.values()].filter(
        (s) => s.mapId === roomId && s.id !== socket.id,
      );

      // Gửi dữ liệu map và state cho người chơi
      socket.emit("world_init", {
        map: worldData,
        player: [...players.values()].find((p) => p.userId === socket.userId) || null,
        players: worldPlayers,
        monsters: ensureRoomMonsters(roomId, worldData)
      });

      socket.to(`map:${roomId}`).emit("player_join", { ...session });
    });

    // ── chat ──────────────────────────────────────────────────────
    socket.on("chat", ({ message }) => {
      if (!message || typeof message !== "string") return;
      const clean = message.slice(0, 100).trim();
      if (!clean) return;
      const session = sessions.get(socket.id);
      if (!session) return;

      const payload = {
        id: socket.id,
        username: socket.username,
        message: clean,
        ts: Date.now(),
      };

      // Broadcast to same map
      socket.to(`map:${session.mapId}`).emit("chat_message", payload);
      socket.emit("chat_message", payload); // echo back to self
    });

    // ── attack_effect (visual sync only — damage tính server-side sau) ─
    socket.on("skill_request", ({ skillCode }) => {
      const session = sessions.get(socket.id);
      const player = [...players.values()].find((item) => item.userId === socket.userId);
      if (!session || !player) return;
      const result = resolveSelfSkill(player, skillCode, session);
      if (result.error) return socket.emit("action_error", { action: "skill", error: result.error });
      players.set(player.id, player);
      socket.emit("skill_result", result);
    });

    socket.on("attack_request", ({ targetId, skillCode, mapId }) => {
      const session = sessions.get(socket.id);
      const player = [...players.values()].find((item) => item.userId === socket.userId);
      if (!session) return socket.emit("action_error", { action: "combat", error: "Phiên chơi chưa sẵn sàng" });
      if (!player) return socket.emit("action_error", { action: "combat", error: "Không tìm thấy nhân vật" });
      const roomId = String(session.mapId || mapId || "").toLowerCase();
      const monsters = roomMonsters.get(roomId) || [];
      const monster = monsters.find((item) => String(item.id) === String(targetId));
      if (!monster) return socket.emit("action_error", { action: "combat", error: "Quái không còn trong bản đồ hiện tại" });
      if (monster.dead) return socket.emit("action_error", { action: "combat", error: "Quái đang hồi sinh" });
      const skill = skillCode ? skills.find((item) => item.code === skillCode) : null;
      const attackRange = Number(skill?.range || 2.0);
      if (monsterDistanceTiles(session, monster) > attackRange) {
        return socket.emit("action_error", { action: "combat", error: "Mục tiêu ngoài phạm vi kỹ năng" });
      }
      const result = resolveMonsterAttack(player, monster, skillCode, session);
      if (result.error) return socket.emit("action_error", { action: "combat", error: result.error });
      const hits = [{ targetId: monster.id, ...result }];
      let bonusXu = Number(result.loot?.xu || 0);
      const firstXu = bonusXu;
      const aoeRange = Number(skill?.dienRong || 0);
      if (aoeRange > 0) {
        for (const nearby of monsters) {
          if (nearby.id === monster.id || nearby.dead) continue;
          const distance = Math.hypot(Number(nearby.x ?? nearby.spawnX ?? 0) - Number(monster.x ?? monster.spawnX ?? 0), Number(nearby.y ?? nearby.spawnY ?? 0) - Number(monster.y ?? monster.spawnY ?? 0));
          if (distance > aoeRange) continue;
          const extraPlayer = { ...player, mp: Number(player.mp || 0) + Number(skill.mpTieuHao || 0) };
          const extra = resolveMonsterAttack(extraPlayer, nearby, skillCode, { ...session, lastAttackAt: 0 });
          if (!extra.error) {
            hits.push({ targetId: nearby.id, ...extra });
            bonusXu += Number(extra.loot?.xu || 0);
          }
        }
      }
      if (bonusXu > firstXu) player.xu = Number(player.xu || 0) + bonusXu - firstXu;
      player.combatPower = player.combatPower || 0;
      players.set(player.id, player);
      io.to(`map:${roomId}`).emit("combat_result", { attackerId: socket.id, attackerName: socket.username, targetId, ...result, skillName: skill?.name || null, hits, loot: bonusXu ? { xu: bonusXu } : null });
    });

    socket.on("attack_effect", ({ targetId, damage, mapId }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      socket.to(`map:${mapId}`).emit("attack_fx", {
        attackerId: socket.id,
        attackerName: socket.username,
        targetId,
        damage,
      });
    });

    // ── monster_sync (Host syncs monster positions to others) ──
    socket.on("monster_sync", ({ mapId, monsters }) => {
      const authoritative = roomMonsters.get(String(mapId || "").toLowerCase());
      if (authoritative && Array.isArray(monsters)) {
        for (const snapshot of monsters) {
          const monster = authoritative.find((item) => item.id === snapshot.id);
          if (!monster) continue;
          if (Number.isFinite(Number(snapshot.x))) monster.x = Number(snapshot.x);
          if (Number.isFinite(Number(snapshot.y))) monster.y = Number(snapshot.y);
        }
      }
      // Deprecated: client không còn được ghi đè HP/dead/loot của monster.
    });

    // ── disconnect ────────────────────────────────────────────────
    socket.on("disconnect", () => {
      const session = sessions.get(socket.id);
      if (session) {
        socket
          .to(`map:${session.mapId}`)
          .emit("player_leave", { id: socket.id });
        sessions.delete(socket.id);

        // Dọn dẹp nếu không còn ai trong map
        const leftInRoom = [...sessions.values()].filter(s => s.mapId === session.mapId).length;
        if (leftInRoom === 0) {
          roomMonsters.delete(session.mapId);
        }
      }
    });
  });

  // ── Server broadcast (có thể gọi từ nơi khác) ─────────────────
  const respawnTimer = setInterval(() => {
    for (const [mapId, monsters] of roomMonsters.entries()) {
      for (const monster of monsters) {
        if (!monster.dead || !monster.respawnAt || monster.respawnAt > Date.now()) continue;
        monster.dead = false;
        monster.hp = monster.maxHp || monster.hp || 1;
        monster.x = Number(monster.spawnX ?? monster.x ?? 0);
        monster.y = Number(monster.spawnY ?? monster.y ?? 0);
        delete monster.respawnAt;
        io.to(`map:${mapId}`).emit("monster_spawn", { monster });
      }
      const activePlayers = [...sessions.values()].some((session) => session.mapId === mapId);
      const world = mapCache.get(mapId);
      if (activePlayers && monsters.length < MONSTER_ROOM_CAP && Math.random() < 0.35) {
        const monster = createRoomMonster(mapId, world, monsters.length);
        monsters.push(monster);
        io.to(`map:${mapId}`).emit("monster_spawn", { monster });
      }
    }
  }, 5000);

  function broadcast(event, data) {
    io.emit(event, data);
  }

  function mapBroadcast(mapId, event, data) {
    io.to(`map:${mapId}`).emit(event, data);
  }

  return { broadcast, mapBroadcast, sessions, respawnTimer };
}

module.exports = { setupSocket };

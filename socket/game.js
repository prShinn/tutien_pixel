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
const { skills } = require("../data/mock-data");
const { deriveStats, affinityMultiplier, mitigateDamage } = require("../data/balance");

// In-memory session store: socketId → session
// Production: Redis pub/sub ở đây
const sessions = new Map();
const roomMonsters = new Map();

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
  return { skillCode, hp: player.hp, mp: player.mp, heal, buffs: player.buffs || {}, cooldownMs };
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

      if (!roomMonsters.has(roomId)) {
        roomMonsters.set(roomId, JSON.parse(JSON.stringify(worldData.monsters || [])));
      }

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
        monsters: roomMonsters.get(roomId) || []
      });

      // Notify others on same map
      socket.to(`map:${roomId}`).emit("player_join", session);
    });

    // ── move ──────────────────────────────────────────────────────
    socket.on("move", ({ x, y, mapId, mapCode }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      const roomId = (mapId || mapCode || session.mapId).toLowerCase();
      const nextX = Math.floor(Number(x));
      const nextY = Math.floor(Number(y));
      const world = mapCache.get(roomId);
      const validBounds = !world || (nextX >= 0 && nextY >= 0 && nextX < Number(world.w || 999) && nextY < Number(world.h || 999));
      const validStep = Math.abs(nextX - session.x) <= 2 && Math.abs(nextY - session.y) <= 2;
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !validBounds || !validStep) {
        socket.emit("action_error", { action: "move", error: "Tọa độ di chuyển không hợp lệ" });
        return;
      }
      session.x = nextX;
      session.y = nextY;
      session.mapId = roomId;
      session.mapCode = roomId;
      const playerData = [...players.values()].find((p) => p.userId === socket.userId);
      if (playerData) { playerData.x = nextX; playerData.y = nextY; playerData.mapCode = roomId; playerData.mapId = roomId; players.set(playerData.id, playerData); }
      // Broadcast to same map only (không gửi cho chính mình)
      socket
        .to(`map:${roomId}`)
        .emit("player_move", { id: socket.id, x: nextX, y: nextY, mapCode: roomId });
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
        monsters: roomMonsters.get(roomId) || []
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
      const roomId = String(mapId || session?.mapId || "").toLowerCase();
      const monster = (roomMonsters.get(roomId) || []).find((item) => String(item.id) === String(targetId));
      if (!session || !player || !monster || monster.dead) return socket.emit("action_error", { action: "combat", error: "Mục tiêu không hợp lệ" });
      const result = resolveMonsterAttack(player, monster, skillCode, session);
      if (result.error) return socket.emit("action_error", { action: "combat", error: result.error });
      player.combatPower = player.combatPower || 0;
      players.set(player.id, player);
      io.to(`map:${roomId}`).emit("combat_result", { attackerId: socket.id, attackerName: socket.username, targetId, ...result });
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
      // Deprecated: client không còn được ghi đè HP/dead/loot của monster.
      if (!roomMonsters.has(mapId) && Array.isArray(monsters)) {
        roomMonsters.set(mapId, JSON.parse(JSON.stringify(monsters.map((monster) => ({ ...monster, hp: monster.maxHp || monster.hp, dead: false })))));
      }
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
        delete monster.respawnAt;
        io.to(`map:${mapId}`).emit("monster_spawn", { monster });
      }
    }
  }, 1000);

  function broadcast(event, data) {
    io.emit(event, data);
  }

  function mapBroadcast(mapId, event, data) {
    io.to(`map:${mapId}`).emit(event, data);
  }

  return { broadcast, mapBroadcast, sessions, respawnTimer };
}

module.exports = { setupSocket };

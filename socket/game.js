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

// In-memory session store: socketId → session
// Production: Redis pub/sub ở đây
const sessions = new Map();
const roomMonsters = new Map();

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

      // Lấy tên nhân vật từ player data
      const playerData = [...players.values()].find((p) => p.userId === socket.userId);
      const session = {
        id: socket.id,
        userId: socket.userId,
        username: socket.username,
        name: playerData?.name || socket.username,
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
      session.x = x;
      session.y = y;
      session.mapId = roomId;
      session.mapCode = roomId;
      // Broadcast to same map only (không gửi cho chính mình)
      socket
        .to(`map:${roomId}`)
        .emit("player_move", { id: socket.id, x, y, mapCode: roomId });
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
      roomMonsters.set(mapId, monsters);
      socket.to(`map:${mapId}`).emit("monster_state_update", { monsters });
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
  function broadcast(event, data) {
    io.emit(event, data);
  }

  function mapBroadcast(mapId, event, data) {
    io.to(`map:${mapId}`).emit(event, data);
  }

  return { broadcast, mapBroadcast, sessions };
}

module.exports = { setupSocket };
